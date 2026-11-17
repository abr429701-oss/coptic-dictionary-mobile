/**
 * buildBibleDB.js – Final Optimized Bible SQLite builder
 */
const fs = require('fs'), path = require('path'), Database = require('better-sqlite3');

// Source data is now in raw_bible_data to avoid bloating the app bundle
const rawDir = path.join(__dirname, '../raw_bible_data');
const assetDir = path.join(__dirname, '../assets/bible');
const out = path.join(assetDir, 'bible.db');
const tempOut = path.join(assetDir, 'bible_temp.db');

if (!fs.existsSync(assetDir)) fs.mkdirSync(assetDir, { recursive: true });
if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);

const db = new Database(tempOut);
db.pragma('page_size = 4096');
db.pragma('journal_mode = DELETE'); // No journal file left behind

db.exec(`
  CREATE TABLE verses (
    book INTEGER NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    lang INTEGER NOT NULL,
    text TEXT NOT NULL,
    PRIMARY KEY (book, chapter, verse, lang)
  ) WITHOUT ROWID;
`);

const LANG_MAP = { ar: 0, en: 1, fr: 2, de: 3, gr: 4, he: 5 };
const files = {
  ar: 'Arabic_VanDyck_SVD.json',
  en: 'English_KingJamesVersion.json',
  fr: 'French_LouisSegond_1910.json',
  de: 'German_Luther_1912.json',
  gr: 'Greek_Septuagint_TR.json',
  he: 'Hebrew_Full.json',
};

const ins = db.prepare(`INSERT INTO verses (book, chapter, verse, lang, text) VALUES (?, ?, ?, ?, ?)`);

db.transaction(() => {
  for (const [lang, file] of Object.entries(files)) {
    const fp = path.join(rawDir, file);
    if (!fs.existsSync(fp)) {
      console.log('Skipping ' + lang + ' (file not found in raw_bible_data)');
      continue;
    }
    console.log('Processing ' + lang + '...');
    const d = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const langId = LANG_MAP[lang];
    
    for (let b in d) {
      for (let ch in d[b]) {
        for (let v in d[b][ch]) {
          ins.run(+b, +ch, +v, langId, (d[b][ch][v] || '').trim());
        }
      }
    }
  }
})();

console.log('Vacuuming for minimum size...');
db.exec('VACUUM;');
db.close();

// Atomic swap with retry
let retries = 5;
while (retries > 0) {
  try {
    if (fs.existsSync(out)) fs.unlinkSync(out);
    fs.renameSync(tempOut, out);
    break;
  } catch (e) {
    console.log('Retry rename... (file locked by Expo bundler)');
    retries--;
    if (retries === 0) throw e;
    const waitTill = new Date(new Date().getTime() + 2000);
    while (waitTill > new Date()) {}
  }
}

const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(1);
console.log('Success! Bible Database Size: ' + mb + ' MB');
console.log('Location: assets/bible/bible.db');
