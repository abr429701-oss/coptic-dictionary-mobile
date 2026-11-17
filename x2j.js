const fs = require('fs');
const path = require('path');

function unescapeXml(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function xmlToJson(xml) {
  const bible = {};
  const bookRegex = /<book number="(\d+)">([\s\S]*?)<\/book>/g;
  let bookMatch;
  while ((bookMatch = bookRegex.exec(xml)) !== null) {
    const bookNum = bookMatch[1];
    const bookContent = bookMatch[2];
    bible[bookNum] = {};
    const chapRegex = /<chapter number="(\d+)">([\s\S]*?)<\/chapter>/g;
    let chapMatch;
    while ((chapMatch = chapRegex.exec(bookContent)) !== null) {
      const chapNum = chapMatch[1];
      const chapContent = chapMatch[2];
      bible[bookNum][chapNum] = {};
      const verseRegex = /<verse number="([^"]+)">([\s\S]*?)<\/verse>/g;
      let verseMatch;
      while ((verseMatch = verseRegex.exec(chapContent)) !== null) {
        const verseNum = verseMatch[1];
        bible[bookNum][chapNum][verseNum] = unescapeXml(verseMatch[2].trim());
      }
    }
  }
  return bible;
}

const dir = path.join(__dirname, 'assets', 'bible');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.xml'));

files.forEach(f => {
  console.log('Converting ' + f + '...');
  const xml = fs.readFileSync(path.join(dir, f), 'utf8');
  const json = xmlToJson(xml);
  const outPath = path.join(dir, f.replace('.xml', '.json'));
  fs.writeFileSync(outPath, JSON.stringify(json));
  const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
  console.log('  -> ' + f.replace('.xml', '.json') + ' (' + sizeMB + ' MB)');
});
console.log('All done!');
