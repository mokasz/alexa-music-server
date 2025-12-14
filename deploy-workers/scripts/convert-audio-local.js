#!/usr/bin/env node

/**
 * Local Audio Format Converter for Google Drive
 *
 * This script:
 * 1. Downloads .m4a files from Google Drive
 * 2. Converts them to .mp3 using ffmpeg
 * 3. Saves converted files to local output directory
 * 4. User manually uploads MP3 files to Google Drive
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
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'deploy-workers/converted-audio');

console.log('🎵 Local Audio Format Converter');
console.log('================================\n');

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
    console.log(`   🔄 Converting...`);

    // ffmpeg command with high quality settings
    // -i: input file
    // -codec:a libmp3lame: use LAME MP3 encoder
    // -qscale:a 2: high quality (0-9, lower is better, 2 ≈ 190 kbps)
    // -y: overwrite output file
    const command = `ffmpeg -i "${inputPath}" -codec:a libmp3lame -qscale:a 2 -y "${outputPath}"`;

    execSync(command, { stdio: 'pipe' });

    // Get file sizes
    const inputSize = fs.statSync(inputPath).size;
    const outputSize = fs.statSync(outputPath).size;
    const inputMB = (inputSize / 1024 / 1024).toFixed(2);
    const outputMB = (outputSize / 1024 / 1024).toFixed(2);

    console.log(`   ✅ Converted: ${path.basename(outputPath)}`);
    console.log(`   📊 Size: ${inputMB} MB → ${outputMB} MB`);
    return true;
  } catch (error) {
    console.error(`   ❌ Conversion failed: ${error.message}`);
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
      let downloadedBytes = 0;

      response.data
        .on('data', (chunk) => {
          downloadedBytes += chunk.length;
        })
        .on('end', () => {
          const sizeMB = (downloadedBytes / 1024 / 1024).toFixed(2);
          console.log(`   ✅ Downloaded: ${sizeMB} MB`);
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

async function main() {
  try {
    // Check ffmpeg
    if (!checkFFmpeg()) {
      process.exit(1);
    }

    // Create output directory
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      console.log(`📁 Created output directory: ${OUTPUT_DIR}\n`);
    } else {
      console.log(`📁 Output directory: ${OUTPUT_DIR}\n`);
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
      file.name.toLowerCase().endsWith('.m4a')
    );

    console.log(`   Found ${allFiles.length} total files`);
    console.log(`   Found ${m4aFiles.length} M4A files\n`);

    if (m4aFiles.length === 0) {
      console.log('✅ No M4A files found. Nothing to convert.');
      console.log('');
      return;
    }

    // Display M4A files
    console.log('📋 M4A files found in Google Drive:');
    m4aFiles.forEach((file, index) => {
      const sizeMB = (file.size / 1024 / 1024).toFixed(2);
      const mp3Name = file.name.replace(/\.m4a$/i, '.mp3');
      const mp3Path = path.join(OUTPUT_DIR, mp3Name);
      const exists = fs.existsSync(mp3Path) ? '✅ (already converted)' : '';
      console.log(`   ${index + 1}. ${file.name} (${sizeMB} MB) ${exists}`);
    });
    console.log('');

    // Filter files that haven't been converted yet
    const filesToConvert = m4aFiles.filter(file => {
      const mp3Name = file.name.replace(/\.m4a$/i, '.mp3');
      const mp3Path = path.join(OUTPUT_DIR, mp3Name);
      return !fs.existsSync(mp3Path);
    });

    if (filesToConvert.length === 0) {
      console.log('✅ All M4A files have already been converted!');
      console.log(`   Check: ${OUTPUT_DIR}\n`);
      return;
    }

    console.log(`🔄 Will convert ${filesToConvert.length} file(s)\n`);

    // Process each M4A file
    let convertedCount = 0;
    let failedFiles = [];

    for (let i = 0; i < filesToConvert.length; i++) {
      const file = filesToConvert[i];
      console.log(`\n[${i + 1}/${filesToConvert.length}] Processing: ${file.name}`);
      console.log('─'.repeat(60));

      const mp3Name = file.name.replace(/\.m4a$/i, '.mp3');
      const m4aPath = path.join(OUTPUT_DIR, file.name);
      const mp3Path = path.join(OUTPUT_DIR, mp3Name);

      try {
        // Step 1: Download M4A
        console.log('📥 Downloading from Google Drive...');
        await downloadFile(driveClient, file.id, m4aPath);

        // Step 2: Convert to MP3
        console.log('🎵 Converting to MP3...');
        const conversionSuccess = convertToMP3(m4aPath, mp3Path);

        if (!conversionSuccess) {
          throw new Error('Conversion failed');
        }

        // Clean up M4A file
        fs.unlinkSync(m4aPath);

        console.log(`✅ Success: ${mp3Name}`);
        convertedCount++;

      } catch (error) {
        console.error(`\n❌ Failed: ${error.message}`);
        failedFiles.push(file.name);

        // Clean up temp files if they exist
        if (fs.existsSync(m4aPath)) {
          try {
            fs.unlinkSync(m4aPath);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Conversion Summary');
    console.log('='.repeat(60));
    console.log(`Total M4A files in Drive: ${m4aFiles.length}`);
    console.log(`Already converted: ${m4aFiles.length - filesToConvert.length}`);
    console.log(`Newly converted: ${convertedCount}`);
    console.log(`Failed: ${failedFiles.length}`);

    if (failedFiles.length > 0) {
      console.log('\n❌ Failed files:');
      failedFiles.forEach(name => console.log(`   - ${name}`));
    }

    if (convertedCount > 0) {
      console.log('\n📁 Converted files saved to:');
      console.log(`   ${OUTPUT_DIR}`);

      console.log('\n📋 Next Steps:');
      console.log('   1. Check converted MP3 files in the output directory');
      console.log('   2. Manually upload MP3 files to Google Drive Music folder');
      console.log('   3. Share files with "Anyone with the link" permission');
      console.log('   4. Run: cd deploy-workers && node scripts/extract-drive-ids.js');
      console.log('   5. Run: npm run sync-music');
      console.log('   6. Test with Alexa!');
    }

    console.log('');

  } catch (error) {
    console.error('\n❌ Error during conversion:');
    console.error(error.message);

    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }

    process.exit(1);
  }
}

// Run the script
main();
