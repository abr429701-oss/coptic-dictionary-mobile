const fs = require('fs');
const path = require('path');

const txtDir = "f:\\k\\arabic_bible_text";
const jsonDir = "f:\\k\\assets\\bible\\json";

const fileMapping = {
  "01-Genesis.txt": "Genesis.json",
  "02-Exodus.txt": "Exodus.json",
  "03-Leviticus.txt": "Leviticus.json",
  "04-Numbers.txt": "Numbers.json",
  "05-Deuteronomy.txt": "Deuteronomy.json",
  "06-Joshua.txt": "Joshua.json",
  "07-Judges.txt": "Judges.json",
  "08-Ruth.txt": "Ruth.json",
  "09-1-Samuel.txt": "First Samuel.json",
  "10-2-Samuel.txt": "Second Samuel.json",
  "11-1-Kings.txt": "First Kings.json",
  "12-2-Kings.txt": "Second Kings.json",
  "13-1-Chronicles.txt": "First Chronicles.json",
  "14-2-Chronicles.txt": "Second Chronicles.json",
  "15-Ezra.txt": "Ezra.json", // May not exist in JSON
  "16-Nehmiah.txt": "Nehemiah.json", // May not exist in JSON
  "17-Tobit__Deu.txt": "Tobit.json",
  "18-Judith__Deu.txt": "Judith.json",
  "19-1-Esther.txt": "Esther.json", // Wait, is there 19-2? Let's check the list, 19-2-Esther-the-rest
  // Better to just map Esther to 19-1.
  "20-Job.txt": "Job.json",
  "21-1-Psalms.txt": "Psalms.json",
  "22-Proverbs.txt": "Proverbs.json",
  "23-Ecclesiastes.txt": "Ecclesiastes.json",
  "24-Song-of-Songs.txt": "Song of Songs.json",
  "25-Wisdom__Deu.txt": "Wisdom of Solomon.json",
  "26-Sirach__Deu.txt": "Wisdom of Jesus son of Sirach.json",
  "27-Isiah.txt": "Isaiah.json",
  "28-Jeremiah.txt": "Jeremiah.json",
  "29-Lamentations.txt": "Lamentations of Jeremiah.json",
  "30-Baruch__Deu.txt": "Baruch.json",
  "31-Ezekiel.txt": "Ezekiel.json",
  "32-1-Daniel.txt": "Daniel.json",
  "33-Hosea.txt": "Hosea.json",
  "34-Joel.txt": "Joel.json",
  "35-Amos.txt": "Amos.json",
  "36-Obadiah.txt": "Obadiah.json",
  "37-Jonah.txt": "Jonah.json",
  "38-Micah.txt": "Micah.json",
  "39-Nahum.txt": "Nahum.json",
  "40-Habakuk.txt": "Habakkuk.json",
  "41-Zephaniah.txt": "Zephaniah.json",
  "42-Haggai.txt": "Haggai.json",
  "43-Zechariah.txt": "Zechariah.json",
  "44-Malachi.txt": "Malachi.json",
  "47-Matthew.txt": "Gospel of St. Matthew.json",
  "48-Mark.txt": "Gospel of St. Mark.json",
  "49-Luke.txt": "Gospel of St. Luke.json",
  "50-John.txt": "Gospel of St. John.json",
  "51-Acts.txt": "Acts of the Apostles.json",
  "52-Romans.txt": "Epistle to the Romans.json",
  "53-1-Corinthians.txt": "First Epistle to the Corinthians.json",
  "54-2-Corinthians.txt": "Second Epistle to the Corinthians.json",
  "55-Galatians.txt": "Epistle to the Galatians.json",
  "56-Ephesians.txt": "Epistle to the Ephesians.json",
  "57-Philipians.txt": "Epistle to the Philippians.json",
  "58-Colossians.txt": "Epistle to the Colossians.json",
  "59-1-thessalonians.txt": "First Epistle to the Thessalonians.json",
  "60-2-thessalonians.txt": "Second Epistle to the Thessalonians.json",
  "61-1-Timothy.txt": "First Epistle to Timothy.json",
  "62-2-Timothy.txt": "Second Epistle to Timothy.json",
  "63-Titus.txt": "Epistle to Titus.json",
  "64-Phillemon.txt": "Epistle to Philemon.json",
  "65-Hebrews.txt": "Epistle to the Hebrews.json",
  "66-James.txt": "Epistle of St. James.json",
  "67-1-Peter.txt": "First Epistle of St. Peter.json",
  "68-2-Peter.txt": "Second Epistle of St. Peter.json",
  "69-1-John.txt": "First Epistle of St. John.json",
  "70-2-John.txt": "Second Epistle of St. John.json",
  "71-3-John.txt": "Third Epistle of St. John.json",
  "72-Jude.txt": "Epistle of St. Jude.json",
  "73-Revelation.txt": "Apocalypse.json",
};

// Also let's handle the epistle of jeremiah. It might be 30-2 or something, or included in Jeremiah/Baruch.
// BIBLE_ASSETS has "Epistle of Jeremiah.json"

for (const [txtFile, jsonFile] of Object.entries(fileMapping)) {
  const txtPath = path.join(txtDir, txtFile);
  const jsonPath = path.join(jsonDir, jsonFile);

  if (!fs.existsSync(txtPath) || !fs.existsSync(jsonPath)) {
    console.log(`Skipping ${txtFile} -> ${jsonFile} (files missing)`);
    continue;
  }

  try {
    const rawTxt = fs.readFileSync(txtPath, 'utf8');
    const chaptersText = rawTxt.split(/الأصحَ?ا?حُ?|الفصل/g).map(s => s.trim()).filter(s => s.length > 50); 
    // Wait, first element is usually title, filtered out if short.
    
    let jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    // Try to match chapters
    // If jsonData.length matches chaptersText.length roughly
    let c = 0;
    for (let ch of jsonData) {
       // if we have a chapter string
       if (c < chaptersText.length) {
          const chText = chaptersText[c];
          
          // parse verses: match digits followed by text
          const verseMatches = [...chText.matchAll(/(\d+)\s*([^0-9\n]+)/g)];
          // This regex might fail if the verse text contains numbers. Let's do a better regex:
          // match digit at start or after space, until next digit at start/space.
          // Or split by digits.
          let versesMap = {};
          const splitByNum = chText.split(/(\d+)/);
          for(let i=1; i<splitByNum.length; i+=2) {
             const vNum = parseInt(splitByNum[i], 10);
             let vText = splitByNum[i+1].trim();
             // clean up leading/trailing symbols
             vText = vText.replace(/^[\s\.\:\-]+/, "").replace(/[\s\.\:\-]+$/, "");
             versesMap[vNum] = vText;
          }

          for (let v of ch.data) {
             const vMatch = v.verseNumber.match(/:(\d+)$/);
             if (vMatch) {
               const vNum = parseInt(vMatch[1], 10);
               if (versesMap[vNum]) {
                 v.Arabic = versesMap[vNum];
               } else {
                 v.Arabic = "الآية غير متوفرة في الملف العربي.";
               }
             } else {
                 // For verses that just say "Genesis" (title verse)
                 v.Arabic = "";
             }
          }
       }
       c++;
    }

    fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
    console.log(`Successfully injected Arabic for ${jsonFile}`);
  } catch (e) {
    console.error(`Error processing ${jsonFile}:`, e);
  }
}
