/**
 * @alexa-music/core - Shared core logic for Alexa music skill
 */

// Services
const { extractMetadata, createSearchableText } = require('./services/metadataParser');
const PlaylistManagerInterface = require('./services/playlistManager.interface');
const MusicLibraryInterface = require('./services/musicLibrary.interface');

// Utils
const { normalizeString, katakanaToHiragana, createSearchableText: createSearchableTextUtil } = require('./utils/textNormalizer');

module.exports = {
  // Services
  extractMetadata,
  createSearchableText,
  PlaylistManagerInterface,
  MusicLibraryInterface,

  // Utils
  normalizeString,
  katakanaToHiragana
};
