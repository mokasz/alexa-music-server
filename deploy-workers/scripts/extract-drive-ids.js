#!/usr/bin/env node

/**
 * Extract Google Drive File IDs
 *
 * This script:
 * 1. Connects to Google Drive API
 * 2. Lists all audio files in the configured folder
 * 3. Matches them with local music library database
 * 4. Generates google-drive-mapping.json with file IDs and download URLs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleDriveClient } from './lib/googleDriveClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const MUSIC_LIBRARY_PATH = path.join(PROJECT_ROOT, 'deploy-express/data/music-library.json');
const MAPPING_OUTPUT_PATH = path.join(PROJECT_ROOT, 'deploy-workers/config/google-drive-mapping.json');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'deploy-workers/config/google-drive-config.json');

console.log('🔍 Google Drive File ID Extractor');
console.log('==================================\n');

async function main() {
  try {
    // Check if music library exists
    if (!fs.existsSync(MUSIC_LIBRARY_PATH)) {
      console.error('❌ Error: music-library.json not found!');
      console.error(`   Expected at: ${MUSIC_LIBRARY_PATH}`);
      console.error('\n📝 Please run the following command first:');
      console.error('   cd deploy-express && npm run scan\n');
      process.exit(1);
    }

    // Load music library
    console.log('📖 Loading local music library...');
    const musicLibrary = JSON.parse(fs.readFileSync(MUSIC_LIBRARY_PATH, 'utf-8'));
    const localTracks = musicLibrary.tracks || [];
    console.log(`   Found ${localTracks.length} local tracks\n`);

    // Initialize Google Drive client
    console.log('🔐 Initializing Google Drive API client...');
    const driveClient = new GoogleDriveClient(CONFIG_PATH);
    await driveClient.initialize();
    console.log('');

    // List audio files from Google Drive
    console.log('☁️  Fetching files from Google Drive...');
    const driveFiles = await driveClient.listAudioFiles();
    console.log(`   Found ${driveFiles.length} audio files in Google Drive\n`);

    if (driveFiles.length === 0) {
      console.error('⚠️  No audio files found in Google Drive folder');
      console.error('   Please check:');
      console.error('   1. Folder ID is correct in google-drive-config.json');
      console.error('   2. Service account has access to the folder');
      console.error('   3. Folder contains audio files (.mp3, .m4a, etc.)\n');
      process.exit(1);
    }

    // Display Drive files
    console.log('📁 Google Drive files:');
    driveFiles.forEach((file, index) => {
      console.log(`   ${index + 1}. ${file.name} (${file.mimeType}, ${Math.round(file.size / 1024 / 1024)}MB)`);
    });
    console.log('');

    // Match files
    console.log('🔗 Matching files with local database...');
    const mapping = {
      description: 'Mapping of local file paths to Google Drive file IDs',
      lastUpdated: new Date().toISOString(),
      totalFiles: 0,
      mappingRules: {
        localBasePath: musicLibrary.tracks[0]?.filePath ?
          path.dirname(musicLibrary.tracks[0].filePath) : '',
        googleDriveBaseUrl: 'https://drive.google.com/uc?export=download&id='
      },
      fileIdMapping: {
        files: {}
      }
    };

    let matchedCount = 0;
    let unmatchedLocal = [];
    let unmatchedDrive = [...driveFiles];

    for (const track of localTracks) {
      const localFileName = path.basename(track.filePath);

      // Find matching file in Drive by name
      const driveFile = driveFiles.find(f => f.name === localFileName);

      if (driveFile) {
        // Match found!
        const relativePath = track.filePath.replace(mapping.mappingRules.localBasePath + '/', '');

        mapping.fileIdMapping.files[relativePath] = {
          fileId: driveFile.id,
          name: driveFile.name,
          mimeType: driveFile.mimeType,
          size: parseInt(driveFile.size),
          webContentLink: `https://drive.google.com/uc?export=download&id=${driveFile.id}`,
          webViewLink: driveFile.webViewLink,
          createdTime: driveFile.createdTime,
          modifiedTime: driveFile.modifiedTime,
          localTrackId: track.id
        };

        matchedCount++;
        unmatchedDrive = unmatchedDrive.filter(f => f.id !== driveFile.id);

        console.log(`   ✅ Matched: ${localFileName}`);
      } else {
        unmatchedLocal.push(localFileName);
        console.log(`   ⚠️  No match: ${localFileName}`);
      }
    }

    mapping.totalFiles = matchedCount;

    console.log(`\n📊 Matching Summary:`);
    console.log(`   Matched: ${matchedCount}`);
    console.log(`   Unmatched local: ${unmatchedLocal.length}`);
    console.log(`   Unmatched Drive: ${unmatchedDrive.length}`);

    if (unmatchedLocal.length > 0) {
      console.log(`\n⚠️  Unmatched local files:`);
      unmatchedLocal.forEach(name => console.log(`     - ${name}`));
    }

    if (unmatchedDrive.length > 0) {
      console.log(`\n⚠️  Unmatched Drive files:`);
      unmatchedDrive.forEach(file => console.log(`     - ${file.name}`));
    }

    // Make files public if needed
    if (matchedCount > 0) {
      console.log('\n🔓 Checking file permissions...');
      let publicCount = 0;

      for (const [relativePath, fileInfo] of Object.entries(mapping.fileIdMapping.files)) {
        try {
          const publicUrl = await driveClient.makeFilePublic(fileInfo.fileId);
          fileInfo.webContentLink = publicUrl;
          publicCount++;
          console.log(`   ✅ ${fileInfo.name} is now publicly accessible`);
        } catch (error) {
          console.log(`   ⚠️  Could not make ${fileInfo.name} public: ${error.message}`);
        }
      }

      console.log(`   ${publicCount}/${matchedCount} files are publicly accessible\n`);
    }

    // Save mapping file
    console.log('💾 Saving mapping file...');
    fs.writeFileSync(MAPPING_OUTPUT_PATH, JSON.stringify(mapping, null, 2));
    console.log(`   Saved to: ${MAPPING_OUTPUT_PATH}\n`);

    // Summary
    console.log('✅ File ID extraction complete!');
    console.log(`   Total files mapped: ${matchedCount}`);
    console.log(`   Mapping file: ${MAPPING_OUTPUT_PATH}`);

    if (matchedCount > 0) {
      console.log('\n📋 Next Steps:');
      console.log('   1. Verify the mapping file');
      console.log('   2. Test file accessibility by opening webContentLink in browser');
      console.log('   3. Run: npm run sync-music');
      console.log('      This will sync the music library to Workers KV');
    } else {
      console.log('\n⚠️  No files were matched. Please check:');
      console.log('   1. File names match between local and Google Drive');
      console.log('   2. Google Drive folder ID is correct');
      console.log('   3. Service account has proper permissions');
    }

    console.log('');

  } catch (error) {
    console.error('\n❌ Error during file ID extraction:');
    console.error(error.message);

    if (error.message.includes('credentials')) {
      console.error('\n💡 Hint: Follow the setup guide at:');
      console.error('   deploy-workers/config/GOOGLE_DRIVE_SETUP.md');
    }

    process.exit(1);
  }
}

// Run the script
main();
