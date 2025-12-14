#!/usr/bin/env node

/**
 * Google Drive API Client
 *
 * Provides methods to interact with Google Drive API using Service Account authentication.
 */

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const CONFIG_DIR = path.join(PROJECT_ROOT, 'deploy-workers/config');

/**
 * Google Drive Client Class
 */
export class GoogleDriveClient {
  constructor(configPath = null) {
    this.configPath = configPath || path.join(CONFIG_DIR, 'google-drive-config.json');
    this.config = null;
    this.drive = null;
    this.auth = null;
  }

  /**
   * Initialize the Google Drive client
   */
  async initialize() {
    // Load configuration
    if (!fs.existsSync(this.configPath)) {
      throw new Error(`Configuration file not found: ${this.configPath}\nPlease create it from google-drive-config.example.json`);
    }

    this.config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));

    // Load credentials
    const credentialsFileName = (this.config.credentialsPath || 'google-drive-credentials.json')
      .replace(/^\.\/config\//, '')
      .replace(/^\.\//, '');
    const credentialsPath = path.join(CONFIG_DIR, credentialsFileName);

    if (!fs.existsSync(credentialsPath)) {
      throw new Error(
        `Google Drive credentials not found: ${credentialsPath}\n\n` +
        `Please follow these steps:\n` +
        `1. Go to Google Cloud Console: https://console.cloud.google.com/\n` +
        `2. Create a Service Account\n` +
        `3. Download the JSON credentials file\n` +
        `4. Save it as: ${credentialsPath}\n` +
        `5. See GOOGLE_DRIVE_SETUP.md for detailed instructions`
      );
    }

    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));

    // Create auth client
    this.auth = new google.auth.GoogleAuth({
      credentials,
      scopes: this.config.apiSettings?.scopes || ['https://www.googleapis.com/auth/drive.readonly']
    });

    // Create Drive client
    this.drive = google.drive({
      version: this.config.apiSettings?.version || 'v3',
      auth: this.auth
    });

    console.log('✅ Google Drive API client initialized');
  }

  /**
   * List all files in a folder
   * @param {string} folderId - Google Drive folder ID
   * @param {object} options - Query options
   * @returns {Promise<Array>} Array of file objects
   */
  async listFiles(folderId = null, options = {}) {
    if (!this.drive) {
      throw new Error('Client not initialized. Call initialize() first.');
    }

    folderId = folderId || this.config.folderId;

    const query = options.query || `'${folderId}' in parents and trashed=false`;
    const fields = options.fields || 'files(id,name,mimeType,size,webContentLink,webViewLink,createdTime,modifiedTime)';

    try {
      const response = await this.drive.files.list({
        q: query,
        fields: `nextPageToken, ${fields}`,
        pageSize: options.pageSize || 1000,
        orderBy: options.orderBy || 'name'
      });

      return response.data.files || [];
    } catch (error) {
      throw new Error(`Failed to list files from Google Drive: ${error.message}`);
    }
  }

  /**
   * Get file metadata by ID
   * @param {string} fileId - Google Drive file ID
   * @returns {Promise<object>} File metadata
   */
  async getFileMetadata(fileId) {
    if (!this.drive) {
      throw new Error('Client not initialized. Call initialize() first.');
    }

    try {
      const response = await this.drive.files.get({
        fileId: fileId,
        fields: 'id,name,mimeType,size,webContentLink,webViewLink,createdTime,modifiedTime'
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to get file metadata: ${error.message}`);
    }
  }

  /**
   * Make a file publicly accessible and get its direct download URL
   * @param {string} fileId - Google Drive file ID
   * @returns {Promise<string>} Public download URL
   */
  async makeFilePublic(fileId) {
    if (!this.drive) {
      throw new Error('Client not initialized. Call initialize() first.');
    }

    try {
      // Set file permission to anyone with link can view
      await this.drive.permissions.create({
        fileId: fileId,
        requestBody: {
          role: 'reader',
          type: 'anyone'
        }
      });

      // Get the file metadata including webContentLink
      const metadata = await this.getFileMetadata(fileId);

      // Return direct download URL
      return `https://drive.google.com/uc?export=download&id=${fileId}`;
    } catch (error) {
      // If permission already exists, just return the URL
      if (error.message.includes('duplicate')) {
        return `https://drive.google.com/uc?export=download&id=${fileId}`;
      }
      throw new Error(`Failed to make file public: ${error.message}`);
    }
  }

  /**
   * Search for files by name pattern
   * @param {string} namePattern - File name pattern (supports wildcards with 'contains')
   * @param {string} folderId - Optional folder ID to search within
   * @returns {Promise<Array>} Matching files
   */
  async searchFiles(namePattern, folderId = null) {
    folderId = folderId || this.config.folderId;

    const query = `name contains '${namePattern}' and '${folderId}' in parents and trashed=false`;

    return await this.listFiles(folderId, { query });
  }

  /**
   * Get audio files only
   * @param {string} folderId - Google Drive folder ID
   * @returns {Promise<Array>} Audio files
   */
  async listAudioFiles(folderId = null) {
    folderId = folderId || this.config.folderId;

    const audioMimeTypes = [
      'audio/mpeg',      // MP3
      'audio/mp4',       // M4A
      'audio/flac',      // FLAC
      'audio/x-wav',     // WAV
      'audio/ogg'        // OGG
    ];

    const mimeQuery = audioMimeTypes.map(mime => `mimeType='${mime}'`).join(' or ');
    const query = `(${mimeQuery}) and '${folderId}' in parents and trashed=false`;

    return await this.listFiles(folderId, { query });
  }

  /**
   * Recursively list files in folder and subfolders
   * @param {string} folderId - Google Drive folder ID
   * @param {string} basePath - Base path for building relative paths
   * @returns {Promise<Array>} Files with relative paths
   */
  async listFilesRecursive(folderId = null, basePath = '') {
    folderId = folderId || this.config.folderId;

    const allFiles = [];
    const files = await this.listFiles(folderId);

    for (const file of files) {
      const relativePath = basePath ? `${basePath}/${file.name}` : file.name;

      if (file.mimeType === 'application/vnd.google-apps.folder') {
        // Recursively process subfolder
        const subFiles = await this.listFilesRecursive(file.id, relativePath);
        allFiles.push(...subFiles);
      } else {
        // Add file with relative path
        allFiles.push({
          ...file,
          relativePath
        });
      }
    }

    return allFiles;
  }
}

export default GoogleDriveClient;
