/**
 * Convert Japanese numerals to Arabic numerals
 * @param {string} str - String to convert
 * @returns {string} Converted string
 */
function kanjiToArabic(str) {
  if (!str) return '';

  const kanjiMap = {
    '零': '0', '〇': '0',
    '一': '1', '壱': '1',
    '二': '2', '弐': '2',
    '三': '3', '参': '3',
    '四': '4',
    '五': '5',
    '六': '6',
    '七': '7',
    '八': '8',
    '九': '9'
  };

  let result = str;
  for (const [kanji, arabic] of Object.entries(kanjiMap)) {
    result = result.replace(new RegExp(kanji, 'g'), arabic);
  }

  return result;
}

/**
 * Normalize string for searching (convert to lowercase, remove special chars)
 * @param {string} str - String to normalize
 * @returns {string} Normalized string
 */
function normalizeString(str) {
  if (!str) return '';

  // Convert Japanese numerals to Arabic numerals first
  const withArabicNumbers = kanjiToArabic(str);

  // Convert full-width to half-width
  const halfWidth = withArabicNumbers.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => {
    return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
  });

  // Convert to lowercase
  return halfWidth.toLowerCase().trim();
}

/**
 * Convert katakana to hiragana
 * @param {string} str - String to convert
 * @returns {string} Converted string
 */
function katakanaToHiragana(str) {
  return str.replace(/[\u30a1-\u30f6]/g, (match) => {
    const chr = match.charCodeAt(0) - 0x60;
    return String.fromCharCode(chr);
  });
}

/**
 * Create searchable text from metadata
 * @param {Object} track - Track metadata object
 * @returns {string} Searchable text
 */
function createSearchableText(track) {
  const parts = [
    track.title,
    track.artist,
    track.album,
    normalizeString(track.title),
    normalizeString(track.artist),
    normalizeString(track.album),
    katakanaToHiragana(track.title || ''),
    katakanaToHiragana(track.artist || '')
  ];

  return parts.filter(Boolean).join(' ').toLowerCase();
}

module.exports = {
  normalizeString,
  katakanaToHiragana,
  createSearchableText,
  kanjiToArabic
};
