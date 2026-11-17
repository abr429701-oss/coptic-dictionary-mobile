const fs = require('fs');
const cheerio = require('cheerio');
const d = fs.readFileSync('f:/k/sample_takla.html', 'utf8');
const $ = cheerio.load(d);

// St-Takla verses are often inside <span> or just in the body.
// Sometimes they are in a <div> with id "text".
// Let's try to find all text nodes that look like verses.
$('p').each((i, el) => {
  const text = $(el).text();
  if (text.includes('1 ') || text.includes('١ ')) {
    console.log('--- Found in P ---');
    console.log(text.substring(0, 1000));
  }
});

$('div').each((i, el) => {
    const text = $(el).text();
    if (text.includes('1 ') || text.includes('١ ')) {
      // Check if it looks like a long bible text
      if (text.length > 500 && text.match(/\d+ /)) {
        console.log('--- Found in DIV ---');
        console.log(text.substring(0, 1000));
      }
    }
  });
