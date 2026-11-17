const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const sourceDbPath = path.join(__dirname, '../assets/bible/bible.db');
const outputDir = path.join(__dirname, '../assets/bible');

if (!fs.existsSync(sourceDbPath)) {
  console.error('❌ Source DB not found!');
  process.exit(1);
}

// الترتيب النهائي والشامل لجميع اللغات الموجودة في القاعدة
const langs = {
  0: 'ar',
  1: 'en',
  2: 'fr',
  3: 'de',
  4: 'gr',
  5: 'he',
  6: 'coptic' // إضافة القبطي الذي اكتشفناه
};

const mainDb = new Database(sourceDbPath);

for (const [id, name] of Object.entries(langs)) {
  const newDbPath = path.join(outputDir, `bible_${name}.db`);
  console.log(`🔨 Creating ${newDbPath} (ID: ${id})...`);
  
  if (fs.existsSync(newDbPath)) fs.unlinkSync(newDbPath);
  
  const newDb = new Database(newDbPath);
  newDb.exec('CREATE TABLE verses (lang INTEGER, book INTEGER, chapter INTEGER, verse INTEGER, text TEXT)');
  
  const verses = mainDb.prepare('SELECT * FROM verses WHERE lang = ?').all(id);
  
  if (verses.length === 0) {
    console.warn(`⚠️ Warning: No verses found for language ID ${id} (${name})`);
    newDb.close();
    continue;
  }

  const insert = newDb.prepare('INSERT INTO verses VALUES (?, ?, ?, ?, ?)');
  const insertMany = newDb.transaction((rows) => {
    for (const row of rows) insert.run(row.lang, row.book, row.chapter, row.verse, row.text);
  });
  
  insertMany(verses);
  newDb.exec('CREATE INDEX idx_lookup ON verses (book, chapter, verse)');
  newDb.close();
  console.log(`✅ ${name} database created with ${verses.length} rows.`);
}

mainDb.close();
console.log('🎉 Sharding completed! All 7 languages are ready.');
