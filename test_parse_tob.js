const fs = require('fs');

const json = JSON.parse(fs.readFileSync('next_data.json', 'utf8'));
const content = json.props.pageProps.chapterInfo.content;

function extractVerses(html) {
  // Decode HTML entities
  let cleanHtml = html.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
  cleanHtml = cleanHtml.replace(/&nbsp;/g, ' ');
  
  const verseMap = {};
  
  // Find all span tags of class verse with data-usfm and their indices
  const verseTags = [];
  const regex = /<span class="verse [^"]*" data-usfm="([^"]+)">/g;
  let match;
  
  while ((match = regex.exec(cleanHtml)) !== null) {
    verseTags.push({
      usfm: match[1],
      index: match.index,
      tagLength: match[0].length
    });
  }
  
  for (let i = 0; i < verseTags.length; i++) {
    const current = verseTags[i];
    const next = verseTags[i + 1];
    
    const startIdx = current.index + current.tagLength;
    const endIdx = next ? next.index : cleanHtml.length;
    
    const segment = cleanHtml.slice(startIdx, endIdx);
    
    // Parse chapter and verse from USFM
    const parts = current.usfm.split('.');
    const chapterNum = parseInt(parts[1]);
    const verseNum = parseInt(parts[2]);
    
    // Strip headings, notes, and label spans
    let text = segment.replace(/<span class="heading">[\s\S]*?<\/span>/gi, '');
    text = text.replace(/<div class="s\d*">[\s\S]*?<\/div>/gi, '');
    text = text.replace(/<span class="note">[\s\S]*?<\/span>/gi, '');
    text = text.replace(/<span class="label">[\s\S]*?<\/span>/gi, '');
    
    // Strip other tags
    text = text.replace(/<[^>]+>/g, '');
    
    // Clean up spaces
    text = text.trim().replace(/\s+/g, ' ');
    
    if (text) {
      const key = `${chapterNum}:${verseNum}`;
      if (!verseMap[key]) {
        verseMap[key] = [];
      }
      verseMap[key].push(text);
    }
  }
  
  // Combine segments for each verse
  const result = [];
  Object.keys(verseMap).forEach(key => {
    const [chapter, verse] = key.split(':').map(Number);
    const textCombined = verseMap[key].join(' ').trim();
    result.push({ chapter, verse, text: textCombined });
  });
  
  return result;
}

const verses = extractVerses(content);
console.log('Total verses extracted:', verses.length);
console.log('Verses 1-5 sample:', verses.slice(0, 5));
