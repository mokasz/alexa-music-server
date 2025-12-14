#!/usr/bin/env node

/**
 * Sync music library from local database to Cloudflare Workers KV
 *
 * This script:
 * 1. Reads music-library.json from deploy-express
 * 2. Loads Google Drive file ID mappings
 * 3. Converts local file paths to Google Drive URLs
 * 4. Uploads music metadata to Workers KV
 *
 * Prerequisites:
 * - Run 'npm run scan' in deploy-express to generate music-library.json
 * - Configure Google Drive file mappings in config/google-drive-mapping.json
 * - Run 'npx wrangler login' to authenticate
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const MUSIC_LIBRARY_PATH = path.join(PROJECT_ROOT, 'deploy-express/data/music-library.json');
const MAPPING_CONFIG_PATH = path.join(PROJECT_ROOT, 'deploy-workers/config/google-drive-mapping.json');
const KV_NAMESPACE_ID = '29af5a6de5be45c188828a14d84cad6d'; // MUSIC_DB

console.log('🎵 Music Library to Workers KV Sync Tool');
console.log('=========================================\n');

// Check if music library exists
if (!fs.existsSync(MUSIC_LIBRARY_PATH)) {
  console.error('❌ Error: music-library.json not found!');
  console.error(`   Expected at: ${MUSIC_LIBRARY_PATH}`);
  console.error('\n📝 Please run the following command first:');
  console.error('   cd deploy-express && npm run scan\n');
  process.exit(1);
}

// Check if mapping config exists
if (!fs.existsSync(MAPPING_CONFIG_PATH)) {
  console.error('❌ Error: google-drive-mapping.json not found!');
  console.error(`   Expected at: ${MAPPING_CONFIG_PATH}`);
  process.exit(1);
}

// Load music library
console.log('📖 Loading music library...');
const musicLibrary = JSON.parse(fs.readFileSync(MUSIC_LIBRARY_PATH, 'utf-8'));
console.log(`   Found ${musicLibrary.tracks?.length || 0} tracks\n`);

// Load mapping config
console.log('📖 Loading Google Drive mapping config...');
const mappingConfig = JSON.parse(fs.readFileSync(MAPPING_CONFIG_PATH, 'utf-8'));
const { localBasePath, googleDriveBaseUrl } = mappingConfig.mappingRules || {};
const fileIdMapping = mappingConfig.fileIdMapping || {};

if (!localBasePath || !googleDriveBaseUrl) {
  console.error('❌ Error: Invalid mapping configuration');
  process.exit(1);
}

// Convert tracks to KV format
console.log('🔄 Converting tracks to KV format...');
const convertedTracks = [];
const missingMappings = [];

for (const track of musicLibrary.tracks || []) {
  const relativePath = track.filePath.replace(localBasePath, '').replace(/^\//, '');
  const fileName = path.basename(track.filePath);
  const fileInfo = fileIdMapping?.files?.[fileName];

  if (!fileInfo) {
    missingMappings.push(fileName);
    continue; // Skip tracks without Google Drive mapping
  }

  const convertedTrack = {
    ...track,
    filePath: relativePath, // Store relative path
    streamUrl: fileInfo.webContentLink, // Google Drive direct download URL
    fileId: fileInfo.fileId,
    fileSize: fileInfo.size
  };

  convertedTracks.push(convertedTrack);
}

console.log(`   ✅ Converted ${convertedTracks.length} tracks`);
if (missingMappings.length > 0) {
  console.log(`   ⚠️  ${missingMappings.length} tracks missing Google Drive mappings`);
  console.log(`   First 5 missing: ${missingMappings.slice(0, 5).join(', ')}`);
}

// Prepare KV data
const kvData = {
  tracks: convertedTracks,
  metadata: {
    totalTracks: convertedTracks.length,
    lastUpdated: new Date().toISOString(),
    version: '1.0.0'
  }
};

// Save KV data to temporary file
const tempKvFile = path.join(__dirname, '../.temp-kv-data.json');
fs.writeFileSync(tempKvFile, JSON.stringify(kvData, null, 2));
console.log(`\n📝 KV data prepared (${(fs.statSync(tempKvFile).size / 1024).toFixed(2)} KB)\n`);

// Upload to KV
console.log('☁️  Uploading to Workers KV...');
try {
  const command = `npx wrangler kv:key put --namespace-id=${KV_NAMESPACE_ID} "music-library" --path="${tempKvFile}"`;
  execSync(command, {
    cwd: path.join(PROJECT_ROOT, 'deploy-workers'),
    stdio: 'inherit'
  });

  console.log('\n✅ Successfully synced music library to Workers KV!');
  console.log(`   Namespace: MUSIC_DB (${KV_NAMESPACE_ID})`);
  console.log(`   Key: music-library`);
  console.log(`   Tracks: ${convertedTracks.length}`);

  // Cleanup temp file
  fs.unlinkSync(tempKvFile);

} catch (error) {
  console.error('\n❌ Failed to upload to KV');
  console.error(error.message);

  // Keep temp file for debugging
  console.log(`\n📝 Temp file kept for debugging: ${tempKvFile}`);
  process.exit(1);
}

// Next steps
console.log('\n📋 Next Steps:');
console.log('   1. Verify KV data: npx wrangler kv:key get --namespace-id=' + KV_NAMESPACE_ID + ' "music-library"');
console.log('   2. Test Workers locally: npm run dev');
console.log('   3. Deploy to production: npm run deploy');
console.log('');
