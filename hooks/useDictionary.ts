import { useQuery } from "@tanstack/react-query";
import bundledRowsJson from "../assets/dictionary.seed.json";
import bundledMetaJson from "../assets/dictionary.seed.meta.json";

export interface DictionaryEntry {
  id: string;
  coptic: string;
  arabic: string;
  english?: string;
  french?: string;
  german?: string;
  origin?: string;
  gender?: string;
  wordType?: string;
  audioUrl?: string;
  audioId?: string;
  rawText: string;
  arabicMeanings: string[];
}

const SHEET_ID = "14pUNXtrHoMSU9lBWhKQZyspe-DDTMDudSiuL2sJQRUI";
const SHEET_NAME = "dictionary";
const SYNC_TIMEOUT_MS = 45_000;
const SHEET_QUERY = "select A,C,D,E,F,J,K,L";
const GITHUB_AUDIO_BASE =
  "https://raw.githubusercontent.com/abr429701-oss/coptic-dictionary-bot/audio/";

const bundledMeta = bundledMetaJson as {
  entryCount?: number;
  audioFileCount?: number;
  audioSizeBytes?: number | null;
  audioSizeKnown?: boolean;
};

/** حجم وعدد الروابط الصوتية الفريدة المحسوبة بواسطة مولّد البذرة المحلي. */
export const AUDIO_TOTAL_SIZE_BYTES = Number(bundledMeta.audioSizeBytes) || 0;
export const AUDIO_TOTAL_FILE_COUNT = Number(bundledMeta.audioFileCount) || 0;
export const AUDIO_SIZE_IS_KNOWN = bundledMeta.audioSizeKnown === true && AUDIO_TOTAL_SIZE_BYTES > 0;

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function normalizeAudioUrl(value: string): string | undefined {
  const audio = value.trim();
  if (!audio) return undefined;
  if (audio.startsWith("gh:")) return `${GITHUB_AUDIO_BASE}${audio.slice(3)}`;
  if (!isUrl(audio)) return undefined;

  const fileMatch = audio.match(/drive\.google\.com\/file\/d\/([^/?&]+)/);
  if (fileMatch) {
    return `https://drive.google.com/uc?export=download&id=${fileMatch[1]}`;
  }

  const openMatch = audio.match(/[?&]id=([^&]+)/);
  if (audio.includes("drive.google.com") && openMatch) {
    return `https://drive.google.com/uc?export=download&id=${openMatch[1]}`;
  }

  return audio;
}

function splitArabicMeanings(value: string): string[] {
  return value
    .split(/[،,;؛/\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function hashId(value: string): string {
  // Two independent 32-bit hashes provide a stable, compact ID across row inserts/deletes.
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ code, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}

/**
 * يحوّل صفوف JSON المختصرة إلى بنية القاموس التي تستخدمها الشاشات.
 * ترتيب الصف: قبطي، عربي، إنجليزي، فرنسي، ألماني، خانة متجاهلة، أصل J، نوع K، رابط الصوت L.
 */
function parseDictionaryRowsChunk(
  rows: unknown[][],
  occurrences: Map<string, number>
): DictionaryEntry[] {
  const entries: DictionaryEntry[] = [];

  for (const row of rows) {
    const value = (index: number): string => {
      const item = row[index];
      return item === null || item === undefined ? "" : String(item).trim();
    };

    const coptic = value(0);
    const arabic = value(1);
    if (!coptic && !arabic) continue;

    const english = value(2);
    const french = value(3);
    const german = value(4);
    const origin = value(6);
    const wordType = value(7);
    const audioUrl = normalizeAudioUrl(value(8));

    const identity = `${coptic}\u0000${arabic}\u0000${audioUrl ?? ""}`;
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);

    entries.push({
      id: `dictionary-${hashId(`${identity}\u0000${occurrence}`)}`,
      coptic,
      arabic,
      english: english || undefined,
      french: french || undefined,
      german: german || undefined,
      origin: origin || undefined,
      wordType: wordType || undefined,
      audioUrl,
      audioId: audioUrl ? `audio-${hashId(audioUrl)}` : undefined,
      rawText: [coptic, arabic].filter(Boolean).join(". "),
      arabicMeanings: splitArabicMeanings(arabic),
    });
  }

  return entries;
}

export function parseDictionaryRows(rows: unknown[][]): DictionaryEntry[] {
  return parseDictionaryRowsChunk(rows, new Map<string, number>());
}

const bundledRows = bundledRowsJson as unknown as unknown[][];
export const BUNDLED_DICTIONARY_SEED = parseDictionaryRows(bundledRows);
export const BUNDLED_AUDIO_ID_SET = new Set(
  BUNDLED_DICTIONARY_SEED.filter((entry) => !!entry.audioUrl).map((entry) => entry.audioId || entry.id)
);
export const BUNDLED_AUDIO_URL_SET = new Set(
  BUNDLED_DICTIONARY_SEED.map((entry) => entry.audioUrl).filter((url): url is string => !!url)
);

export interface AudioLibrarySize {
  bytes: number;
  known: boolean;
}

export function estimateAudioLibrarySize(entries: DictionaryEntry[]): number {
  if (AUDIO_TOTAL_FILE_COUNT <= 0 || AUDIO_TOTAL_SIZE_BYTES <= 0) return 0;
  const uniqueAudioCount = new Set(entries.map((entry) => entry.audioUrl).filter((url): url is string => !!url)).size;
  return Math.round((AUDIO_TOTAL_SIZE_BYTES / AUDIO_TOTAL_FILE_COUNT) * uniqueAudioCount);
}

const remoteAudioSizeCache = new Map<string, Promise<number | null>>();

async function getRemoteAudioSize(url: string): Promise<number | null> {
  const cached = remoteAudioSizeCache.get(url);
  if (cached) return cached;
  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(url, { method: "HEAD", signal: controller.signal });
      const length = Number(response.headers.get("content-length"));
      if (response.ok && Number.isFinite(length) && length > 0) return length;
      const contentRange = response.headers.get("content-range") ?? "";
      const rangeMatch = contentRange.match(/\/(\d+)$/);
      if (rangeMatch) return Number(rangeMatch[1]);
    } catch {
    } finally {
      clearTimeout(timeout);
    }

    const rangeController = new AbortController();
    const rangeTimeout = setTimeout(() => rangeController.abort(), 8_000);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        signal: rangeController.signal,
      });
      const contentRange = response.headers.get("content-range") ?? "";
      const rangeMatch = contentRange.match(/\/(\d+)$/);
      return response.status === 206 && rangeMatch ? Number(rangeMatch[1]) : null;
    } catch {
      return null;
    } finally {
      clearTimeout(rangeTimeout);
    }
  })();
  remoteAudioSizeCache.set(url, request);
  const result = await request;
  if (result === null) remoteAudioSizeCache.delete(url);
  return result;
}

/**
 * The bundled byte count is exact for the bundled URL set. When sheet links
 * differ, request sizes only for added/removed URLs instead of probing every
 * audio file in the 16k-entry dictionary.
 */
export async function calculateAudioLibrarySize(entries: DictionaryEntry[]): Promise<AudioLibrarySize> {
  const estimatedBytes = estimateAudioLibrarySize(entries);
  if (!AUDIO_SIZE_IS_KNOWN) return { bytes: estimatedBytes, known: false };
  const currentUrls = new Set(entries.map((entry) => entry.audioUrl).filter((url): url is string => !!url));
  const added = [...currentUrls].filter((url) => !BUNDLED_AUDIO_URL_SET.has(url));
  const removed = [...BUNDLED_AUDIO_URL_SET].filter((url) => !currentUrls.has(url));
  if (added.length === 0 && removed.length === 0) {
    return { bytes: AUDIO_TOTAL_SIZE_BYTES, known: true };
  }
  const changedUrls = [...added, ...removed];
  if (changedUrls.length > 100) return { bytes: estimatedBytes, known: false };
  const sizes: Array<number | null> = new Array(changedUrls.length).fill(null);
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= changedUrls.length) return;
      sizes[index] = await getRemoteAudioSize(changedUrls[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, changedUrls.length) }, worker));
  if (sizes.some((size) => size === null)) return { bytes: estimatedBytes, known: false };
  const sizeByUrl = new Map(changedUrls.map((url, index) => [url, sizes[index] as number]));
  const bytes = AUDIO_TOTAL_SIZE_BYTES +
    added.reduce((sum, url) => sum + (sizeByUrl.get(url) ?? 0), 0) -
    removed.reduce((sum, url) => sum + (sizeByUrl.get(url) ?? 0), 0);
  return { bytes: Math.max(0, bytes), known: true };
}

function parseGvizResponse(text: string): unknown[] {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error("استجابة الشيت غير صالحة");
  }

  const response = JSON.parse(text.slice(firstBrace, lastBrace + 1));
  const rows = response?.table?.rows;
  if (!Array.isArray(rows)) throw new Error("لم يعُد الشيت بصفوف بيانات");

  return rows;
}

async function parseGvizRowsInChunks(rows: unknown[], chunkSize = 400): Promise<DictionaryEntry[]> {
  const entries: DictionaryEntry[] = [];
  const occurrences = new Map<string, number>();
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize).map((rowValue) => {
      const row = rowValue as { c?: Array<{ v?: unknown; f?: unknown } | null> };
      const cells = row?.c ?? [];
      const selected = Array.from({ length: 8 }, (_, index) => {
        const cell = cells[index];
        const value = cell?.v ?? cell?.f;
        return value === null || value === undefined ? "" : String(value).trim();
      });
      return [...selected.slice(0, 5), "", ...selected.slice(5)];
    });
    entries.push(...parseDictionaryRowsChunk(chunk, occurrences));
    // Yield to the UI between batches; the controlled search field and buttons remain responsive.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return entries;
}

/** جلب الأعمدة الضرورية فقط؛ بيانات JSON المحلي تظل ظاهرة أثناء هذا الطلب. */
export async function fetchDictionaryData(): Promise<DictionaryEntry[]> {
  const cacheBuster = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const url =
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq` +
    `?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}` +
    `&headers=1&tq=${encodeURIComponent(SHEET_QUERY)}&nocache=${cacheBuster}&_=${cacheBuster}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });

    if (!response.ok) {
      throw new Error(`فشل جلب القاموس (${response.status})`);
    }

    const rows = parseGvizResponse(await response.text());
    const entries = await parseGvizRowsInChunks(rows);
    if (entries.length < 1_000) {
      throw new Error(`استجابة الشيت غير مكتملة (${entries.length} كلمة)`);
    }
    return entries;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("انتهت مهلة تحديث القاموس؛ ما زالت النسخة المحلية متاحة");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function useDictionary() {
  return useQuery<DictionaryEntry[]>({
    queryKey: ["dictionary_v4"],
    queryFn: fetchDictionaryData,
    initialData: BUNDLED_DICTIONARY_SEED,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });
}
