const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../assets/bible/bible.db');
const outputPath = path.join(__dirname, '../assets/bible/bible.json');

if (!fs.existsSync(dbPath)) {
  console.error('❌ Bible database not found at:', dbPath);
  process.exit(1);
}

console.log('📖 Opening database...');
const db = new Database(dbPath);

console.log('🔍 Fetching verses...');
const verses = db.prepare('SELECT lang, book, chapter, verse, text FROM verses').all();
console.log(`✅ Fetched ${verses.length} verses.`);

console.log('💾 Saving to JSON (UTF-8)...');
// Ensure UTF-8 by using stringify and writeFileSync with utf8 encoding
const jsonString = JSON.stringify(verses);
fs.writeFileSync(outputPath, jsonString, 'utf8');

console.log('🎉 Done! Bible exported to:', outputPath);
db.close();
