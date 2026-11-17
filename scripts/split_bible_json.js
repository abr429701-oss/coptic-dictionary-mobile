const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const jsonPath = path.join(__dirname, '../assets/bible/bible.json');
const outputDir = path.join(__dirname, '../assets/bible');

if (!fs.existsSync(jsonPath)) {
    console.error('❌ JSON file not found!');
    process.exit(1);
}

console.log('📖 Reading JSON file...');
const rawData = fs.readFileSync(jsonPath, 'utf8');
const verses = JSON.parse(rawData);

const langNames = {
    0: 'ar',
    1: 'en',
    2: 'fr',
    3: 'de',
    4: 'gr',
    5: 'he',
    6: 'coptic'
};

const versesByLang = {};

console.log('🔍 Grouping verses by language...');
for (const v of verses) {
    if (!versesByLang[v.lang]) {
        versesByLang[v.lang] = [];
    }
    versesByLang[v.lang].push(v);
}

for (const [langId, rows] of Object.entries(versesByLang)) {
    const name = langNames[langId] || `lang_${langId}`;
    const dbPath = path.join(outputDir, `bible_${name}.db`);
    
    console.log(`🔨 Creating ${dbPath} with ${rows.length} rows...`);
    
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    
    const db = new Database(dbPath);
    db.exec('CREATE TABLE verses (lang INTEGER, book INTEGER, chapter INTEGER, verse INTEGER, text TEXT)');
    
    const insert = db.prepare('INSERT INTO verses (lang, book, chapter, verse, text) VALUES (?, ?, ?, ?, ?)');
    const insertMany = db.transaction((data) => {
        for (const r of data) {
            insert.run(r.lang, r.book, r.chapter, r.verse, r.text);
        }
    });
    
    insertMany(rows);
    db.exec('CREATE INDEX idx_lookup ON verses (book, chapter, verse)');
    db.close();
    console.log(`✅ ${name} database created successfully.`);
}

console.log('🎉 All languages sharded from JSON!');
