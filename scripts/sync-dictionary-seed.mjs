import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const SHEET_ID = "14pUNXtrHoMSU9lBWhKQZyspe-DDTMDudSiuL2sJQRUI";
const SHEET_NAME = "dictionary";
const OUTPUT = resolve("assets/dictionary.seed.json");
const META_OUTPUT = resolve("assets/dictionary.seed.meta.json");
const QUERY = "select A,C,D,E,F,J,K,L";
const GITHUB_AUDIO_BASE =
  "https://raw.githubusercontent.com/abr429701-oss/coptic-dictionary-bot/audio/";
const GITHUB_TREE_URL =
  "https://api.github.com/repos/abr429701-oss/coptic-dictionary-bot/git/trees/audio?recursive=1";

function parseGviz(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Google Sheets returned an invalid GViz response.");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function cellValue(cell) {
  const value = cell?.v ?? cell?.f ?? "";
  return value === null || value === undefined ? "" : String(value).trim();
}

function decodePath(value) {
  try { return decodeURIComponent(value); }
  catch { return value; }
}

async function getAudioMetadata(outputRows) {
  const audioKeys = new Set();
  for (const row of outputRows) {
    const value = row[8];
    if (!value) continue;
    if (value.startsWith("gh:")) audioKeys.add(`gh:${decodePath(value.slice(3))}`);
    else if (value.startsWith(GITHUB_AUDIO_BASE)) {
      audioKeys.add(`gh:${decodePath(value.slice(GITHUB_AUDIO_BASE.length))}`);
    } else audioKeys.add(`url:${value}`);
  }

  const githubPaths = [...audioKeys]
    .filter((key) => key.startsWith("gh:"))
    .map((key) => key.slice(3));
  const externalCount = audioKeys.size - githubPaths.length;
  let totalBytes = 0;
  let matched = 0;

  if (githubPaths.length > 0) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await fetch(GITHUB_TREE_URL, {
        signal: controller.signal,
        headers: { Accept: "application/vnd.github+json", "User-Agent": "coptic-dictionary-seed-generator" },
      });
      if (!response.ok) throw new Error(`GitHub tree request failed: HTTP ${response.status}`);
      const tree = await response.json();
      const sizes = new Map(
        (tree?.tree ?? []).filter((item) => item.type === "blob").map((item) => [item.path, item.size])
      );
      for (const path of githubPaths) {
        const size = sizes.get(path);
        if (typeof size === "number") {
          totalBytes += size;
          matched += 1;
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  const audioSizeKnown = externalCount === 0 && matched === audioKeys.size && audioKeys.size > 0;
  return {
    audioFileCount: audioKeys.size,
    audioSizeBytes: audioSizeKnown ? totalBytes : null,
    audioSizeKnown,
  };
}

async function writeAtomically(path, data) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, data, "utf8");
  await rename(temporary, path);
}

async function main() {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`);
  url.searchParams.set("tqx", "out:json");
  url.searchParams.set("sheet", SHEET_NAME);
  url.searchParams.set("headers", "1");
  url.searchParams.set("tq", QUERY);
  url.searchParams.set("nocache", String(Date.now()));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  let response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Google Sheets request failed: HTTP ${response.status}`);
  }

  const data = parseGviz(await response.text());
  const sourceRows = data?.table?.rows;
  if (!Array.isArray(sourceRows)) throw new Error("The sheet has no data rows.");

  // الأعمدة المنتقاة: قبطي، عربي، إنجليزي، فرنسي، ألماني، أصل J، نوع K، صوت L.
  const outputRows = [];
  for (const row of sourceRows) {
    const cells = row?.c ?? [];
    const selected = Array.from({ length: 8 }, (_, index) => cellValue(cells[index]));
    if (!selected[0] && !selected[1]) continue;
    const values = [...selected.slice(0, 5), "", ...selected.slice(5)];
    if (values[8].startsWith(GITHUB_AUDIO_BASE)) {
      values[8] = `gh:${values[8].slice(GITHUB_AUDIO_BASE.length)}`;
    }
    outputRows.push(values);
  }

  if (outputRows.length < 1_000) {
    throw new Error(`Only ${outputRows.length} rows were returned; refusing to replace the seed.`);
  }

  let audioMeta;
  try {
    audioMeta = await getAudioMetadata(outputRows);
  } catch (error) {
    audioMeta = {
      audioFileCount: new Set(outputRows.map((row) => row[8]).filter(Boolean)).size,
      audioSizeBytes: null,
      audioSizeKnown: false,
    };
    console.warn("Audio sizes could not be verified; the app will not display a stale size.", error);
  }

  const meta = {
    entryCount: outputRows.length,
    ...audioMeta,
    generatedAt: new Date().toISOString(),
  };
  await writeAtomically(OUTPUT, JSON.stringify(outputRows));
  await writeAtomically(META_OUTPUT, `${JSON.stringify(meta, null, 2)}\n`);

  console.log(
    `Updated ${OUTPUT}: ${outputRows.length} entries, ${audioMeta.audioFileCount} unique audio files, ` +
    (audioMeta.audioSizeKnown ? `${audioMeta.audioSizeBytes} bytes.` : "audio size not verified.")
  );
}

main().catch((error) => {
  console.error("Failed to update the local dictionary seed:", error);
  process.exitCode = 1;
});
