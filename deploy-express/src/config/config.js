require('dotenv').config();

module.exports = {
  // Server configuration
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
    publicUrl: process.env.PUBLIC_URL || 'http://localhost:3000'
  },

  // Music configuration
  music: {
    directory: process.env.MUSIC_DIR || '/Users/shiwei.zhu/Library/CloudStorage/GoogleDrive-shiwei76@gmail.com/.shortcut-targets-by-id/1-xhgFnP3CnU_RMXiIG3IMXED-pexE2H1/5年下/Music',
    databasePath: './data/music-library.json',
    supportedFormats: ['.mp3'],
    scanOnStartup: process.env.SCAN_ON_STARTUP === 'true' || false
  },

  // Alexa configuration
  alexa: {
    skillId: process.env.ALEXA_SKILL_ID || '',
    verifySignature: process.env.ALEXA_VERIFY_SIGNATURE !== 'false'
  },

  // Cache configuration
  cache: {
    ttl: 600, // 10 minutes
    checkperiod: 120 // 2 minutes
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/app.log'
  }
};
