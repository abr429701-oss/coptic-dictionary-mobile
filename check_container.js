const fs = require('fs');
const cheerio = require('cheerio');
const d = fs.readFileSync('f:/k/sample_takla.html', 'utf8');
const $ = cheerio.load(d);

$('div').each((i, el) => {
  const text = $(el).text();
  if (text.includes('1 ') && text.length > 500) {
    console.log('--- Found Potential Container ---');
    console.log('Tag:', el.tagName, 'ID:', $(el).attr('id'), 'Class:', $(el).attr('class'));
    // console.log(text.substring(0, 200));
  }
});
