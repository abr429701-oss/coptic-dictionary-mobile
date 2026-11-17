const fs = require('fs');
const jsonDir = 'f:/k/assets/bible/json';

const baruchPath = jsonDir + '/Baruch.json';
const epistlePath = jsonDir + '/Epistle of Jeremiah.json';

const baruch = JSON.parse(fs.readFileSync(baruchPath, 'utf8'));
const epistle = JSON.parse(fs.readFileSync(epistlePath, 'utf8'));

// The epistle has 1 chapter with 74 verses (including title)
// We already have ch6 with Arabic from St Takla (diacritized)
// We need to merge: take Bohairic/English/Greek/Sahidic from epistle, keep Arabic from baruch ch6

const ch6 = baruch[5]; // index 5 = chapter 6
const epistleData = epistle[0].data;

console.log('Baruch ch6 verses:', ch6.data.length);
console.log('Epistle verses:', epistleData.length);

// Create new ch6 data from epistle (which has all languages), then add Arabic from our scraped data
const newCh6Data = [];

for (let i = 0; i < epistleData.length; i++) {
  const ev = { ...epistleData[i] };
  
  // Fix verse number: change "Epistle of Jeremiah 1:X" to "Baruch 6:X"
  ev.verseNumber = ev.verseNumber.replace('Epistle of Jeremiah 1:', 'Baruch 6:');
  if (ev.verseNumber === 'Epistle of Jeremiah') {
    ev.verseNumber = 'Baruch';
  }
  
  // Find matching Arabic verse from our ch6 data
  if (i < ch6.data.length && ch6.data[i].Arabic) {
    ev.Arabic = ch6.data[i].Arabic;
  } else {
    // Try to match by verse number
    const vMatch = ev.verseNumber.match(/:(\d+)$/);
    if (vMatch) {
      const vNum = parseInt(vMatch[1]);
      const found = ch6.data.find(v => v.verseNumber.endsWith(':' + vNum));
      if (found && found.Arabic) {
        ev.Arabic = found.Arabic;
      }
    }
  }
  
  newCh6Data.push(ev);
}

// Replace ch6 data
baruch[5] = {
  sectionNameEnglish: "6",
  sectionNameBohairic: epistle[0].sectionNameBohairic || "",
  sectionNameSahidic: epistle[0].sectionNameSahidic || "",
  bookAbbreviation: "Baruch – Chapter",
  sectionId: epistle[0].sectionId || "sec_baruch_6",
  data: newCh6Data
};

fs.writeFileSync(baruchPath, JSON.stringify(baruch, null, 2));

// Verify
console.log('\nVerification:');
console.log('Ch6 verses:', baruch[5].data.length);
console.log('V1 Bohairic:', baruch[5].data[1].Bohairic.substring(0, 80));
console.log('V1 English:', baruch[5].data[1].English.substring(0, 80));
console.log('V1 Greek:', baruch[5].data[1].Greek.substring(0, 80));
console.log('V1 Arabic:', baruch[5].data[1].Arabic.substring(0, 80));
console.log('V1 verseNumber:', baruch[5].data[1].verseNumber);
console.log('\nDONE!');
