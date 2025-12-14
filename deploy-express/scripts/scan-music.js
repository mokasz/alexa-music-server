#!/usr/bin/env node

/**
 * Music Library Scanner Script
 * Scans the configured music directory and creates/updates the music database
 */

const path = require('path');
const config = require('../src/config/config');
const musicLibrary = require('../src/services/musicLibrary');
const logger = require('../src/utils/logger');

async function main() {
  console.log('================================');
  console.log('Music Library Scanner');
  console.log('================================\n');

  try {
    console.log(`Music Directory: ${config.music.directory}`);
    console.log(`Database Path: ${config.music.databasePath}`);
    console.log(`Supported Formats: ${config.music.supportedFormats.join(', ')}\n`);

    // Initialize library (load existing data if available)
    console.log('Initializing music library...');
    await musicLibrary.initialize();

    // Ask if user wants to rescan
    const existingTracks = musicLibrary.getAllTracks().length;
    if (existingTracks > 0) {
      console.log(`\nFound existing database with ${existingTracks} tracks.`);
      console.log('This will rescan the entire music directory and update the database.\n');
    }

    // Start scanning
    console.log('Starting music directory scan...\n');
    const startTime = Date.now();

    const count = await musicLibrary.scanMusicDirectory();

    const duration = Math.round((Date.now() - startTime) / 1000);

    console.log('\n================================');
    console.log('Scan Complete!');
    console.log('================================');
    console.log(`Total tracks: ${count}`);
    console.log(`Time taken: ${duration} seconds`);

    // Display statistics
    const stats = musicLibrary.getStats();
    console.log('\nLibrary Statistics:');
    console.log(`- Total tracks: ${stats.totalTracks}`);
    console.log(`- Unique artists: ${stats.uniqueArtists}`);
    console.log(`- Unique albums: ${stats.uniqueAlbums}`);
    console.log(`- Total duration: ${Math.round(stats.totalDuration / 60)} minutes`);
    console.log(`- Total size: ${Math.round(stats.totalSize / 1024 / 1024)} MB`);
    console.log(`- Average track duration: ${stats.averageDuration} seconds\n`);

    // Show some sample tracks
    const sampleTracks = musicLibrary.getAllTracks().slice(0, 5);
    if (sampleTracks.length > 0) {
      console.log('Sample tracks:');
      sampleTracks.forEach((track, index) => {
        console.log(`${index + 1}. ${track.title} - ${track.artist} (${track.album})`);
      });
    }

    console.log('\n✅ Music library scan completed successfully!');
    console.log(`Database saved to: ${config.music.databasePath}\n`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error during music library scan:');
    console.error(error.message);
    logger.error('Music scan error:', error);
    process.exit(1);
  }
}

// Run the scanner
main();
