import { useState, useEffect, useCallback, useRef } from "react";
import { Platform, AppState, AppStateStatus } from "react-native";
import {
  AUDIO_SIZE_IS_KNOWN,
  AUDIO_TOTAL_SIZE_BYTES,
  BUNDLED_DICTIONARY_SEED,
  calculateAudioLibrarySize,
  estimateAudioLibrarySize,
  fetchDictionaryData,
} from "./useDictionary";
import type { DictionaryEntry } from "./useDictionary";
import {
  loadEntries,
  saveEntries,
  loadAudioIndex,
  saveAudioIndex,
  markSetupDone,
  getLastSync,
  setLastSync,
  ensureAudioDir,
  downloadAndSaveAudio,
  getLocalAudioBlobUrl,
  savePendingQueue,
  loadPendingQueue,
  clearPendingQueue,
  getAudioDownloadPaused,
  setAudioDownloadPaused,
  loadAudioUpdateQueue,
  saveAudioUpdateQueue,
} from "./useOfflineStorage";
import {
  findDownloadedAudioUpdates,
  mergeAudioUpdateJobs,
  processAudioUpdateQueue,
} from "./audioUpdateUtils";
import { updateUserInfo } from "./useUserTracking";

export interface DownloadProgress {
  phase: "idle" | "data" | "audio" | "paused" | "done" | "error";
  current: number;
  total: number;
  currentWord: string;
  errorMsg?: string;
}

export interface OfflineDictionary {
  entries: DictionaryEntry[];
  isLoading: boolean;
  isSetupDone: boolean;
  isOfflineReady: boolean;
  isOnline: boolean;
  lastSync: Date | null;
  downloadProgress: DownloadProgress;
  audioIndex: Set<string>;
  audioSizeBytes: number;
  audioSizeKnown: boolean;
  startDownload: (opts?: { audioOnly?: boolean }) => Promise<void>;
  cachePlayedAudio: (entry: DictionaryEntry) => Promise<void>;
  sync: () => Promise<{ newCount: number; audioCount: number }>;
  getAudioSource: (entry: DictionaryEntry) => Promise<string | null>;
  refetchOnline: () => Promise<void>;
  skipSetup: () => Promise<void>;
}

const SYNC_INTERVAL_MS = 2 * 60 * 1000;
const AUDIO_CHUNK_SIZE = 96;
const AUDIO_CONCURRENCY = Platform.OS === "android" ? 8 : Platform.OS === "web" ? 6 : 12;
const PROGRESS_THROTTLE_MS = 250;
const EMPTY_PROGRESS: DownloadProgress = {
  phase: "idle",
  current: 0,
  total: 0,
  currentWord: "",
};

function audioIdFor(entry: DictionaryEntry): string {
  return entry.audioId || entry.id;
}

function uniqueAudioEntries(entries: DictionaryEntry[]): DictionaryEntry[] {
  const unique = new Map<string, DictionaryEntry>();
  for (const entry of entries) {
    if (!entry.audioUrl) continue;
    const id = audioIdFor(entry);
    if (!unique.has(id)) unique.set(id, entry);
  }
  return Array.from(unique.values());
}

async function fingerprintEntries(entries: DictionaryEntry[], chunkSize = 500): Promise<string> {
  // Compact dual hash avoids serialization and yields between batches to keep UI interactions responsive.
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  const add = (value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      const code = value.charCodeAt(i);
      h1 = Math.imul(h1 ^ code, 0x01000193);
      h2 = Math.imul(h2 ^ code, 0x85ebca6b);
    }
    h1 = Math.imul(h1 ^ 31, 0x01000193);
    h2 = Math.imul(h2 ^ 31, 0x85ebca6b);
  };

  for (let offset = 0; offset < entries.length; offset += chunkSize) {
    const end = Math.min(entries.length, offset + chunkSize);
    for (let index = offset; index < end; index += 1) {
      const entry = entries[index];
      add(entry.coptic);
      add(entry.arabic);
      add(entry.english ?? "");
      add(entry.french ?? "");
      add(entry.german ?? "");
      add(entry.gender ?? "");
      add(entry.origin ?? "");
      add(entry.wordType ?? "");
      add(entry.audioUrl ?? "");
    }
    if (end < entries.length) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return `${entries.length}:${h1 >>> 0}:${h2 >>> 0}`;
}

const initialEntries = BUNDLED_DICTIONARY_SEED;

async function runConcurrent<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

async function downloadAudioBatch(
  batch: DictionaryEntry[],
  initialIndex: Set<string>,
  onProgress: (downloadedCount: number) => void,
  abortRef: { current: boolean }
): Promise<Set<string>> {
  const downloaded = new Set(initialIndex);
  await runConcurrent(batch, AUDIO_CONCURRENCY, async (entry) => {
    if (abortRef.current || !entry.audioUrl) return;
    const id = audioIdFor(entry);
    if (downloaded.has(id)) return;
    const ok = await downloadAndSaveAudio(id, entry.audioUrl);
    if (ok) {
      downloaded.add(id);
      onProgress(downloaded.size);
    }
  });
  return downloaded;
}

export function useOfflineDictionary(): OfflineDictionary {
  // Seed محلي يُعرض قبل أي اتصال أو قراءة من القرص.
  const [entries, setEntries] = useState<DictionaryEntry[]>(initialEntries);
  const [isLoading] = useState(false);
  const [isSetupDoneState, setIsSetupDoneState] = useState(true);
  const [isOfflineReady, setIsOfflineReady] = useState(initialEntries.length > 0);
  const [isOnline, setIsOnline] = useState(false);
  const [lastSync, setLastSyncState] = useState<Date | null>(null);
  const [audioIndex, setAudioIndex] = useState<Set<string>>(new Set());
  const [audioSizeBytes, setAudioSizeBytes] = useState(AUDIO_TOTAL_SIZE_BYTES);
  const [audioSizeKnown, setAudioSizeKnown] = useState(AUDIO_SIZE_IS_KNOWN);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>(EMPTY_PROGRESS);

  const abortRef = useRef(false);
  const downloadingRef = useRef(false);
  const autoUpdatingRef = useRef(false);
  const audioSizeRequestRef = useRef(0);
  const entriesRef = useRef<DictionaryEntry[]>(initialEntries);
  // لا تحسب بصمة 16 ألف سجل داخل render؛ useRef يحفظ القيمة لكن وسيطته كانت تُنفّذ كل render.
  const signatureRef = useRef<string | null>(null);
  const audioIndexRef = useRef<Set<string>>(new Set());
  const audioCacheTasksRef = useRef<Map<string, Promise<void>>>(new Map());
  const syncInFlightRef = useRef<Promise<{ newCount: number; audioCount: number }> | null>(null);
  const lastSyncRef = useRef<Date | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProgressRef = useRef<DownloadProgress | null>(null);

  const publishProgress = useCallback((progress: DownloadProgress, immediate = false) => {
    pendingProgressRef.current = progress;
    if (immediate) {
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
      progressTimerRef.current = null;
      pendingProgressRef.current = null;
      setDownloadProgress(progress);
      return;
    }
    if (progressTimerRef.current) return;
    progressTimerRef.current = setTimeout(() => {
      progressTimerRef.current = null;
      const pending = pendingProgressRef.current;
      pendingProgressRef.current = null;
      if (pending) setDownloadProgress(pending);
    }, PROGRESS_THROTTLE_MS);
  }, []);

  const refreshAudioSize = useCallback((sourceEntries: DictionaryEntry[]) => {
    const requestId = ++audioSizeRequestRef.current;
    setAudioSizeBytes(estimateAudioLibrarySize(sourceEntries));
    setAudioSizeKnown(false);
    void calculateAudioLibrarySize(sourceEntries).then((result) => {
      if (requestId !== audioSizeRequestRef.current) return;
      setAudioSizeBytes(result.bytes);
      setAudioSizeKnown(result.known);
    }).catch(() => {
      if (requestId === audioSizeRequestRef.current) setAudioSizeKnown(false);
    });
  }, []);

  const runPendingAudioUpdates = useCallback(async (sourceEntries: DictionaryEntry[] = entriesRef.current) => {
    if (downloadingRef.current || autoUpdatingRef.current) return;
    const initialQueue = await loadAudioUpdateQueue();
    if (initialQueue.length === 0) return;

    autoUpdatingRef.current = true;
    downloadingRef.current = true;
    abortRef.current = false;
    const total = initialQueue.length;
    publishProgress({ phase: "audio", current: 0, total, currentWord: "" }, true);

    try {
      while (!abortRef.current) {
        const result = await processAudioUpdateQueue(sourceEntries, {
          maxItems: 48,
          concurrency: Platform.OS === "android" ? 8 : 6,
          shouldContinue: () => !abortRef.current,
        });
        const pending = await loadAudioUpdateQueue();
        const currentIndex = await loadAudioIndex();
        audioIndexRef.current = currentIndex;
        setAudioIndex(new Set(currentIndex));

        const completed = Math.max(0, total - pending.length);
        if (abortRef.current || result.paused) {
          await setAudioDownloadPaused(true);
          publishProgress({ phase: "paused", current: completed, total, currentWord: "" }, true);
          break;
        }
        if (pending.length === 0) {
          publishProgress({ phase: "done", current: total, total, currentWord: "" }, true);
          break;
        }
        if (result.completed === 0) {
          publishProgress({
            phase: "error",
            current: completed,
            total,
            currentWord: "",
            errorMsg: "Some changed audio files could not be refreshed yet; they will be retried while online.",
          }, true);
          break;
        }
        publishProgress({ phase: "audio", current: completed, total, currentWord: "" }, true);
      }
    } finally {
      downloadingRef.current = false;
      autoUpdatingRef.current = false;
    }
  }, [publishProgress]);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    audioIndexRef.current = audioIndex;
  }, [audioIndex]);

  const runSync = useCallback((showProgress: boolean) => {
    if (syncInFlightRef.current) return syncInFlightRef.current;

    if (showProgress) {
      setDownloadProgress((current) => current.phase === "audio" || current.phase === "paused"
        ? current
        : { phase: "data", current: 0, total: 0, currentWord: "" });
    }

    const task = (async () => {
      try {
        const freshEntries = await fetchDictionaryData();
        const nextSignature = await fingerprintEntries(freshEntries);
        const hasChanges = nextSignature !== signatureRef.current;
        let queuedAudioCount = 0;

        // Full replacement handles additions, edits, and deletions in the sheet.
        if (hasChanges) {
          const [downloadedIds, existingAudioQueue] = await Promise.all([
            loadAudioIndex(),
            loadAudioUpdateQueue(),
          ]);
          const newAudioJobs = findDownloadedAudioUpdates(
            entriesRef.current,
            freshEntries,
            downloadedIds,
            existingAudioQueue
          );
          const nextAudioQueue = mergeAudioUpdateJobs(existingAudioQueue, newAudioJobs, freshEntries);
          queuedAudioCount = newAudioJobs.length;
          await saveAudioUpdateQueue(nextAudioQueue);

          entriesRef.current = freshEntries;
          signatureRef.current = nextSignature;
          setEntries(freshEntries);
          setIsOfflineReady(freshEntries.length > 0);
          await saveEntries(freshEntries).catch(() => undefined);
          refreshAudioSize(freshEntries);
        }

        const latestAudioIndex = await loadAudioIndex();
        const audioIndexChanged =
          latestAudioIndex.size !== audioIndexRef.current.size ||
          [...latestAudioIndex].some((id) => !audioIndexRef.current.has(id));
        if (audioIndexChanged) {
          audioIndexRef.current = latestAudioIndex;
          setAudioIndex(latestAudioIndex);
        }

        const syncedAt = new Date();
        lastSyncRef.current = syncedAt;
        setLastSyncState(syncedAt);
        await setLastSync(syncedAt).catch(() => undefined);
        setIsOnline(true);
        void runPendingAudioUpdates(freshEntries).catch(() => undefined);

        if (showProgress) {
          setDownloadProgress((current) => current.phase === "audio" || current.phase === "paused"
            ? current
            : { phase: "done", current: 0, total: 0, currentWord: "" });
        }
        return { newCount: hasChanges ? freshEntries.length : 0, audioCount: queuedAudioCount };
      } catch (error) {
        setIsOnline(false);
        if (showProgress) {
          setDownloadProgress((current) => current.phase === "audio" || current.phase === "paused"
            ? current
            : {
                phase: "error",
                current: 0,
                total: 0,
                currentWord: "",
                errorMsg: error instanceof Error ? error.message : String(error),
              });
        }
        throw error;
      } finally {
        syncInFlightRef.current = null;
      }
    })();

    syncInFlightRef.current = task;
    return task;
  }, [refreshAudioSize, runPendingAudioUpdates]);

  // Load cached JSON without blocking the first render, then sync immediately in the background.
  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      const [localEntries, lastSyncDate, localAudioIndex, pendingIds, wasPaused] = await Promise.all([
        loadEntries(),
        getLastSync(),
        loadAudioIndex(),
        loadPendingQueue(),
        getAudioDownloadPaused(),
      ]);
      if (cancelled) return;

      const activeEntries = localEntries?.length ? localEntries : initialEntries;
      if (localEntries?.length) {
        entriesRef.current = localEntries;
        setEntries(localEntries);
        setIsOfflineReady(true);
        signatureRef.current = await fingerprintEntries(localEntries);
        refreshAudioSize(localEntries);
      } else {
        signatureRef.current = await fingerprintEntries(initialEntries);
      }

      lastSyncRef.current = lastSyncDate;
      setLastSyncState(lastSyncDate);
      const mergedLocalAudioIndex = new Set([...localAudioIndex, ...audioIndexRef.current]);
      audioIndexRef.current = mergedLocalAudioIndex;
      setAudioIndex(mergedLocalAudioIndex);
      setIsSetupDoneState(true);
      void markSetupDone().catch(() => undefined);

      const audioEntries = uniqueAudioEntries(activeEntries);
      const pendingAudioIds = new Set(pendingIds);
      const hasPendingAudio = audioEntries.some(
        (entry) => pendingAudioIds.has(audioIdFor(entry)) && !localAudioIndex.has(audioIdFor(entry))
      );
      if (hasPendingAudio) {
        // A closed app is treated as paused; explicit resume prevents surprise downloads.
        await setAudioDownloadPaused(true);
        const completed = audioEntries.reduce(
          (count, entry) => count + (localAudioIndex.has(audioIdFor(entry)) ? 1 : 0),
          0
        );
        setDownloadProgress({
          phase: "paused",
          current: completed,
          total: audioEntries.length,
          currentWord: "",
        });
      } else {
        if (pendingIds.length > 0) await clearPendingQueue();
        if (wasPaused) {
          await setAudioDownloadPaused(false);
        }
      }

      // Do not wait for connectivity checks: the bundled words are already visible.
      void runSync(false).catch(() => undefined);
    };

    void initialize().catch(() => {
      // The bundled in-memory seed remains available if local storage fails.
    });

    return () => {
      cancelled = true;
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    };
  }, [runSync, refreshAudioSize]);

  // Poll the sheet while active; each successful refresh replaces local data atomically.
  useEffect(() => {
    const refreshIfDue = () => {
      const last = lastSyncRef.current;
      const due = !last || !Number.isFinite(last.getTime()) || Date.now() - last.getTime() >= SYNC_INTERVAL_MS;
      if (due) void runSync(false).catch(() => undefined);
    };

    const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        void loadAudioIndex().then((latestAudioIndex) => {
          const changed =
            latestAudioIndex.size !== audioIndexRef.current.size ||
            [...latestAudioIndex].some((id) => !audioIndexRef.current.has(id));
          if (changed) {
            audioIndexRef.current = latestAudioIndex;
            setAudioIndex(latestAudioIndex);
          }
        });
        refreshIfDue();
      }
      else if (state === "background" || state === "inactive") setIsOnline(false);
    });
    const interval = setInterval(() => {
      if (AppState.currentState === "active") refreshIfDue();
    }, 30_000);

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [runSync]);

  // Calling the same action during a download pauses it. Completed files are checkpointed;
  // calling again after pause skips indexed files and resumes from the first missing one.
  const startDownload = useCallback(async (opts?: { audioOnly?: boolean }) => {
    if (downloadingRef.current) {
      abortRef.current = true;
      await setAudioDownloadPaused(true);
      while (downloadingRef.current) {
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
      }
      return;
    }

    downloadingRef.current = true;
    abortRef.current = false;
    await Promise.all([...audioCacheTasksRef.current.values()]);
    await setAudioDownloadPaused(false);

    try {
      const allAudio = uniqueAudioEntries(entriesRef.current.length ? entriesRef.current : initialEntries);
      const allAudioIds = new Set(allAudio.map(audioIdFor));
      let currentIndex = new Set(
        [...await loadAudioIndex()].filter((id) => allAudioIds.has(id))
      );
      await saveAudioIndex(currentIndex);
      const missing = allAudio.filter((entry) => !currentIndex.has(audioIdFor(entry)));
      const total = allAudio.length;
      const completedAtStart = total - missing.length;

      await savePendingQueue(missing.map(audioIdFor));
      await ensureAudioDir();
      publishProgress({
        phase: "audio",
        current: completedAtStart,
        total,
        currentWord: "",
      }, true);

      for (let offset = 0; offset < missing.length; offset += AUDIO_CHUNK_SIZE) {
        if (abortRef.current) break;
        const chunk = missing.slice(offset, offset + AUDIO_CHUNK_SIZE);
        currentIndex = await downloadAudioBatch(
          chunk,
          currentIndex,
          (downloadedCount) => publishProgress({
            phase: "audio",
            current: Math.min(total, downloadedCount),
            total,
            currentWord: "",
          }),
          abortRef
        );

        // Checkpoint after every small group: process termination will not restart the set.
        await saveAudioIndex(currentIndex);
        audioIndexRef.current = new Set(currentIndex);
        setAudioIndex(new Set(currentIndex));
        publishProgress({ phase: "audio", current: Math.min(total, currentIndex.size), total, currentWord: "" }, true);
        if (abortRef.current) break;
      }

      const remaining = allAudio.filter((entry) => !currentIndex.has(audioIdFor(entry)));
      await savePendingQueue(remaining.map(audioIdFor));

      if (abortRef.current && remaining.length > 0) {
        await setAudioDownloadPaused(true);
        publishProgress({
          phase: "paused",
          current: total - remaining.length,
          total,
          currentWord: "",
        }, true);
        return;
      }

      if (remaining.length > 0) {
        // Keep failed URLs in the persisted queue so the user can retry without redownloading successes.
        await setAudioDownloadPaused(true);
        publishProgress({
          phase: "paused",
          current: total - remaining.length,
          total,
          currentWord: "",
          errorMsg: `${remaining.length} audio files remain and can be retried.`,
        }, true);
        return;
      }

      await clearPendingQueue();
      await setAudioDownloadPaused(false);
      if (!opts?.audioOnly) {
        await markSetupDone();
        setIsSetupDoneState(true);
        updateUserInfo({ offlineSynced: true }).catch(() => undefined);
      }
      setIsOfflineReady(true);
      publishProgress({ phase: "done", current: total, total, currentWord: "" }, true);
    } catch (error) {
      publishProgress({
        phase: "error",
        current: 0,
        total: 0,
        currentWord: "",
        errorMsg: error instanceof Error ? error.message : String(error),
      }, true);
    } finally {
      downloadingRef.current = false;
    }
    if (!abortRef.current) void runPendingAudioUpdates(entriesRef.current).catch(() => undefined);
  }, [publishProgress, runPendingAudioUpdates]);

  const sync = useCallback(() => runSync(true), [runSync]);

  const cachePlayedAudio = useCallback(async (entry: DictionaryEntry): Promise<void> => {
    if (!entry.audioUrl) return;
    const audioId = audioIdFor(entry);
    if (audioIndexRef.current.has(audioId) || downloadingRef.current) return;

    const existingTask = audioCacheTasksRef.current.get(audioId);
    if (existingTask) return existingTask;

    const task = (async () => {
      const storedIndex = await loadAudioIndex();
      for (const cachedId of audioIndexRef.current) storedIndex.add(cachedId);
      if (storedIndex.has(audioId)) {
        audioIndexRef.current = storedIndex;
        setAudioIndex(new Set(storedIndex));
        return;
      }
      if (downloadingRef.current) return;

      const saved = await downloadAndSaveAudio(audioId, entry.audioUrl!);
      if (!saved) return;

      const nextIndex = new Set([...storedIndex, ...audioIndexRef.current, audioId]);
      await saveAudioIndex(nextIndex);
      audioIndexRef.current = nextIndex;
      setAudioIndex(new Set(nextIndex));
    })()
      .catch(() => undefined)
      .finally(() => audioCacheTasksRef.current.delete(audioId));

    audioCacheTasksRef.current.set(audioId, task);
    return task;
  }, []);

  const getAudioSource = useCallback(async (entry: DictionaryEntry): Promise<string | null> => {
    if (!entry.audioUrl) return null;
    const audioId = audioIdFor(entry);
    const local = await getLocalAudioBlobUrl(audioId).catch(() => null);
    if (local) return local;
    if (entry.id !== audioId) {
      const legacyLocal = await getLocalAudioBlobUrl(entry.id).catch(() => null);
      if (legacyLocal) return legacyLocal;
    }
    return entry.audioUrl;
  }, []);

  const refetchOnline = useCallback(async () => {
    try {
      await runSync(true);
    } catch {
      // Keep the local dictionary on network errors.
    }
  }, [runSync]);

  const skipSetup = useCallback(async () => {
    if (entriesRef.current.length === 0) {
      entriesRef.current = initialEntries;
      signatureRef.current = await fingerprintEntries(initialEntries);
      setEntries(initialEntries);
      setIsOfflineReady(initialEntries.length > 0);
      void saveEntries(initialEntries).catch(() => undefined);
    }
    await markSetupDone().catch(() => undefined);
    setIsSetupDoneState(true);
  }, []);

  return {
    entries,
    isLoading,
    isSetupDone: isSetupDoneState,
    isOfflineReady,
    isOnline,
    lastSync,
    downloadProgress,
    audioIndex,
    audioSizeBytes,
    audioSizeKnown,
    startDownload,
    cachePlayedAudio,
    sync,
    getAudioSource,
    refetchOnline,
    skipSetup,
  };
}
