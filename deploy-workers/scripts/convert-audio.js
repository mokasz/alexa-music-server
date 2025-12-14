#!/usr/bin/env node

/**
 * Audio Format Converter for Google Drive
 *
 * This script:
 * 1. Scans Google Drive folder for .m4a files
 * 2. Downloads them to a temporary directory
 * 3. Converts to .mp3 using ffmpeg
 * 4. Uploads converted files back to Google Drive
 * 5. Optionally deletes original .m4a files
 *
 * Prerequisites:
 * - ffmpeg must be installed: brew install ffmpeg
 * - Google Drive API credentials configured
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { GoogleDriveClient } from './lib/googleDriveClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'deploy-workers/config/google-drive-config.json');
const TEMP_DIR = path.join(PROJECT_ROOT, 'deploy-workers/.temp-audio-conversion');

console.log('🎵 Audio Format Converter for Google Drive');
console.log('==========================================\n');

/**
 * Check if ffmpeg is installed
 */
function checkFFmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    console.log('✅ ffmpeg is installed\n');
    return true;
  } catch (error) {
    console.error('❌ ffmpeg is not installed!');
    console.error('   Install with: brew install ffmpeg');
    console.error('   Or visit: https://ffmpeg.org/download.html\n');
    return false;
  }
}

/**
 * Convert M4A to MP3 using ffmpeg
 * @param {string} inputPath - Path to input M4A file
 * @param {string} outputPath - Path to output MP3 file
 */
function convertToMP3(inputPath, outputPath) {
  try {
    console.log(`   Converting: ${path.basename(inputPath)}`);

    // ffmpeg command with good quality settings
    // -i: input file
    // -codec:a libmp3lame: use LAME MP3 encoder
    // -qscale:a 2: high quality (0-9, lower is better)
    // -y: overwrite output file
    const command = `ffmpeg -i "${inputPath}" -codec:a libmp3lame -qscale:a 2 -y "${outputPath}" 2>&1`;

    execSync(command, { stdio: 'pipe' });

    console.log(`   ✅ Converted: ${path.basename(outputPath)}\n`);
    return true;
  } catch (error) {
    console.error(`   ❌ Conversion failed: ${error.message}\n`);
    return false;
  }
}

/**
 * Download file from Google Drive
 * @param {Object} driveClient - GoogleDriveClient instance
 * @param {string} fileId - Google Drive file ID
 * @param {string} outputPath - Local file path to save
 */
async function downloadFile(driveClient, fileId, outputPath) {
  try {
    const response = await driveClient.drive.files.get(
      { fileId: fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    return new Promise((resolve, reject) => {
      const dest = fs.createWriteStream(outputPath);
      response.data
        .on('end', () => {
          console.log(`   ✅ Downloaded: ${path.basename(outputPath)}`);
          resolve();
        })
        .on('error', (err) => {
          console.error(`   ❌ Download failed: ${err.message}`);
          reject(err);
        })
        .pipe(dest);
    });
  } catch (error) {
    throw new Error(`Failed to download file: ${error.message}`);
  }
}

/**
 * Upload file to Google Drive
 * @param {Object} driveClient - GoogleDriveClient instance
 * @param {string} filePath - Local file path
 * @param {string} fileName - Name for the file in Drive
 * @param {string} folderId - Parent folder ID
 */
async function uploadFile(driveClient, filePath, fileName, folderId) {
  try {
    const fileMetadata = {
      name: fileName,
      parents: [folderId]
    };

    const media = {
      mimeType: 'audio/mpeg',
      body: fs.createReadStream(filePath)
    };

    const response = await driveClient.drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id,name,size,webContentLink,webViewLink,createdTime,modifiedTime'
    });

    console.log(`   ✅ Uploaded: ${fileName}`);
    return response.data;
  } catch (error) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }
}

/**
 * Delete file from Google Drive
 * @param {Object} driveClient - GoogleDriveClient instance
 * @param {string} fileId - File ID to delete
 */
async function deleteFile(driveClient, fileId) {
  try {
    await driveClient.drive.files.delete({ fileId: fileId });
    return true;
  } catch (error) {
    console.error(`   ⚠️  Failed to delete: ${error.message}`);
    return false;
  }
}

/**
 * Make file publicly accessible
 * @param {Object} driveClient - GoogleDriveClient instance
 * @param {string} fileId - File ID
 */
async function makeFilePublic(driveClient, fileId) {
  try {
    await driveClient.drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      }
    });
    return true;
  } catch (error) {
    // If permission already exists, that's okay
    if (error.message.includes('duplicate')) {
      return true;
    }
    console.error(`   ⚠️  Failed to make public: ${error.message}`);
    return false;
  }
}

async function main() {
  try {
    // Check ffmpeg
    if (!checkFFmpeg()) {
      process.exit(1);
    }

    // Create temp directory
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
      console.log(`📁 Created temp directory: ${TEMP_DIR}\n`);
    }

    // Initialize Google Drive client
    console.log('🔐 Initializing Google Drive API client...');
    const driveClient = new GoogleDriveClient(CONFIG_PATH);
    await driveClient.initialize();
    console.log('');

    // List all audio files
    console.log('☁️  Scanning Google Drive for audio files...');
    const allFiles = await driveClient.listFiles();

    // Filter M4A files
    const m4aFiles = allFiles.filter(file =>
      file.name.toLowerCase().endsWith('.m4a') && file.mimeType === 'audio/mpeg'
    );

    console.log(`   Found ${allFiles.length} total files`);
    console.log(`   Found ${m4aFiles.length} M4A files to convert\n`);

    if (m4aFiles.length === 0) {
      console.log('✅ No M4A files found. Nothing to convert.');
      console.log('');
      return;
    }

    // Display M4A files
    console.log('📋 M4A files found:');
    m4aFiles.forEach((file, index) => {
      const sizeMB = (file.size / 1024 / 1024).toFixed(2);
      console.log(`   ${index + 1}. ${file.name} (${sizeMB} MB)`);
    });
    console.log('');

    // Ask for confirmation
    console.log('⚠️  This will:');
    console.log('   1. Download M4A files to temporary directory');
    console.log('   2. Convert to MP3 format using ffmpeg');
    console.log('   3. Upload MP3 files to Google Drive');
    console.log('   4. Make MP3 files publicly accessible');
    console.log('   5. Delete original M4A files (optional)\n');

    // Process each M4A file
    let convertedCount = 0;
    let failedFiles = [];

    for (const file of m4aFiles) {
      console.log(`\n🔄 Processing: ${file.name}`);
      console.log('─'.repeat(50));

      const baseName = path.basename(file.name, '.m4a');
      const m4aPath = path.join(TEMP_DIR, file.name);
      const mp3Path = path.join(TEMP_DIR, `${baseName}.mp3`);
      const mp3FileName = `${baseName}.mp3`;

      try {
        // Step 1: Download M4A
        console.log('📥 Step 1: Downloading M4A...');
        await downloadFile(driveClient, file.id, m4aPath);

        // Step 2: Convert to MP3
        console.log('🔄 Step 2: Converting to MP3...');
        const conversionSuccess = convertToMP3(m4aPath, mp3Path);

        if (!conversionSuccess) {
          throw new Error('Conversion failed');
        }

        // Step 3: Upload MP3
        console.log('📤 Step 3: Uploading MP3 to Google Drive...');
        const uploadedFile = await uploadFile(
          driveClient,
          mp3Path,
          mp3FileName,
          driveClient.config.folderId
        );

        // Step 4: Make public
        console.log('🔓 Step 4: Making file publicly accessible...');
        await makeFilePublic(driveClient, uploadedFile.id);

        // Step 5: Delete original M4A
        console.log('🗑️  Step 5: Deleting original M4A...');
        const deleted = await deleteFile(driveClient, file.id);

        if (deleted) {
          console.log(`   ✅ Deleted: ${file.name}`);
        }

        // Clean up local files
        fs.unlinkSync(m4aPath);
        fs.unlinkSync(mp3Path);

        console.log(`\n✅ Successfully converted: ${file.name} → ${mp3FileName}`);
        convertedCount++;

      } catch (error) {
        console.error(`\n❌ Failed to process ${file.name}: ${error.message}`);
        failedFiles.push(file.name);

        // Clean up temp files if they exist
        if (fs.existsSync(m4aPath)) fs.unlinkSync(m4aPath);
        if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Conversion Summary');
    console.log('='.repeat(50));
    console.log(`Total M4A files: ${m4aFiles.length}`);
    console.log(`Successfully converted: ${convertedCount}`);
    console.log(`Failed: ${failedFiles.length}`);

    if (failedFiles.length > 0) {
      console.log('\n❌ Failed files:');
      failedFiles.forEach(name => console.log(`   - ${name}`));
    }

    console.log('\n📋 Next Steps:');
    console.log('   1. Run: node scripts/extract-drive-ids.js');
    console.log('      This will update the file ID mappings');
    console.log('   2. Run: npm run sync-music');
    console.log('      This will sync to Workers KV');
    console.log('   3. Test with Alexa!');
    console.log('');

  } catch (error) {
    console.error('\n❌ Error during conversion:');
    console.error(error.message);

    if (error.stack) {
      console.error('\n' + error.stack);
    }

    process.exit(1);
  } finally {
    // Clean up temp directory
    if (fs.existsSync(TEMP_DIR)) {
      const tempFiles = fs.readdirSync(TEMP_DIR);
      if (tempFiles.length === 0) {
        fs.rmdirSync(TEMP_DIR);
        console.log('🧹 Cleaned up temp directory\n');
      }
    }
  }
}

// Run the script
main();
