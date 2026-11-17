const http = require('https');

const url = 'https://www.sefaria.org/api/texts/Book_of_Tobit?context=0';

http.get(url, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      console.log('Book of Tobit chapters on Sefaria:');
      if (Array.isArray(data.he)) {
        // Depth 2 or depth 3?
        data.he.forEach((ch, idx) => {
          if (Array.isArray(ch)) {
            console.log(`Chapter ${idx + 1}: ${ch.length} verses.`);
          } else {
            console.log(`Chapter ${idx + 1} is not an array:`, typeof ch);
          }
        });
      } else {
        console.log('data.he is not an array:', typeof data.he);
      }
    } catch (e) {
      console.error(e);
    }
  });
});
