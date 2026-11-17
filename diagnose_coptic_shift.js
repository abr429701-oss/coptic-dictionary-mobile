const fs = require('fs');
const path = require('path');

const BIBLE_BOOKS = [
  // Old Testament
  { id: 'Genesis', num: 1, name: '01-Genesis.json' },
  { id: 'Exodus', num: 2, name: '02-Exodus.json' },
  { id: 'Leviticus', num: 3, name: '03-Leviticus.json' },
  { id: 'Numbers', num: 4, name: '04-Numbers.json' },
  { id: 'Deuteronomy', num: 5, name: '05-Deuteronomy.json' },
  { id: 'Joshua', num: 6, name: '06-Joshua.json' },
  { id: 'Judges', num: 7, name: '07-Judges.json' },
  { id: 'Ruth', num: 8, name: '08-Ruth.json' },
  { id: '1 Samuel', num: 9, name: '09-1_Samuel.json' },
  { id: '2 Samuel', num: 10, name: '10-2_Samuel.json' },
  { id: '1 Kings', num: 11, name: '11-1_Kings.json' },
  { id: '2 Kings', num: 12, name: '12-2_Kings.json' },
  { id: '1 Chronicles', num: 13, name: '13-1_Chronicles.json' },
  { id: '2 Chronicles', num: 14, name: '14-2_Chronicles.json' },
  { id: 'Ezra', num: 15, name: '15-Ezra.json' },
  { id: 'Nehemiah', num: 16, name: '16-Nehemiah.json' },
  { id: 'Esther', num: 17, name: '17-Esther.json' },
  { id: 'Job', num: 18, name: '18-Job.json' },
  { id: 'Psalms', num: 19, name: '19-Psalms.json' },
  { id: 'Proverbs', num: 20, name: '20-Proverbs.json' },
  { id: 'Ecclesiastes', num: 21, name: '21-Ecclesiastes.json' },
  { id: 'Song of Solomon', num: 22, name: '22-Song_of_Solomon.json' },
  { id: 'Isaiah', num: 23, name: '23-Isaiah.json' },
  { id: 'Jeremiah', num: 24, name: '24-Jeremiah.json' },
  { id: 'Lamentations', num: 25, name: '25-Lamentations.json' },
  { id: 'Ezekiel', num: 26, name: '26-Ezekiel.json' },
  { id: 'Daniel', num: 27, name: '27-Daniel.json' },
  { id: 'Hosea', num: 28, name: '28-Hosea.json' },
  { id: 'Joel', num: 29, name: '29-Joel.json' },
  { id: 'Amos', num: 30, name: '30-Amos.json' },
  { id: 'Obadiah', num: 31, name: '31-Obadiah.json' },
  { id: 'Jonah', num: 32, name: '32-Jonah.json' },
  { id: 'Micah', num: 33, name: '33-Micah.json' },
  { id: 'Nahum', num: 34, name: '34-Nahum.json' },
  { id: 'Habakkuk', num: 35, name: '35-Habakkuk.json' },
  { id: 'Zephaniah', num: 36, name: '36-Zephaniah.json' },
  { id: 'Haggai', num: 37, name: '37-Haggai.json' },
  { id: 'Zechariah', num: 38, name: '38-Zechariah.json' },
  { id: 'Malachi', num: 39, name: '39-Malachi.json' },
  // New Testament
  { id: 'Matthew', num: 40, name: '40-Matthew.json' },
  { id: 'Mark', num: 41, name: '41-Mark.json' },
  { id: 'Luke', num: 42, name: '42-Luke.json' },
  { id: 'John', num: 43, name: '43-John.json' },
  { id: 'Acts', num: 44, name: '44-Acts.json' },
  { id: 'Romans', num: 45, name: '45-Romans.json' },
  { id: '1 Corinthians', num: 46, name: '46-1_Corinthians.json' },
  { id: '2 Corinthians', num: 47, name: '47-2_Corinthians.json' },
  { id: 'Galatians', num: 48, name: '48-Galatians.json' },
  { id: 'Ephesians', num: 49, name: '49-Ephesians.json' },
  { id: 'Philippians', num: 50, name: '50-Philippians.json' },
  { id: 'Colossians', num: 51, name: '51-Colossians.json' },
  { id: '1 Thessalonians', num: 52, name: '52-1_Thessalonians.json' },
  { id: '2 Thessalonians', num: 53, name: '53-2_Thessalonians.json' },
  { id: '1 Timothy', num: 54, name: '54-1_Timothy.json' },
  { id: '2 Timothy', num: 55, name: '55-2_Timothy.json' },
  { id: 'Titus', num: 56, name: '56-Titus.json' },
  { id: 'Philemon', num: 57, name: '57-Philemon.json' },
  { id: 'Hebrews', num: 58, name: '58-Hebrews.json' },
  { id: 'James', num: 59, name: '59-James.json' },
  { id: '1 Peter', num: 60, name: '60-1_Peter.json' },
  { id: '2 Peter', num: 61, name: '61-2_Peter.json' },
  { id: '1 John', num: 62, name: '62-1_John.json' },
  { id: '2 John', num: 63, name: '63-2_John.json' },
  { id: '3 John', num: 64, name: '64-3_John.json' },
  { id: 'Jude', num: 65, name: '65-Jude.json' },
  { id: 'Revelation', num: 66, name: '66-Revelation.json' },
  // Deuterocanonical Books
  { id: 'Tobit', num: 67, name: '67-Tobit.json', deutero: true },
  { id: 'Judith', num: 68, name: '68-Judith.json', deutero: true },
  { id: 'Esther Additions', num: 69, name: '69-Esther_Additions.json', deutero: true },
  { id: 'Wisdom', num: 70, name: '70-Wisdom.json', deutero: true },
  { id: 'Sirach', num: 71, name: '71-Sirach.json', deutero: true },
  { id: 'Baruch', num: 72, name: '72-Baruch.json', deutero: true },
  { id: 'Daniel Additions', num: 73, name: '73-Daniel_Additions.json', deutero: true },
  { id: '1 Maccabees', num: 74, name: '74-1_Maccabees.json', deutero: true },
  { id: '2 Maccabees', num: 75, name: '75-2_Maccabees.json', deutero: true },
  { id: 'Psalm 151', num: 76, name: '76-Psalm_151.json', deutero: true }
];

console.log('Starting structural alignment diagnosis...');

for (const book of BIBLE_BOOKS) {
  const arPath = path.join(__dirname, 'assets', 'bible', 'ar', book.name);
  let copDir = book.deutero ? 'cop' : 'cb';
  const copPath = path.join(__dirname, 'assets', 'bible', copDir, book.name);

  if (!fs.existsSync(arPath)) {
    console.log(`❌ Reference file missing for: ${book.id} (${arPath})`);
    continue;
  }
  if (!fs.existsSync(copPath)) {
    console.log(`❌ Coptic file missing for: ${book.id} (${copPath})`);
    continue;
  }

  const arData = JSON.parse(fs.readFileSync(arPath, 'utf8'));
  const copData = JSON.parse(fs.readFileSync(copPath, 'utf8'));

  // Let's count verses per chapter
  const arChapters = {};
  const copChapters = {};

  arData.forEach(v => {
    arChapters[v.chapter] = (arChapters[v.chapter] || 0) + 1;
  });
  copData.forEach(v => {
    copChapters[v.chapter] = (copChapters[v.chapter] || 0) + 1;
  });

  let bookMismatch = false;
  const mismatches = [];

  for (const chNum of Object.keys(arChapters)) {
    const arCount = arChapters[chNum];
    const copCount = copChapters[chNum] || 0;

    if (arCount !== copCount) {
      bookMismatch = true;
      mismatches.push(`Ch ${chNum}: ar has ${arCount} verses, cop has ${copCount} verses.`);
    }
  }

  // Also check if Coptic has extra chapters
  for (const chNum of Object.keys(copChapters)) {
    if (!arChapters[chNum]) {
      bookMismatch = true;
      mismatches.push(`Ch ${chNum}: ar has 0 chapters, cop has ${copChapters[chNum]} verses.`);
    }
  }

  if (bookMismatch) {
    console.log(`\n⚠️ Mismatch in ${book.num}-${book.id} (ar total: ${arData.length}, cop total: ${copData.length})`);
    mismatches.slice(0, 10).forEach(m => console.log(`   ${m}`));
    if (mismatches.length > 10) {
      console.log(`   ... and ${mismatches.length - 10} more chapters.`);
    }
  } else {
    // console.log(`✅ ${book.id} is perfectly aligned!`);
  }
}
