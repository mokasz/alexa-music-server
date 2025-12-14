# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a custom Alexa skill that streams local MP3 files from a Mac to Amazon Echo devices. The system uses Node.js/Express for the backend, Cloudflare Tunnel for secure HTTPS access, and the Alexa Skills Kit for voice interaction.

**System Architecture:**
```
Amazon Echo → Alexa Service → Cloudflare Tunnel → Node.js Server → Local MP3 Files
```

## Essential Commands

### Development & Running
```bash
# Start the server (production)
npm start

# Start with auto-reload (development)
npm run dev

# Scan music library and extract metadata
npm run scan

# Start Cloudflare Tunnel
npm run tunnel
# OR
cloudflared tunnel run alexa-music-tunnel
```

### Testing Endpoints
```bash
# Health check
curl http://localhost:3000/health
curl https://alexa-music.moerin.com/health

# Search for music
curl "http://localhost:3000/search?q=曲名"

# Get library info
curl http://localhost:3000/library/info
```

### Logs
```bash
# View server logs
tail -f logs/app.log

# With PM2 (if running as service)
pm2 logs alexa-music-server
```

## Core Architecture

### Request Flow

**Alexa Skill Request:**
1. User speaks to Echo: "アレクサ、モカモカを開いて"
2. Alexa service sends POST to `/alexa` endpoint
3. `alexaVerification` middleware validates signature (if enabled)
4. `alexaController` processes intent using ask-sdk-core
5. Returns AudioPlayer directive with streaming URL
6. Echo requests MP3 stream from `/stream/:trackId`
7. `streamController` serves MP3 with HTTP Range support

### Key Components

**Music Library System (`src/services/musicLibrary.js`):**
- Singleton service that loads/manages music database
- Uses `data/music-library.json` as persistent storage
- Provides search with Japanese text normalization (hiragana/katakana)
- Auto-loads on server start unless `SCAN_ON_STARTUP=false`

**Alexa Controller (`src/controllers/alexaController.js`):**
- Handles Alexa intents using ask-sdk-core skill builder
- Key handlers: LaunchRequest, PlayMusicIntent, NextIntent, PreviousIntent
- **Important:** Uses `slots.query` (not `songName`/`artistName`) because interaction model uses `AMAZON.SearchQuery`
- Builds AudioPlayer.Play directives with track URLs

**Stream Controller (`src/controllers/streamController.js`):**
- Streams MP3 files with HTTP Range request support (required for Alexa)
- Returns 206 Partial Content for range requests
- Critical for audio seeking/resuming

**Playlist Manager (`src/services/playlistManager.js`):**
- Manages playback sessions per device
- Tracks current position, playlist order
- Handles next/previous track navigation

### Configuration

**Environment Variables (`.env`):**
```
PORT=3000
NODE_ENV=production
PUBLIC_URL=https://alexa-music.moerin.com
MUSIC_DIR=/path/to/music/directory
ALEXA_SKILL_ID=amzn1.ask.skill.xxxxx
ALEXA_VERIFY_SIGNATURE=false  # Set true for production
```

**Cloudflare Tunnel (`~/.cloudflared/config.yml`):**
```yaml
tunnel: b40864da-2899-4242-86b7-c0d3d457dd05
credentials-file: /Users/shiwei.zhu/.cloudflared/b40864da-2899-4242-86b7-c0d3d457dd05.json
ingress:
  - hostname: alexa-music.moerin.com
    service: http://localhost:3000
  - service: http_status:404
```

## Alexa Skill Configuration

**Current Setup:**
- Skill Name: モカモカ (mokamoka)
- Skill ID: `amzn1.ask.skill.a2728c88-5b40-4ae2-8b33-f0a5660ac8ab`
- Invocation Name: モカモカ
- Endpoint: `https://alexa-music.moerin.com/alexa`
- SSL Type: Wildcard certificate subdomain

**Interaction Model:**
- Uses `AMAZON.SearchQuery` slot type for flexible Japanese queries
- Sample utterances: "{query}を再生", "再生して {query}"
- Supports AudioPlayer interface for music streaming

**Voice Commands:**
```
"アレクサ、モカモカを開いて"
"再生して [曲名]"
"次の曲"
"前の曲"
"一時停止"
"再開"
```

## Important Implementation Details

### Japanese Text Handling
The music search implements Japanese text normalization to handle hiragana/katakana variations. When searching, both the query and searchable text are normalized using custom utilities in `musicLibrary.js`.

### Slot Name Change
The interaction model was changed from `songName`/`artistName` slots to a single `query` slot using `AMAZON.SearchQuery`. This is reflected in `alexaController.js` line 61:
```javascript
if (slots.query && slots.query.value) {
  query = slots.query.value;
}
```

### Audio Streaming Requirements
- Must support HTTP Range requests (206 Partial Content)
- URL must be HTTPS for Alexa (hence Cloudflare Tunnel)
- MP3 format required (Alexa limitation)
- Metadata includes title, artist, and album art

### Session Management
Each Alexa session/device has its own playlist managed by `playlistManager`. Sessions are identified by `sessionId` or `deviceId` depending on the request type.

## Known Issues & Troubleshooting

**Current Status (see STATUS.md for details):**
- ✅ Simulator: Works perfectly
- ✅ Real Echo devices: Working perfectly
- ✅ Project completed on 2025-12-13

**Common Issues:**

1. **No music found:**
   - Run `npm run scan` to rebuild music library database
   - Check `MUSIC_DIR` environment variable
   - Verify MP3 files exist in directory

2. **Alexa signature verification failures:**
   - Set `ALEXA_VERIFY_SIGNATURE=false` for testing
   - For production, ensure `ALEXA_SKILL_ID` is correct

3. **Tunnel connection issues:**
   - Check tunnel status: `cloudflared tunnel info alexa-music-tunnel`
   - Verify DNS: `nslookup alexa-music.moerin.com`
   - Check tunnel is running: `cloudflared tunnel list`

4. **Echo device doesn't recognize skill:**
   - Verify same Amazon account on Echo and Developer Console
   - Check test mode is "開発中" (Development)
   - Complete Distribution tab settings
   - Wait 5 minutes to 24 hours for propagation

## File Locations

**Critical Files:**
- `src/index.js` - Main server entry point
- `src/controllers/alexaController.js` - Alexa intent handlers
- `src/services/musicLibrary.js` - Music database and search
- `data/music-library.json` - Music metadata database (git-ignored)
- `alexa-skill/interactionModel.json` - Alexa skill definition
- `STATUS.md` - Current project status and next steps
- `.env` - Environment configuration (git-ignored)

**Cloudflare Files:**
- `~/.cloudflared/config.yml` - Tunnel configuration
- `~/.cloudflared/cert.pem` - Authentication certificate
- `~/.cloudflared/<tunnel-id>.json` - Tunnel credentials

## Development Workflow

### Adding New Music
1. Add MP3 files to `MUSIC_DIR`
2. Run `npm run scan` to update database
3. Restart server if already running

### Modifying Alexa Intents
1. Update `alexa-skill/interactionModel.json`
2. Upload to Amazon Developer Console → JSON Editor
3. Click "Save Model" → "Build Model"
4. Update handler in `src/controllers/alexaController.js`
5. Restart server

### Testing Changes
1. Test locally: `curl http://localhost:3000/search?q=test`
2. Test simulator: Developer Console → Test tab
3. Test HTTPS: `curl https://alexa-music.moerin.com/health`
4. Test Echo: "アレクサ、モカモカを開いて"
5. Check logs: `tail -f logs/app.log`

## Production Deployment

### Running as Service (PM2)
```bash
# Install PM2
npm install -g pm2

# Start services
pm2 start src/index.js --name alexa-music-server
pm2 start "cloudflared tunnel run alexa-music-tunnel" --name cloudflare-tunnel

# Auto-start on boot
pm2 save
pm2 startup

# Management
pm2 status
pm2 logs alexa-music-server
pm2 restart alexa-music-server
```

### Security for Production
1. Set `ALEXA_VERIFY_SIGNATURE=true`
2. Set `ALEXA_SKILL_ID` to your skill ID
3. Use `NODE_ENV=production`
4. Enable Mac to stay awake (System Preferences)
5. Consider firewall rules if needed

## Claude Code Skills Available

This project can leverage the following Claude Code skill for enhanced development assistance:

- **alexa-skill-kit**: `/Users/shiwei.zhu/.claude/skills/alexa-skill-kit`
  - Comprehensive assistance with Alexa Skills Kit development
  - Access to official Alexa documentation and best practices
  - Use when debugging Alexa-specific issues or implementing new features

## Important Notes for Real Device Testing

### Developer Console Distribution Tab Setup (Required for Real Devices)

**Critical**: Even for development/testing, AudioPlayer-based skills require completing the Distribution tab in Amazon Developer Console before they will work on real Echo devices.

**Required Steps**:
1. Navigate to: https://developer.amazon.com/alexa/console/ask
2. Select your skill → Distribution tab
3. Complete **Privacy & Compliance** section (all questions required)
4. Add skill descriptions (simple and detailed)
5. Click **Save Distribution**
6. Wait 5 minutes to several hours for propagation to devices

**Why This Matters**:
- Simulator testing works without Distribution tab completion
- Real Echo devices require privacy/compliance information even in development mode
- This is the most common cause of "お役に立てません" (Can't help with that) errors on real devices

### Testing Workflow

**Simulator Testing** (works immediately):
- Developer Console → Test tab → Enable Testing in Development
- Voice commands work, but AudioPlayer streaming is simulated (no actual audio)
- Logs will NOT show `/stream/:trackId` requests (this is normal)

**Real Device Testing** (requires Distribution tab completion):
- Ensure Distribution tab is completed and saved
- Wait for propagation (5 minutes to 24 hours)
- Test with: "アレクサ、モカモカを開いて"
- Logs WILL show `/stream/:trackId` requests when working correctly
- Look for "Playback started" log entry as confirmation of success

### Debugging Real Device Issues

**Check logs** (`logs/app.log`):
```bash
tail -f logs/app.log
```

**Expected successful sequence**:
1. `POST /alexa` - Initial skill invocation
2. `PlayMusicIntent: query="..."` - Intent processing
3. `Playing: [track] by [artist]` - Track selection
4. `GET /stream/:trackId` - Audio streaming request
5. `Streaming [track]` - Stream delivery
6. `Playback started: [trackId]` - Confirmation from Echo device

**If "Playback failed" appears**:
- Enhanced error logging will show detailed error information
- Check error.type and error.message for specific cause
- Common issues: network problems, file format, or Console configuration

## Advanced Troubleshooting

**If the Developer Console simulator works but real Echo devices show errors**, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for detailed debugging steps, including the critical amazon.com vs amazon.co.jp account separation issue.

---

## Additional Resources

- Amazon Developer Console: https://developer.amazon.com/alexa
- Alexa Skills Kit Documentation: https://developer.amazon.com/docs/ask-overviews/build-skills-with-the-alexa-skills-kit.html
- Cloudflare Tunnel Docs: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
- music-metadata library: https://github.com/Borewit/music-metadata
