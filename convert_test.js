const WordExtractor = require("word-extractor");
const extractor = new WordExtractor();
const extracted = extractor.extract("f:\\k\\arabic_bible_extracted\\www.St-Takla.org___Arabic-Bible-with-Diacritics\\01-Genesis.doc");

extracted.then(function(doc) {
  console.log(doc.getBody().substring(0, 500));
}).catch(function(err) {
  console.error("Error extracting document:", err);
});
