/**
 * Session Durable Object
 *
 * Manages playback session state with automatic position tracking
 * Uses Durable Object Alarms to record position every 30 seconds
 */

export class SessionDurableObject {
  /**
   * @param {DurableObjectState} state - Durable Object state
   * @param {Object} env - Environment bindings
   */
  constructor(state, env) {
    this.state = state;
    this.env = env;

    // Blocking ensures storage operations complete before request returns
    this.state.blockConcurrencyWhile(async () => {
      // Load session from storage (persists across Durable Object lifecycle)
      this.session = await this.state.storage.get('session') || {
        sessionId: null,
        trackIds: [],
        currentIndex: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),

        // Playback position tracking
        offsetInMilliseconds: 0,
        playbackState: 'IDLE', // PLAYING, PAUSED, STOPPED, IDLE
        currentToken: null,
        lastPlaybackTimestamp: new Date().toISOString(),

        // Error recovery
        retryCount: 0,
        lastError: null,

        // Position estimation (for fast-forward/rewind)
        playbackStartedAt: null,  // ISO timestamp when playback started
        playbackStartOffset: 0     // offsetInMilliseconds when playback started
      };
    });
  }

  /**
   * Handle HTTP requests to this Durable Object
   * @param {Request} request - Incoming HTTP request
   * @returns {Promise<Response>} Response
   */
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // POST /create - Create new session
      if (path === '/create' && request.method === 'POST') {
        const { sessionId, trackIds, currentIndex } = await request.json();
        return await this.createSession(sessionId, trackIds, currentIndex);
      }

      // GET /session - Get session data
      if (path === '/session' && request.method === 'GET') {
        return new Response(JSON.stringify(this.session), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // POST /update-position - Update playback position
      if (path === '/update-position' && request.method === 'POST') {
        const { offsetInMilliseconds, playbackState } = await request.json();
        return await this.updatePlaybackPosition(offsetInMilliseconds, playbackState);
      }

      // POST /record-start - Record playback start
      if (path === '/record-start' && request.method === 'POST') {
        const { offsetInMilliseconds } = await request.json();
        return await this.recordPlaybackStart(offsetInMilliseconds);
      }

      // GET /estimate-position - Estimate current position
      if (path === '/estimate-position' && request.method === 'GET') {
        const estimatedPosition = this.estimatePlaybackPosition();
        return new Response(JSON.stringify({ offsetInMilliseconds: estimatedPosition }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // POST /update-index - Update current track index
      if (path === '/update-index' && request.method === 'POST') {
        const { index } = await request.json();
        return await this.updateCurrentIndex(index);
      }

      // POST /set-state - Set playback state
      if (path === '/set-state' && request.method === 'POST') {
        const { playbackState } = await request.json();
        return await this.setPlaybackState(playbackState);
      }

      // POST /reset-retry - Reset retry count
      if (path === '/reset-retry' && request.method === 'POST') {
        return await this.resetRetryCount();
      }

      // POST /increment-retry - Increment retry count
      if (path === '/increment-retry' && request.method === 'POST') {
        return await this.incrementRetryCount();
      }

      // POST /record-error - Record error
      if (path === '/record-error' && request.method === 'POST') {
        const error = await request.json();
        return await this.recordError(error);
      }

      // GET /current-track - Get current track ID
      if (path === '/current-track' && request.method === 'GET') {
        const trackId = this.session.trackIds[this.session.currentIndex];
        return new Response(JSON.stringify({ trackId }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // GET /next-track - Get next track ID
      if (path === '/next-track' && request.method === 'GET') {
        const nextIndex = this.session.currentIndex + 1;
        if (nextIndex < this.session.trackIds.length) {
          return new Response(JSON.stringify({ trackId: this.session.trackIds[nextIndex] }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({ trackId: null }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // GET /has-next - Check if has next track
      if (path === '/has-next' && request.method === 'GET') {
        const hasNext = this.session.currentIndex + 1 < this.session.trackIds.length;
        return new Response(JSON.stringify({ hasNext }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // POST /next - Move to next track
      if (path === '/next' && request.method === 'POST') {
        return await this.nextTrack();
      }

      // POST /previous - Move to previous track
      if (path === '/previous' && request.method === 'POST') {
        return await this.previousTrack();
      }

      return new Response('Not Found', { status: 404 });

    } catch (error) {
      console.error('SessionDurableObject error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * Alarm handler - Called every 30 seconds while PLAYING
   * Saves estimated position to KV as backup
   */
  async alarm() {
    console.log(`[Alarm] Triggered for session ${this.session.sessionId}`);

    try {
      // Only process if session is PLAYING
      if (this.session.playbackState !== 'PLAYING') {
        console.log(`[Alarm] Session ${this.session.sessionId} is ${this.session.playbackState}, skipping`);
        return;
      }

      // Estimate current position
      const estimatedPosition = this.estimatePlaybackPosition();

      // Update position in memory
      this.session.offsetInMilliseconds = estimatedPosition;
      this.session.lastPlaybackTimestamp = new Date().toISOString();
      this.session.updatedAt = new Date().toISOString();

      // Save to Durable Object storage
      await this.state.storage.put('session', this.session);

      // Note: KV backup removed to avoid exceeding free tier write limits
      // Durable Objects already provide persistent storage

      console.log(`[Alarm] Updated position for ${this.session.sessionId}: ${estimatedPosition}ms`);

      // Schedule next alarm in 30 seconds (only if still PLAYING)
      if (this.session.playbackState === 'PLAYING') {
        await this.state.storage.setAlarm(Date.now() + 30000);
        console.log(`[Alarm] Next alarm scheduled for ${this.session.sessionId} in 30 seconds`);
      }

    } catch (error) {
      console.error(`[Alarm] Error for session ${this.session.sessionId}:`, error.message);
    }
  }

  /**
   * Create new session
   * @param {string} sessionId - Session/Device ID
   * @param {Array<string>} trackIds - Array of track IDs
   * @param {number} currentIndex - Current track index
   * @returns {Promise<Response>} Response
   */
  async createSession(sessionId, trackIds, currentIndex = 0) {
    if (!sessionId || !trackIds || trackIds.length === 0) {
      return new Response('Invalid parameters', { status: 400 });
    }

    this.session = {
      sessionId,
      trackIds,
      currentIndex,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      offsetInMilliseconds: 0,
      playbackState: 'IDLE',
      currentToken: trackIds[currentIndex],
      lastPlaybackTimestamp: new Date().toISOString(),

      retryCount: 0,
      lastError: null,

      playbackStartedAt: null,
      playbackStartOffset: 0
    };

    // Save to Durable Object storage
    await this.state.storage.put('session', this.session);

    console.log(`Created session ${sessionId} with ${trackIds.length} tracks`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Update playback position and state
   * @param {number} offsetInMilliseconds - Position in milliseconds
   * @param {string} playbackState - State (PLAYING, PAUSED, STOPPED, IDLE)
   * @returns {Promise<Response>} Response
   */
  async updatePlaybackPosition(offsetInMilliseconds, playbackState) {
    this.session.offsetInMilliseconds = offsetInMilliseconds;
    this.session.playbackState = playbackState;
    this.session.lastPlaybackTimestamp = new Date().toISOString();
    this.session.updatedAt = new Date().toISOString();

    // Save to storage
    await this.state.storage.put('session', this.session);

    // Note: KV backup removed to avoid exceeding free tier write limits
    // Durable Objects already provide persistent storage

    // Cancel alarm if not PLAYING
    if (playbackState !== 'PLAYING') {
      await this.state.storage.deleteAlarm();
      console.log(`[Alarm] Cancelled for session ${this.session.sessionId} (state: ${playbackState})`);
    }

    console.log(`Updated position for ${this.session.sessionId}: ${offsetInMilliseconds}ms (${playbackState})`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Record playback start - sets up alarm for periodic position tracking
   * @param {number} offsetInMilliseconds - Starting position
   * @returns {Promise<Response>} Response
   */
  async recordPlaybackStart(offsetInMilliseconds) {
    this.session.playbackStartedAt = new Date().toISOString();
    this.session.playbackStartOffset = offsetInMilliseconds;
    this.session.playbackState = 'PLAYING';
    this.session.updatedAt = new Date().toISOString();

    // Save to storage
    await this.state.storage.put('session', this.session);

    // Schedule first alarm in 30 seconds
    await this.state.storage.setAlarm(Date.now() + 30000);
    console.log(`[Alarm] Scheduled for session ${this.session.sessionId} in 30 seconds`);

    console.log(`Recorded playback start: ${offsetInMilliseconds}ms at ${this.session.playbackStartedAt}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Estimate current playback position
   * @returns {number} Estimated position in milliseconds
   */
  estimatePlaybackPosition() {
    if (!this.session.playbackStartedAt) {
      return this.session.offsetInMilliseconds || 0;
    }

    const startTime = new Date(this.session.playbackStartedAt).getTime();
    const now = Date.now();
    const elapsed = now - startTime;

    const estimatedPosition = this.session.playbackStartOffset + elapsed;

    return Math.max(0, estimatedPosition);
  }

  /**
   * Update current track index
   * @param {number} index - New track index
   * @returns {Promise<Response>} Response
   */
  async updateCurrentIndex(index) {
    if (index < 0 || index >= this.session.trackIds.length) {
      return new Response('Invalid track index', { status: 400 });
    }

    this.session.currentIndex = index;
    this.session.currentToken = this.session.trackIds[index];
    this.session.updatedAt = new Date().toISOString();

    await this.state.storage.put('session', this.session);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Set playback state
   * @param {string} playbackState - New state
   * @returns {Promise<Response>} Response
   */
  async setPlaybackState(playbackState) {
    this.session.playbackState = playbackState;
    this.session.lastPlaybackTimestamp = new Date().toISOString();
    this.session.updatedAt = new Date().toISOString();

    await this.state.storage.put('session', this.session);

    // Cancel alarm if not PLAYING
    if (playbackState !== 'PLAYING') {
      await this.state.storage.deleteAlarm();
      console.log(`[Alarm] Cancelled for session ${this.session.sessionId} (state: ${playbackState})`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Reset retry count
   * @returns {Promise<Response>} Response
   */
  async resetRetryCount() {
    this.session.retryCount = 0;
    this.session.updatedAt = new Date().toISOString();

    await this.state.storage.put('session', this.session);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Increment retry count
   * @returns {Promise<Response>} Response
   */
  async incrementRetryCount() {
    this.session.retryCount++;
    this.session.updatedAt = new Date().toISOString();

    await this.state.storage.put('session', this.session);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Record error
   * @param {Object} error - Error object
   * @returns {Promise<Response>} Response
   */
  async recordError(error) {
    this.session.lastError = {
      ...error,
      timestamp: new Date().toISOString()
    };
    this.session.updatedAt = new Date().toISOString();

    await this.state.storage.put('session', this.session);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Move to next track
   * @returns {Promise<Response>} Response
   */
  async nextTrack() {
    const nextIndex = this.session.currentIndex + 1;

    if (nextIndex >= this.session.trackIds.length) {
      return new Response(JSON.stringify({ trackId: null }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    this.session.currentIndex = nextIndex;
    this.session.currentToken = this.session.trackIds[nextIndex];
    this.session.offsetInMilliseconds = 0;
    this.session.playbackStartOffset = 0;
    this.session.updatedAt = new Date().toISOString();

    await this.state.storage.put('session', this.session);

    return new Response(JSON.stringify({ trackId: this.session.currentToken }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Move to previous track
   * @returns {Promise<Response>} Response
   */
  async previousTrack() {
    const prevIndex = this.session.currentIndex - 1;

    if (prevIndex < 0) {
      return new Response(JSON.stringify({ trackId: null }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    this.session.currentIndex = prevIndex;
    this.session.currentToken = this.session.trackIds[prevIndex];
    this.session.offsetInMilliseconds = 0;
    this.session.playbackStartOffset = 0;
    this.session.updatedAt = new Date().toISOString();

    await this.state.storage.put('session', this.session);

    return new Response(JSON.stringify({ trackId: this.session.currentToken }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
