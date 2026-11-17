const fs = require('fs');
const path = require('path');

const syDir = 'assets/bible/sy';
const bookNames = {
  67: 'طوبيا (Tobit)',
  68: 'يهوديت (Judith)',
  69: 'تتمة أستير (Esther Additions)',
  70: 'الحكمة (Wisdom)',
  71: 'يشوع بن سيراخ (Sirach)',
  72: 'باروخ (Baruch)',
  73: 'تتمة دانيال (Daniel Additions)',
  74: 'المكابيين الأول (1 Maccabees)',
  75: 'المكابيين الثاني (2 Maccabees)',
  76: 'المزمور 151 (Psalm 151)'
};

console.log('🔍 Analyzing missing verses in Syriac Deuterocanonical Books...\n');

for (let id = 67; id <= 76; id++) {
  const name = bookNames[id];
  const syFile = fs.readdirSync(syDir).find(f => f.startsWith(`${id}-`));
  if (!syFile) continue;
  
  const syData = JSON.parse(fs.readFileSync(path.join(syDir, syFile), 'utf8'));
  const missingVerses = syData.filter(v => v.text === '(ܠܝܬ)');
  
  if (missingVerses.length === 0) {
    console.log(`📖 S${id} - ${name}: لا توجد أي آيات ناقصة! (كامل بنسبة 100%)`);
    continue;
  }
  
  // Group missing verses by chapter
  const grouped = {};
  missingVerses.forEach(v => {
    if (!grouped[v.chapter]) grouped[v.chapter] = [];
    grouped[v.chapter].push(v.verse);
  });
  
  console.log(`📖 S${id} - ${name}: يحتوي على ${missingVerses.length} آية ناقصة (غير متوفرة في النص السرياني):`);
  Object.keys(grouped).forEach(ch => {
    const verses = grouped[ch];
    // Helper to format ranges nicely (e.g. 1-3, 5, 8-10)
    const ranges = [];
    let start = verses[0];
    let prev = verses[0];
    for (let i = 1; i <= verses.length; i++) {
      const curr = verses[i];
      if (curr !== prev + 1 || i === verses.length) {
        if (start === prev) {
          ranges.push(`${start}`);
        } else {
          ranges.push(`${start}-${prev}`);
        }
        start = curr;
      }
      prev = curr;
    }
    console.log(`   - الإصحاح ${ch}: الآيات [${ranges.join(', ')}]`);
  });
}
