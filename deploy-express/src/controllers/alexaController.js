const Alexa = require('ask-sdk-core');
const config = require('../config/config');
const logger = require('../utils/logger');
const musicLibrary = require('../services/musicLibrary');
const playlistManager = require('../services/playlistManager');

// Helper function to build Audio Player directive
function buildAudioDirective(playBehavior, track, offsetInMilliseconds = 0) {
  const streamUrl = `${config.server.publicUrl}/stream/${track.id}`;

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
        title: track.title,
        subtitle: track.artist,
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

// LaunchRequest Handler
const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    const speakOutput = 'マイミュージックへようこそ。曲名を言って再生できます。何を聴きたいですか？';

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  }
};

// PlayMusicIntent Handler
const PlayMusicIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'PlayMusicIntent';
  },
  handle(handlerInput) {
    const sessionId = handlerInput.requestEnvelope.session.sessionId;
    const slots = handlerInput.requestEnvelope.request.intent.slots;

    let query = '';
    if (slots.query && slots.query.value) {
      query = slots.query.value;
    }

    logger.info(`PlayMusicIntent: query="${query}"`);

    if (!query) {
      const speakOutput = '曲名が聞き取れませんでした。もう一度言ってください。';
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt(speakOutput)
        .getResponse();
    }

    // Search for tracks
    const results = musicLibrary.searchTracks(query.trim());

    if (results.length === 0) {
      const speakOutput = `${query}が見つかりませんでした。別の曲名で試してください。`;
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt(speakOutput)
        .getResponse();
    }

    // Get the first result
    const track = results[0];
    logger.info(`Playing: ${track.title} by ${track.artist}`);

    // Create playlist session with all results
    const trackIds = results.map(t => t.id);
    playlistManager.createSession(sessionId, trackIds, 0);

    const speakOutput = `${track.title}を再生します。`;

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .addDirective(buildAudioDirective('REPLACE_ALL', track))
      .getResponse();
  }
};

// Next Intent Handler
const NextIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NextIntent';
  },
  handle(handlerInput) {
    const sessionId = handlerInput.requestEnvelope.session.sessionId;

    const nextTrackId = playlistManager.nextTrack(sessionId);

    if (!nextTrackId) {
      const speakOutput = '次の曲はありません。';
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .getResponse();
    }

    const track = musicLibrary.findById(nextTrackId);
    if (!track) {
      const speakOutput = '次の曲が見つかりませんでした。';
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .getResponse();
    }

    logger.info(`Next track: ${track.title}`);

    return handlerInput.responseBuilder
      .addDirective(buildAudioDirective('REPLACE_ALL', track))
      .getResponse();
  }
};

// Previous Intent Handler
const PreviousIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.PreviousIntent';
  },
  handle(handlerInput) {
    const sessionId = handlerInput.requestEnvelope.session.sessionId;

    const prevTrackId = playlistManager.previousTrack(sessionId);

    if (!prevTrackId) {
      const speakOutput = '前の曲はありません。';
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .getResponse();
    }

    const track = musicLibrary.findById(prevTrackId);
    if (!track) {
      const speakOutput = '前の曲が見つかりませんでした。';
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .getResponse();
    }

    logger.info(`Previous track: ${track.title}`);

    return handlerInput.responseBuilder
      .addDirective(buildAudioDirective('REPLACE_ALL', track))
      .getResponse();
  }
};

// Pause Intent Handler
const PauseIntentHandler = {
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

// Resume Intent Handler
const ResumeIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.ResumeIntent';
  },
  handle(handlerInput) {
    const sessionId = handlerInput.requestEnvelope.session.sessionId;
    const currentTrackId = playlistManager.getCurrentTrack(sessionId);

    if (!currentTrackId) {
      const speakOutput = '再生する曲がありません。曲名を言ってください。';
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt(speakOutput)
        .getResponse();
    }

    const track = musicLibrary.findById(currentTrackId);
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

// Stop/Cancel Intent Handler
const StopCancelIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
        || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
  },
  handle(handlerInput) {
    const speakOutput = '停止します。';

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .addDirective({
        type: 'AudioPlayer.Stop'
      })
      .getResponse();
  }
};

// AudioPlayer.PlaybackStarted Handler
const PlaybackStartedHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'AudioPlayer.PlaybackStarted';
  },
  handle(handlerInput) {
    const token = handlerInput.requestEnvelope.request.token;
    logger.info(`Playback started: ${token}`);

    return handlerInput.responseBuilder.getResponse();
  }
};

// AudioPlayer.PlaybackFinished Handler
const PlaybackFinishedHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'AudioPlayer.PlaybackFinished';
  },
  handle(handlerInput) {
    const token = handlerInput.requestEnvelope.request.token;
    logger.info(`Playback finished: ${token}`);

    return handlerInput.responseBuilder.getResponse();
  }
};

// AudioPlayer.PlaybackNearlyFinished Handler
const PlaybackNearlyFinishedHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'AudioPlayer.PlaybackNearlyFinished';
  },
  handle(handlerInput) {
    const sessionId = handlerInput.requestEnvelope.context.System.device.deviceId;

    if (!playlistManager.hasNextTrack(sessionId)) {
      return handlerInput.responseBuilder.getResponse();
    }

    const nextTrackId = playlistManager.nextTrack(sessionId);
    if (!nextTrackId) {
      return handlerInput.responseBuilder.getResponse();
    }

    const track = musicLibrary.findById(nextTrackId);
    if (!track) {
      return handlerInput.responseBuilder.getResponse();
    }

    logger.info(`Enqueueing next track: ${track.title}`);

    return handlerInput.responseBuilder
      .addDirective(buildAudioDirective('ENQUEUE', track))
      .getResponse();
  }
};

// AudioPlayer.PlaybackFailed Handler
const PlaybackFailedHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'AudioPlayer.PlaybackFailed';
  },
  handle(handlerInput) {
    const error = handlerInput.requestEnvelope.request.error;
    const currentToken = handlerInput.requestEnvelope.request.token;

    logger.error('AudioPlayer.PlaybackFailed:', {
      type: error?.type,
      message: error?.message,
      token: currentToken,
      fullError: JSON.stringify(error, null, 2)
    });

    return handlerInput.responseBuilder.getResponse();
  }
};

// Help Intent Handler
const HelpIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const speakOutput = '曲名を言って再生できます。例えば、「Summer Dreamを再生して」のように言ってください。';

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  }
};

// Session Ended Handler
const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    logger.info('Session ended');
    return handlerInput.responseBuilder.getResponse();
  }
};

// Error Handler
const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    logger.error('Alexa skill error:', error);

    const speakOutput = 'すみません、エラーが発生しました。もう一度試してください。';

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  }
};

// Build Alexa Skill
const skillBuilder = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    PlayMusicIntentHandler,
    NextIntentHandler,
    PreviousIntentHandler,
    PauseIntentHandler,
    ResumeIntentHandler,
    StopCancelIntentHandler,
    PlaybackStartedHandler,
    PlaybackFinishedHandler,
    PlaybackNearlyFinishedHandler,
    PlaybackFailedHandler,
    HelpIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler);

// Export request handler for Express
async function handleAlexaRequest(req, res) {
  try {
    logger.info('Processing Alexa request...');
    const skill = skillBuilder.create();
    const response = await skill.invoke(req.body, req.headers);

    logger.info('Alexa response generated successfully');
    res.json(response);
  } catch (error) {
    logger.error('Error handling Alexa request:', error.message);
    logger.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  handleAlexaRequest
};
