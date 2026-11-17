const fs = require('fs');
const path = require('path');

function createJsonFromTxt(txtFilename, jsonFilename, bookName, bookNameAr) {
  const txtPath = path.join("f:\\k\\arabic_bible_text", txtFilename);
  const jsonPath = path.join("f:\\k\\assets\\bible\\json", jsonFilename);

  if (!fs.existsSync(txtPath)) {
    console.log(`Missing ${txtPath}`);
    return;
  }

  const rawTxt = fs.readFileSync(txtPath, 'utf8');
  // Maccabees chapters are split by "الإصحاح" instead of "الأصحاح"
  const chaptersText = rawTxt.split(/الإصحاح|الأصحاح/g).map(s => s.trim()).filter(s => s.length > 50);

  let bookJson = [];

  for (let c = 0; c < chaptersText.length; c++) {
    const chText = chaptersText[c];
    let chapterData = {
      sectionNameEnglish: (c + 1).toString(),
      sectionNameBohairic: "", 
      sectionNameSahidic: "",
      bookAbbreviation: `${bookName} – Chapter`,
      sectionId: `sec_id_missing_${c+1}`,
      data: []
    };

    chapterData.data.push({
      Bohairic: "",
      Greek: "",
      English: "",
      verseNumber: bookName,
      Arabic: bookNameAr,
      coloredWords: [],
      italicWords: []
    });

    // Since there are no numbers in Maccabees texts, split by newline
    const verses = chText.split('\n').map(s => s.trim()).filter(s => s.length > 5 && !s.includes("الإصحاح") && !s.includes("الأصحاح") && !s.includes("سفر مكابيين") && !s.includes("سفر المكابيين"));
    
    for(let i=0; i<verses.length; i++) {
       let vText = verses[i];
       
       chapterData.data.push({
         Bohairic: "(غير متوفر بالقبطية)",
         Greek: "",
         English: "",
         verseNumber: `${bookName} ${c+1}:${i+1}`,
         Arabic: vText,
         coloredWords: [],
         italicWords: []
       });
    }

    bookJson.push(chapterData);
  }

  fs.writeFileSync(jsonPath, JSON.stringify(bookJson, null, 2));
  console.log(`Created ${jsonPath} with ${chaptersText.length} chapters.`);
}

createJsonFromTxt("45-First-Maccabees__Deu.txt", "First Maccabees.json", "First Maccabees", "المكابيين الأول");
createJsonFromTxt("46-Second-Maccabees__Deu.txt", "Second Maccabees.json", "Second Maccabees", "المكابيين الثاني");
