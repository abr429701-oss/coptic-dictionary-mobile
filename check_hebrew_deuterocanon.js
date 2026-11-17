const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ error: 'Failed to parse JSON', data: data.slice(0, 100) });
        }
      });
    }).on('error', (err) => { reject(err); });
  });
}

const books = [
  'Book_of_Tobit',
  'Book_of_Judith',
  'The_Wisdom_of_Solomon',
  'Ben_Sira',
  'The_Book_of_Maccabees_I',
  'The_Book_of_Maccabees_II',
  'Psalm_151',
  'The_Book_of_Susanna',
  'Baruch',
  'Book_of_Baruch',
  'Bel_and_the_Dragon',
  'Bel_and_Dragon',
  'Rest_of_Esther',
  'Additions_to_Esther',
  'Additions_to_Daniel'
];

async function main() {
  for (const book of books) {
    const url = `https://www.sefaria.org/api/texts/${book}`;
    console.log(`Checking ${book}...`);
    try {
      const res = await fetchUrl(url);
      if (res.error) {
        console.log(`   ❌ Error: ${res.error}`);
      } else if (res.text && res.text.length > 0) {
        const hasHe = res.he && res.he.length > 0;
        console.log(`   ✅ Success! Chapters: ${res.length || res.lengths || 'unknown'}. Has Hebrew: ${hasHe}. Hebrew length: ${res.he ? res.he.length : 0}.`);
        if (hasHe) {
          console.log(`      Sample HE: ${JSON.stringify(res.he.slice(0, 2))}`);
        }
      } else {
        console.log(`   ❓ Unknown response structure: ${Object.keys(res).join(', ')}`);
      }
    } catch (e) {
      console.log(`   ❌ Exception: ${e.message}`);
    }
  }
}

main();
