# Audio Format Converter

Automatically convert M4A files from Google Drive to MP3 format for Alexa compatibility.

## Quick Start

```bash
npm run convert
```

## What It Does

1. ✅ Scans Google Drive for .m4a files
2. ✅ Downloads M4A files to temporary location
3. ✅ Converts to high-quality MP3 using ffmpeg (~190 kbps)
4. ✅ Saves converted files to `converted-audio/` directory
5. ✅ Reduces file size by 40-60%
6. ✅ Skips already converted files

## Requirements

- **ffmpeg** must be installed:
  ```bash
  brew install ffmpeg
  ```

- **Google Drive API** credentials configured in `config/`

## Output

Converted MP3 files are saved to:
```
deploy-workers/converted-audio/
```

## After Conversion

1. Check converted files: `ls -lh converted-audio/`
2. Manually upload MP3 files to Google Drive
3. Share files: "Anyone with the link" → Viewer
4. Run full sync workflow:
   ```bash
   cd ../deploy-express && npm run scan
   cd ../deploy-workers && node scripts/extract-drive-ids.js
   npm run sync-music
   ```

## Features

- **Smart Skip**: Already converted files are automatically skipped
- **Progress Display**: Shows download size and conversion progress
- **Quality Preservation**: Uses high-quality encoding (qscale 2)
- **Size Reduction**: Typically reduces file size by 40-60%
- **Batch Processing**: Processes all M4A files in one run

## Example Output

```
🎵 Local Audio Format Converter
================================

Found 3 M4A files

[1/3] Processing: 奈良時代.m4a
📥 Downloading from Google Drive...
   ✅ Downloaded: 31.69 MB
🎵 Converting to MP3...
   ✅ Converted: 奈良時代.mp3
   📊 Size: 31.69 MB → 13.28 MB
✅ Success: 奈良時代.mp3

📊 Conversion Summary
━━━━━━━━━━━━━━━━━━━━
Total M4A files: 3
Newly converted: 3
Failed: 0

📁 Converted files saved to:
   /path/to/converted-audio
```

## Troubleshooting

### ffmpeg not found
```bash
brew install ffmpeg
```

### Permission denied
Ensure Google Drive Service Account has read access to the folder.

### Conversion failed
Check that the M4A file is not corrupted. Try re-downloading from Google Drive.

## Script Location

- Main script: `scripts/convert-audio-local.js`
- Package command: `npm run convert`

## Notes

- This script does NOT modify or delete files in Google Drive
- Original M4A files remain in Google Drive (you can delete manually later)
- Converted MP3 files must be manually uploaded to Google Drive
- Run as many times as needed - already converted files are skipped
