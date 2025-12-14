const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

/**
 * Recursively scan directory for files matching specific extensions
 * @param {string} dirPath - Directory path to scan
 * @param {string[]} extensions - File extensions to match (e.g., ['.mp3', '.m4a'])
 * @param {Function} progressCallback - Optional callback for progress updates
 * @returns {Promise<string[]>} Array of file paths
 */
async function scanDirectory(dirPath, extensions = ['.mp3'], progressCallback = null) {
  const files = [];

  async function scan(currentPath) {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          // Skip hidden directories
          if (!entry.name.startsWith('.')) {
            await scan(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (extensions.includes(ext)) {
            files.push(fullPath);

            if (progressCallback) {
              progressCallback(fullPath, files.length);
            }
          }
        }
      }
    } catch (error) {
      logger.error(`Error scanning directory ${currentPath}:`, error.message);
    }
  }

  await scan(dirPath);
  return files;
}

/**
 * Check if a directory exists and is accessible
 * @param {string} dirPath - Directory path to check
 * @returns {Promise<boolean>}
 */
async function checkDirectoryAccess(dirPath) {
  try {
    await fs.access(dirPath, fs.constants.R_OK);
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch (error) {
    return false;
  }
}

/**
 * Get file stats (size, modified time, etc.)
 * @param {string} filePath - File path
 * @returns {Promise<Object>}
 */
async function getFileStats(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      modified: stats.mtime,
      created: stats.birthtime
    };
  } catch (error) {
    logger.error(`Error getting file stats for ${filePath}:`, error.message);
    return null;
  }
}

module.exports = {
  scanDirectory,
  checkDirectoryAccess,
  getFileStats
};
