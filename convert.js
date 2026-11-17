const fs = require('fs');
const path = require('path');
function unescapeXml(str) {
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '\"').replace(/&apos;/g, "'");
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
        const text = unescapeXml(verseMatch[2].trim());
        bible[bookNum][chapNum][verseNum] = text;
      }
    }
  }
  return bible;
}
const bibleDir = path.join(__dirname, 'assets', 'bible');
const files = fs.readdirSync(bibleDir).filter(f => f.endsWith('.xml'));
files.forEach(file => {
  console.log('Converting ' + file);
  const xml = fs.readFileSync(path.join(bibleDir, file), 'utf8');
  const json = xmlToJson(xml);
  fs.writeFileSync(path.join(bibleDir, file.replace('.xml', '.json')), JSON.stringify(json));
});
