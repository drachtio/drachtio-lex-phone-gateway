const Emitter = require('events');
const fs = require('fs');

/**
 * Class representing a call that is connected to lex
 * @class
 */
class CallSession extends Emitter {
  constructor(logger, mrf, req, res) {
    /**
     * Create a callSession.
     * @param {Object} logger - pino logger
     * @param {Object} mrf - a media resource framework instance
     * @param {Object} req - the incoming SIP request object
     * @param {Object} res - a SIP response object
     */
    super();

    this.logger = logger;
    this.req = req;
    this.res = res;
    this.mrf = mrf;
    this.srf = req.srf;

    this.metadata = {
      context: {
        callerId: req.callingName || 'anonymous',
        from: req.callingNumber,
        to: req.calledNumber,
        callId: req.get('Call-ID')
      }
    };
    if (process.env.LEX_PLATFORM) {
      Object.assign(this.metadata, {
        'x-amz-lex:channels:platform': process.env.LEX_PLATFORM,
      });
    }

    this.locale = process.env.LEX_LOCALE || 'en_US';
    this.bot = process.env.BOT_ID;
    this.alias = process.env.BOT_ALIAS_ID;
    this.region = process.env.AWS_REGION;

    if (process.env.TTS_VENDOR && process.env.TTS_LANGUAGE && process.env.TTS_VOICE) {
      this.useTts = true;
      this.vendor = process.env.TTS_VENDOR;
      this.language = process.env.TTS_LANGUAGE;
      this.voice = process.env.TS_VOICE;
    }
    else {
      this.useTts = false;
    }

    this.botName = `${this.bot}:${this.alias}:${this.region}`;

    this.tmpFiles = new Set();
  }

  get callId() {
    return this.req.get('Call-ID');
  }

  /**
   * Execute the callSession:
   *  - connect the incoming call to Freeswitch
   *  - start lex
   *  - add lex event listeners needed to move the dialog forward
   */
  async exec() {
    try {
      /* get address of freeswitch (usually running locally, but need not) */
      const ms = await this.mrf.connect({
        address: process.env.FREESWITCH_HOST || '127.0.0.1',
        port: process.env.FREESWITCH_PORT || 8021,
        secret: process.env.FREESWITCH_SECRET || 'ClueCon'
      });

      /* connect the incoming call to freeswitch */
      const {endpoint, dialog} = await ms.connectCaller(this.req, this.res);
      const ep = this.ep = endpoint;
      const dlg = this.dlg = dialog;

      this.dlg.on('destroy', () => {
        ep.destroy().catch((err) => this.logger.info(err, 'Error deleting endpoint'));
        this._clearTmpFiles();
        this.logger.info('call ended');
      });
      this.logger.info(`call connected, starting lex bot ${this.botName} using locale ${this.locale}`);

      /* add lex event listeners */
      this.ep.addCustomEventListener('lex::intent', this._onIntent.bind(this, ep, dlg));
      this.ep.addCustomEventListener('lex::transcription', this._onTranscription.bind(this, ep, dlg));
      this.ep.addCustomEventListener('lex::audio_provided', this._onAudioProvided.bind(this, ep, dlg));
      this.ep.addCustomEventListener('lex::text_response', this._onTextResponse.bind(this, ep, dlg));
      this.ep.addCustomEventListener('lex::playback_interruption', this._onPlaybackInterruption.bind(this, ep, dlg));
      this.ep.addCustomEventListener('lex::error', this._onError.bind(this, ep, dlg));
      this.ep.on('dtmf', this._onDtmf.bind(this, ep, dlg));

      /* start lex */
      await this._initChannelVars();

      let cmd = `${this.ep.uuid} ${this.bot} ${this.alias} ${this.region} ${this.locale} `;

      /* if we are triggering an event right off the bat.. */
      if (process.env.LEX_WELCOME_INTENT) {
        cmd += process.env.LEX_WELCOME_INTENT;
        //if (this.intent.slots) Object.assign(obj, {slots: this.intent.slots});
      }

      cmd += ` '${JSON.stringify(this.metadata)}'`;
      this.logger.debug({cmd}, `starting lex bot ${this.botName} with locale ${this.locale}`);
      this.ep.api('aws_lex_start', cmd)
        .catch((err) => {
          this.logger.error({err}, `Error starting lex bot ${this.botName}`);
        });
    } catch (err) {
      this.logger.error(err, 'Error connecting call');
      return;
    }
  }

  async _initChannelVars() {
    const channelVars = {};
    if (process.env.LEX_START_TIMEOUT_MS) {
      Object.assign(channelVars, {'x-amz-lex:audio:start-timeout-ms': process.env.LEX_START_TIMEOUT});
    }
    Object.assign(channelVars, {
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY
    });

    /* let mod_aws_lex know whether we are using the returned audio or tts */
    if (this.vendor) Object.assign(channelVars, {LEX_USE_TTS: 1});

    /* if we are feeding it a welcome message to play back at start of conversation */
    if (this.welcomeMessage && this.welcomeMessage.length) {
      Object.assign(channelVars, {LEX_WELCOME_MESSAGE: this.welcomeMessage});
    }
    await this.ep.set(channelVars);
  }

  _trackTmpFile(path) {
    this.tmpFiles.add(path);
  }

  _clearTmpFiles() {
    for (const path of this.tmpFiles) {
      fs.unlink(path, (err) => {
        if (err) {
          return this.logger.error(err, `CallSession:_clearResources Error deleting tmp file ${path}`);
        }
        this.logger.debug(`CallSession:_clearResources successfully deleted ${path}`);
      });
    }
    this.tmpFiles.clear();
  }

  _onIntent(ep, dlg, evt) {
    this.emit('intent', evt);

    /* check for close of dialog */
    if (evt.sessionState &&
      evt.sessionState.dialogAction &&
      evt.sessionState.dialogAction.type === 'Close') {
      this.emit('end', {});
    }
  }

  _onTranscription(ep, dlg, evt) {
    this.emit('transcription', evt);
  }

  async _onTextResponse(ep, dlg, evt) {
    this.emit('text', evt);
    const messages = evt.messages;
    if (this.vendor && Array.isArray(messages) && messages.length) {
      const msg = messages[0].msg;
      const type = messages[0].type;
      const {synthAudio} = this.srf.locals;
      if (['PlainText', 'SSML'].includes(type) && msg) {
        try {
          this.logger.debug(`tts with ${this.vendor} ${this.voice}`);
          const fp = await synthAudio({
            text: msg,
            vendor: this.vendor,
            language: this.language,
            voice: this.voice,
            salt: this.callId
          });
          if (fp) this._trackTmpFile(fp);
          this.emit('start-play', {path: fp});
          await ep.play(fp);
          this.emit('stop-play', {path: fp});
          this.logger.debug(`finished tts, sending play_done ${this.vendor} ${this.voice}`);
          this.ep.api('aws_lex_play_done', this.ep.uuid)
            .catch((err) => {
              this.logger.error({err}, `Error sending play_done ${this.botName}`);
            });
        } catch (err) {
          this.logger.error({err}, 'Lex:_onTextResponse - error playing tts');
        }
      }
    }
  }

  /**
   * @param {*} evt - event data
   */
  _onPlaybackInterruption(ep, dlg, evt) {
    this.emit('playback-interrupted', {});
    this.ep.api('uuid_break', this.ep.uuid)
      .catch((err) => this.logger.info(err, 'Lex::_onPlaybackInterruption - Error killing audio'));
  }

  /**
   * Lex has returned an error of some kind.
   * @param {*} evt - event data
   */
  _onError(ep, dlg, evt) {
    this.emit('error', evt);
  }

  /**
   * Audio has been received from lex and written to a temporary disk file.
   * Start playing the audio, after killing any filler sound that might be playing.
   * When the audio completes, start the no-input timer.
   */
  async _onAudioProvided(ep, dlg, evt) {
    if (this.vendor) return;

    this.waitingForPlayStart = false;
    this.logger.debug({evt}, `got audio file for bot ${this.botName}`);

    try {
      this.emit('start-play', {path: evt.path});
      await ep.play(evt.path);
      this.emit('stop-play', {path: evt.path});
      this.ep.api('aws_lex_play_done', this.ep.uuid)
        .catch((err) => {
          this.logger.error({err}, `Error sending play_done ${this.botName}`);
        });
    } catch (err) {
      this.logger.error({err}, `Error playing file ${evt.path} for both ${this.botName}`);
    }
  }

  /**
   * receive a dmtf entry from the caller.
   * If we have active dtmf instructions, collect and process accordingly.
   */
  _onDtmf(ep, cs, evt) {
    this.emit('dtmf', evt);
    this.ep.api('aws_lex_dtmf', `${this.ep.uuid} ${evt.dtmf}`)
      .catch((err) => {
        this.logger.error({err}, `Error sending dtmf ${evt.dtmf} ${this.botName}`);
      });
  }
}

module.exports = CallSession;
