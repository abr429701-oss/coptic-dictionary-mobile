const WordExtractor = require("word-extractor");
const fs = require("fs");
const path = require("path");

const inputDir = "f:\\k\\arabic_bible_extracted\\www.St-Takla.org___Arabic-Bible-with-Diacritics";
const outputDir = "f:\\k\\arabic_bible_text";

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

const extractor = new WordExtractor();

async function convertAll() {
  const files = fs.readdirSync(inputDir).filter(f => f.endsWith(".doc"));
  let bibleJson = {};

  for (const file of files) {
    try {
      console.log(`Processing ${file}...`);
      const filePath = path.join(inputDir, file);
      const extracted = await extractor.extract(filePath);
      let text = extracted.getBody();
      
      // Save text version just in case
      fs.writeFileSync(path.join(outputDir, file.replace(".doc", ".txt")), text);
      
      // Basic JSON parsing attempt
      let lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      bibleJson[file.replace(".doc", "")] = lines;
      
    } catch (err) {
      console.error(`Error processing ${file}:`, err);
    }
  }

  fs.writeFileSync(path.join(outputDir, "arabic_bible.json"), JSON.stringify(bibleJson, null, 2));
  console.log("Done!");
}

convertAll();
