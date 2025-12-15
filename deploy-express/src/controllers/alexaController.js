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
    // ⭐ deviceIdを優先的に取得（AudioPlayerイベントと統一）
    const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;
    const sessionId = handlerInput.requestEnvelope.session.sessionId;

    // deviceId優先、なければsessionIdフォールバック
    let currentTrackId = playlistManager.getCurrentTrack(deviceId);
    let lookupId = deviceId;

    if (!currentTrackId) {
      currentTrackId = playlistManager.getCurrentTrack(sessionId);
      lookupId = sessionId;
    }

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

    // ⭐ 保存された位置から再開
    const offsetInMilliseconds = playlistManager.estimatePlaybackPosition(lookupId);
    logger.info(`Resume: ${track.title} from ${offsetInMilliseconds}ms`);

    return handlerInput.responseBuilder
      .addDirective(buildAudioDirective('REPLACE_ALL', track, offsetInMilliseconds))
      .getResponse();
  }
};

// ⭐ 新規追加: FastForward Intent Handler
const FastForwardIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'FastForwardIntent';
  },
  handle(handlerInput) {
    const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;
    const sessionId = handlerInput.requestEnvelope.session.sessionId;
    const slots = handlerInput.requestEnvelope.request.intent.slots;

    // slotsから秒数を取得（デフォルト15秒）
    let secondsToSkip = 15;
    if (slots.seconds && slots.seconds.value) {
      secondsToSkip = parseInt(slots.seconds.value, 10);
    }

    // deviceId優先、なければsessionIdフォールバック
    let currentTrackId = playlistManager.getCurrentTrack(deviceId);
    let lookupId = deviceId;

    if (!currentTrackId) {
      currentTrackId = playlistManager.getCurrentTrack(sessionId);
      lookupId = sessionId;
    }

    if (!currentTrackId) {
      const speakOutput = '再生中の曲がありません。';
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .getResponse();
    }

    const track = musicLibrary.findById(currentTrackId);
    if (!track) {
      const speakOutput = '曲が見つかりませんでした。';
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .getResponse();
    }

    // 現在位置を推定して、早送り
    const currentPosition = playlistManager.estimatePlaybackPosition(lookupId);
    const newPosition = currentPosition + (secondsToSkip * 1000);

    logger.info(`FastForward: ${track.title} from ${currentPosition}ms to ${newPosition}ms (+${secondsToSkip}s)`);

    // 新位置を保存
    playlistManager.updatePlaybackPosition(lookupId, newPosition, 'PLAYING');

    return handlerInput.responseBuilder
      .addDirective(buildAudioDirective('REPLACE_ALL', track, newPosition))
      .getResponse();
  }
};

// ⭐ 新規追加: Rewind Intent Handler
const RewindIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'RewindIntent';
  },
  handle(handlerInput) {
    const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;
    const sessionId = handlerInput.requestEnvelope.session.sessionId;
    const slots = handlerInput.requestEnvelope.request.intent.slots;

    // slotsから秒数を取得（デフォルト15秒）
    let secondsToRewind = 15;
    if (slots.seconds && slots.seconds.value) {
      secondsToRewind = parseInt(slots.seconds.value, 10);
    }

    // deviceId優先、なければsessionIdフォールバック
    let currentTrackId = playlistManager.getCurrentTrack(deviceId);
    let lookupId = deviceId;

    if (!currentTrackId) {
      currentTrackId = playlistManager.getCurrentTrack(sessionId);
      lookupId = sessionId;
    }

    if (!currentTrackId) {
      const speakOutput = '再生中の曲がありません。';
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .getResponse();
    }

    const track = musicLibrary.findById(currentTrackId);
    if (!track) {
      const speakOutput = '曲が見つかりませんでした。';
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .getResponse();
    }

    // 現在位置を推定して、巻き戻し（負の値にならないようガード）
    const currentPosition = playlistManager.estimatePlaybackPosition(lookupId);
    const newPosition = Math.max(0, currentPosition - (secondsToRewind * 1000));

    logger.info(`Rewind: ${track.title} from ${currentPosition}ms to ${newPosition}ms (-${secondsToRewind}s)`);

    // 新位置を保存
    playlistManager.updatePlaybackPosition(lookupId, newPosition, 'PLAYING');

    return handlerInput.responseBuilder
      .addDirective(buildAudioDirective('REPLACE_ALL', track, newPosition))
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
// ⭐ 拡張: 再生開始を記録（位置推定用）
const PlaybackStartedHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'AudioPlayer.PlaybackStarted';
  },
  handle(handlerInput) {
    const token = handlerInput.requestEnvelope.request.token;
    const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;
    const offsetInMilliseconds = handlerInput.requestEnvelope.request.offsetInMilliseconds || 0;

    logger.info(`Playback started: ${token} at ${offsetInMilliseconds}ms (device: ${deviceId})`);

    // ⭐ 再生開始を記録（位置推定用）
    playlistManager.recordPlaybackStart(deviceId, offsetInMilliseconds);
    playlistManager.setCurrentToken(deviceId, token);
    playlistManager.resetRetryCount(deviceId);

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
    const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;

    logger.info(`Playback finished: ${token} (device: ${deviceId})`);

    // 再生完了時は位置を0にリセット
    playlistManager.updatePlaybackPosition(deviceId, 0, 'IDLE');

    return handlerInput.responseBuilder.getResponse();
  }
};

// ⭐ 新規追加: AudioPlayer.PlaybackStopped Handler（最重要）
// 一時停止時の位置を保存（Resume用）
const PlaybackStoppedHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'AudioPlayer.PlaybackStopped';
  },
  handle(handlerInput) {
    const token = handlerInput.requestEnvelope.request.token;
    const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;
    const offsetInMilliseconds = handlerInput.requestEnvelope.request.offsetInMilliseconds || 0;

    logger.info(`Playback stopped: ${token} at ${offsetInMilliseconds}ms (device: ${deviceId})`);

    // ⭐ 一時停止位置を保存（Resume用）
    playlistManager.updatePlaybackPosition(deviceId, offsetInMilliseconds, 'PAUSED');

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
    FastForwardIntentHandler,      // ⭐ 新規追加
    RewindIntentHandler,            // ⭐ 新規追加
    StopCancelIntentHandler,
    PlaybackStartedHandler,
    PlaybackStoppedHandler,         // ⭐ 新規追加（最重要）
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
