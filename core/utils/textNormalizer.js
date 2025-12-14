/**
 * Normalize string for searching (convert to lowercase, remove special chars)
 * @param {string} str - String to normalize
 * @returns {string} Normalized string
 */
function normalizeString(str) {
  if (!str) return '';

  // Convert full-width to half-width
  const halfWidth = str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => {
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
  createSearchableText
};
