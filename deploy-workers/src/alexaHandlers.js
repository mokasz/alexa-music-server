/**
 * Alexa Skill Handlers for Cloudflare Workers
 *
 * Implements Alexa intent handlers using ask-sdk-core
 * Uses KV adapters for music library and playlist management
 */

import Alexa from 'ask-sdk-core';

/**
 * Build Audio Player directive for streaming
 * @param {string} playBehavior - REPLACE_ALL, ENQUEUE, REPLACE_ENQUEUED
 * @param {Object} track - Track object with ID
 * @param {number} offsetInMilliseconds - Starting offset
 * @param {string} publicUrl - Worker public URL
 * @returns {Object} AudioPlayer directive
 */
function buildAudioDirective(playBehavior, track, offsetInMilliseconds = 0, publicUrl = 'https://alexa-music-workers.swiftzhu.workers.dev') {
  // Use Worker's stream endpoint instead of direct Google Drive URL
  const streamUrl = `${publicUrl}/stream/${track.id}`;

  return {
    type: 'AudioPlayer.Play',
    playBehavior: playBehavior,
    audioItem: {
      stream: {
        url: streamUrl,
        token: track.id,
        offsetInMilliseconds: offsetInMilliseconds
      },
      metadata: {
        title: track.title || 'Unknown Title',
        subtitle: track.artist || 'Unknown Artist',
        art: {
          sources: [
            {
              url: 'https://via.placeholder.com/512x512.png?text=Music'
            }
          ]
        }
      }
    }
  };
}

/**
 * LaunchRequest Handler
 * Handles skill launch ("アレクサ、モカモカを開いて")
 */
export const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    const speakOutput = 'はい、何を再生しますか';

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  }
};

/**
 * PlayMusicIntent Handler
 * Handles music playback requests
 */
export const PlayMusicIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'PlayMusicIntent';
  },
  async handle(handlerInput) {
    const { musicLibrary, playlistManager } = handlerInput.requestEnvelope.context.env;
    const sessionId = handlerInput.requestEnvelope.session.sessionId;
    const slots = handlerInput.requestEnvelope.request.intent.slots;

    let query = '';
    if (slots.query && slots.query.value) {
      query = slots.query.value;
    }

    console.log(`PlayMusicIntent: query="${query}"`);

    if (!query) {
      const speakOutput = '曲名が聞き取れませんでした。もう一度言ってください。';
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt(speakOutput)
        .getResponse();
    }

    // Search for tracks (async)
    const results = await musicLibrary.searchTracks(query.trim());

    if (results.length === 0) {
      const speakOutput = `${query}が見つかりませんでした。別の曲名で試してください。`;
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt(speakOutput)
        .getResponse();
    }

    // Get the first result
    const track = results[0];
    console.log(`Playing: ${track.title} by ${track.artist}`);

    // Create playlist session with all results
    const trackIds = results.map(t => t.id);
    await playlistManager.createSession(sessionId, trackIds, 0);

    const speakOutput = `${track.title}を再生します。`;

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .addDirective(buildAudioDirective('REPLACE_ALL', track))
      .getResponse();
  }
};

/**
 * NextIntent Handler
 * Handles "次の曲" requests
 */
export const NextIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NextIntent'
        || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.SkipIntent');
  },
  async handle(handlerInput) {
    const { musicLibrary, playlistManager } = handlerInput.requestEnvelope.context.env;
    const sessionId = handlerInput.requestEnvelope.session.sessionId;

    const nextTrackId = await playlistManager.getNextTrack(sessionId);

    if (!nextTrackId) {
      const speakOutput = 'これが最後の曲です。';
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .getResponse();
    }

    const track = await musicLibrary.findById(nextTrackId);

    if (!track) {
      const speakOutput = '曲が見つかりませんでした。';
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .getResponse();
    }

    console.log(`Next track: ${track.title}`);

    return handlerInput.responseBuilder
      .addDirective(buildAudioDirective('REPLACE_ALL', track))
      .getResponse();
  }
};

/**
 * PreviousIntent Handler
 * Handles "前の曲" requests
 */
export const PreviousIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.PreviousIntent';
  },
  async handle(handlerInput) {
    const { musicLibrary, playlistManager } = handlerInput.requestEnvelope.context.env;
    const sessionId = handlerInput.requestEnvelope.session.sessionId;

    const prevTrackId = await playlistManager.getPreviousTrack(sessionId);

    if (!prevTrackId) {
      const speakOutput = 'これが最初の曲です。';
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .getResponse();
    }

    const track = await musicLibrary.findById(prevTrackId);

    if (!track) {
      const speakOutput = '曲が見つかりませんでした。';
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .getResponse();
    }

    console.log(`Previous track: ${track.title}`);

    return handlerInput.responseBuilder
      .addDirective(buildAudioDirective('REPLACE_ALL', track))
      .getResponse();
  }
};

/**
 * Pause Intent Handler
 */
export const PauseIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.PauseIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .addDirective({
        type: 'AudioPlayer.Stop'
      })
      .getResponse();
  }
};

/**
 * Resume Intent Handler
 */
export const ResumeIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.ResumeIntent';
  },
  async handle(handlerInput) {
    const { musicLibrary, playlistManager } = handlerInput.requestEnvelope.context.env;
    const sessionId = handlerInput.requestEnvelope.session.sessionId;

    const trackId = await playlistManager.getCurrentTrack(sessionId);

    if (!trackId) {
      const speakOutput = 'プレイリストが見つかりません。曲名を言ってください。';
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt(speakOutput)
        .getResponse();
    }

    const track = await musicLibrary.findById(trackId);

    if (!track) {
      const speakOutput = '曲が見つかりませんでした。';
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .getResponse();
    }

    return handlerInput.responseBuilder
      .addDirective(buildAudioDirective('REPLACE_ALL', track))
      .getResponse();
  }
};

/**
 * Help Intent Handler
 */
export const HelpIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const speakOutput = '曲名を言って再生できます。例えば、「江戸時代初期を再生」と言ってください。';

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  }
};

/**
 * Cancel and Stop Intent Handler
 */
export const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
        || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
  },
  handle(handlerInput) {
    const speakOutput = 'さようなら。';

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .addDirective({
        type: 'AudioPlayer.Stop'
      })
      .getResponse();
  }
};

/**
 * Session Ended Request Handler
 */
export const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log(`Session ended: ${JSON.stringify(handlerInput.requestEnvelope.request.reason)}`);
    return handlerInput.responseBuilder.getResponse();
  }
};

/**
 * Generic Error Handler
 */
export const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.error(`Error handled: ${error.message}`);
    console.error(error.stack);

    const speakOutput = 'すみません、エラーが発生しました。もう一度試してください。';

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  }
};

/**
 * All Alexa handlers
 */
export const alexaHandlers = [
  LaunchRequestHandler,
  PlayMusicIntentHandler,
  NextIntentHandler,
  PreviousIntentHandler,
  PauseIntentHandler,
  ResumeIntentHandler,
  HelpIntentHandler,
  CancelAndStopIntentHandler,
  SessionEndedRequestHandler
];

export default {
  handlers: alexaHandlers,
  errorHandler: ErrorHandler
};
