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
    const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;
    const slots = handlerInput.requestEnvelope.request.intent.slots;

    let query = '';
    if (slots.query && slots.query.value) {
      query = slots.query.value;
    }

    console.log(`PlayMusicIntent: query="${query}" (deviceId: ${deviceId})`);

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

    // deviceIdでセッション作成（AudioPlayerイベントと統一）
    const trackIds = results.map(t => t.id);
    await playlistManager.createSession(deviceId, trackIds, 0);

    // 新しいプレイリストの位置をリセット
    await playlistManager.updatePlaybackPosition(deviceId, 0, 'PLAYING');
    await playlistManager.resetRetryCount(deviceId);

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
    const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;

    const nextTrackId = await playlistManager.getNextTrack(deviceId);

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

    console.log(`Next track: ${track.title} (deviceId: ${deviceId})`);

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
    const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;

    const prevTrackId = await playlistManager.getPreviousTrack(deviceId);

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

    console.log(`Previous track: ${track.title} (deviceId: ${deviceId})`);

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
    const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;

    // deviceIdで試す（AudioPlayerイベントはdeviceIdで保存される）
    let trackId = await playlistManager.getCurrentTrack(deviceId);
    let lookupId = deviceId;

    // deviceIdで見つからなければsessionIdで試す
    if (!trackId) {
      trackId = await playlistManager.getCurrentTrack(sessionId);
      lookupId = sessionId;
    }

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

    // 推定位置を取得してレジューム（30秒ごとに自動更新された最新位置）
    const estimatedPosition = await playlistManager.estimatePlaybackPosition(lookupId);
    console.log(`Resuming ${track.title} from estimated ${estimatedPosition}ms (using ${lookupId === deviceId ? 'deviceId' : 'sessionId'})`);

    return handlerInput.responseBuilder
      .addDirective(buildAudioDirective('REPLACE_ALL', track, estimatedPosition))
      .getResponse();
  }
};

/**
 * Fast Forward Intent Handler
 * 早送りハンドラー
 * 音声コマンド例:
 * - "10秒早送りして" / "10秒早送り"
 * - "早送り" (デフォルト15秒)
 * - "30秒スキップして"
 */
export const FastForwardIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'FastForwardIntent';
  },
  async handle(handlerInput) {
    const { musicLibrary, playlistManager } = handlerInput.requestEnvelope.context.env;
    const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;
    const slots = handlerInput.requestEnvelope.request.intent.slots;

    // 秒数を取得（デフォルト15秒）
    let secondsToSkip = 15;
    if (slots.seconds && slots.seconds.value) {
      secondsToSkip = parseInt(slots.seconds.value, 10);
    }

    const millisecondsToSkip = secondsToSkip * 1000;

    console.log(`Fast forward request: ${secondsToSkip} seconds (device: ${deviceId})`);

    // 現在のトラックを取得
    const trackId = await playlistManager.getCurrentTrack(deviceId);

    if (!trackId) {
      return handlerInput.responseBuilder
        .speak('現在再生中の曲がありません。')
        .getResponse();
    }

    const track = await musicLibrary.findById(trackId);

    if (!track) {
      return handlerInput.responseBuilder
        .speak('曲が見つかりません。')
        .getResponse();
    }

    // 現在位置を推定
    const currentPosition = await playlistManager.estimatePlaybackPosition(deviceId);
    const newPosition = currentPosition + millisecondsToSkip;

    console.log(`Fast forward: ${currentPosition}ms -> ${newPosition}ms (+${millisecondsToSkip}ms)`);

    // 新しい位置から再生
    await playlistManager.updatePlaybackPosition(deviceId, newPosition, 'PLAYING');

    return handlerInput.responseBuilder
      .addDirective(buildAudioDirective('REPLACE_ALL', track, newPosition))
      .getResponse();
  }
};

/**
 * Rewind Intent Handler
 * 巻き戻しハンドラー
 * 音声コマンド例:
 * - "10秒巻き戻して" / "10秒巻き戻し"
 * - "巻き戻し" (デフォルト15秒)
 * - "10秒戻して"
 */
export const RewindIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'RewindIntent';
  },
  async handle(handlerInput) {
    const { musicLibrary, playlistManager } = handlerInput.requestEnvelope.context.env;
    const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;
    const slots = handlerInput.requestEnvelope.request.intent.slots;

    // 秒数を取得（デフォルト15秒）
    let secondsToRewind = 15;
    if (slots.seconds && slots.seconds.value) {
      secondsToRewind = parseInt(slots.seconds.value, 10);
    }

    const millisecondsToRewind = secondsToRewind * 1000;

    console.log(`Rewind request: ${secondsToRewind} seconds (device: ${deviceId})`);

    // 現在のトラックを取得
    const trackId = await playlistManager.getCurrentTrack(deviceId);

    if (!trackId) {
      return handlerInput.responseBuilder
        .speak('現在再生中の曲がありません。')
        .getResponse();
    }

    const track = await musicLibrary.findById(trackId);

    if (!track) {
      return handlerInput.responseBuilder
        .speak('曲が見つかりません。')
        .getResponse();
    }

    // 現在位置を推定
    const currentPosition = await playlistManager.estimatePlaybackPosition(deviceId);
    const newPosition = Math.max(0, currentPosition - millisecondsToRewind); // 0未満にならないようにする

    console.log(`Rewind: ${currentPosition}ms -> ${newPosition}ms (-${millisecondsToRewind}ms)`);

    // 新しい位置から再生
    await playlistManager.updatePlaybackPosition(deviceId, newPosition, 'PLAYING');

    return handlerInput.responseBuilder
      .addDirective(buildAudioDirective('REPLACE_ALL', track, newPosition))
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
 * AudioPlayer.PlaybackStarted Handler
 * 再生開始時に呼ばれる
 */
export const PlaybackStartedHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'AudioPlayer.PlaybackStarted';
  },
  async handle(handlerInput) {
    const { playlistManager } = handlerInput.requestEnvelope.context.env;
    const token = handlerInput.requestEnvelope.request.token;
    const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;
    const offsetInMilliseconds = handlerInput.requestEnvelope.request.offsetInMilliseconds || 0;

    console.log(`Playback started: ${token} at ${offsetInMilliseconds}ms (device: ${deviceId})`);

    // 再生状態を更新
    await playlistManager.setPlaybackState(deviceId, 'PLAYING');
    await playlistManager.resetRetryCount(deviceId);

    // 新規: 再生開始時刻と位置を記録（早送り/巻き戻し用）
    await playlistManager.recordPlaybackStart(deviceId, offsetInMilliseconds);

    return handlerInput.responseBuilder.getResponse();
  }
};

/**
 * AudioPlayer.PlaybackStopped Handler (最重要)
 * 一時停止時や中断時に呼ばれる - 再生位置を保存
 */
export const PlaybackStoppedHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'AudioPlayer.PlaybackStopped';
  },
  async handle(handlerInput) {
    const { playlistManager } = handlerInput.requestEnvelope.context.env;
    const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;
    const token = handlerInput.requestEnvelope.request.token;
    const offsetInMilliseconds = handlerInput.requestEnvelope.request.offsetInMilliseconds || 0;

    console.log(`Playback stopped: ${token} at ${offsetInMilliseconds}ms (device: ${deviceId})`);

    // レジューム用に位置を保存
    await playlistManager.updatePlaybackPosition(deviceId, offsetInMilliseconds, 'PAUSED');

    return handlerInput.responseBuilder.getResponse();
  }
};

/**
 * AudioPlayer.PlaybackFinished Handler
 * トラックが自然に完了した時に呼ばれる
 */
export const PlaybackFinishedHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'AudioPlayer.PlaybackFinished';
  },
  async handle(handlerInput) {
    const { playlistManager } = handlerInput.requestEnvelope.context.env;
    const token = handlerInput.requestEnvelope.request.token;
    const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;

    console.log(`Playback finished: ${token} (device: ${deviceId})`);

    // このトラックの位置をリセット（完了）
    await playlistManager.updatePlaybackPosition(deviceId, 0, 'IDLE');

    return handlerInput.responseBuilder.getResponse();
  }
};

/**
 * AudioPlayer.PlaybackNearlyFinished Handler
 * トラック終了間近に呼ばれる - 次のトラックをキューイング
 */
export const PlaybackNearlyFinishedHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'AudioPlayer.PlaybackNearlyFinished';
  },
  async handle(handlerInput) {
    const { musicLibrary, playlistManager } = handlerInput.requestEnvelope.context.env;
    const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;

    const hasNext = await playlistManager.hasNextTrack(deviceId);
    if (!hasNext) {
      console.log(`No next track for device ${deviceId}`);
      return handlerInput.responseBuilder.getResponse();
    }

    const nextTrackId = await playlistManager.getNextTrack(deviceId);
    if (!nextTrackId) {
      return handlerInput.responseBuilder.getResponse();
    }

    const track = await musicLibrary.findById(nextTrackId);
    if (!track) {
      return handlerInput.responseBuilder.getResponse();
    }

    console.log(`Enqueueing next track: ${track.title}`);

    return handlerInput.responseBuilder
      .addDirective(buildAudioDirective('ENQUEUE', track, 0))
      .getResponse();
  }
};

/**
 * AudioPlayer.PlaybackFailed Handler (強化版)
 * 再生失敗時に呼ばれる - 自動リトライとエラーリカバリー
 */
export const PlaybackFailedHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'AudioPlayer.PlaybackFailed';
  },
  async handle(handlerInput) {
    const { musicLibrary, playlistManager } = handlerInput.requestEnvelope.context.env;
    const error = handlerInput.requestEnvelope.request.error;
    const currentToken = handlerInput.requestEnvelope.request.token;
    const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;

    console.error('AudioPlayer.PlaybackFailed:', {
      type: error?.type,
      message: error?.message,
      token: currentToken,
      deviceId: deviceId
    });

    // エラーをセッションに記録
    await playlistManager.recordError(deviceId, {
      type: error?.type,
      message: error?.message,
      timestamp: new Date().toISOString(),
      trackId: currentToken
    });

    // リトライ回数を取得
    const session = await playlistManager.getSession(deviceId);
    const retryCount = session?.retryCount || 0;

    // リトライロジック: 最大2回まで
    if (retryCount < 2) {
      await playlistManager.incrementRetryCount(deviceId);

      const track = await musicLibrary.findById(currentToken);
      if (track) {
        console.log(`Retrying playback for ${track.title} (attempt ${retryCount + 1})`);

        return handlerInput.responseBuilder
          .addDirective(buildAudioDirective('REPLACE_ALL', track, 0))
          .getResponse();
      }
    }

    // 2回リトライ後、次のトラックにスキップ
    console.log(`Max retries reached for ${currentToken}, skipping to next track`);
    await playlistManager.resetRetryCount(deviceId);

    const nextTrackId = await playlistManager.getNextTrack(deviceId);
    if (nextTrackId) {
      const nextTrack = await musicLibrary.findById(nextTrackId);
      if (nextTrack) {
        return handlerInput.responseBuilder
          .speak('前の曲が再生できませんでした。次の曲を再生します。')
          .addDirective(buildAudioDirective('REPLACE_ALL', nextTrack, 0))
          .getResponse();
      }
    }

    // 次のトラックもない場合、終了
    return handlerInput.responseBuilder
      .speak('申し訳ございません。再生に失敗しました。')
      .getResponse();
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

  // 新規: シーク機能
  FastForwardIntentHandler,
  RewindIntentHandler,

  HelpIntentHandler,
  CancelAndStopIntentHandler,
  SessionEndedRequestHandler,

  // AudioPlayerライフサイクルハンドラー
  PlaybackStartedHandler,
  PlaybackStoppedHandler,
  PlaybackFinishedHandler,
  PlaybackNearlyFinishedHandler,
  PlaybackFailedHandler
];

export default {
  handlers: alexaHandlers,
  errorHandler: ErrorHandler
};
