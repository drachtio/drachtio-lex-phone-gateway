const assert = require('assert');
const Srf = require('drachtio-srf');
const srf = new Srf();
const Mrf = require('drachtio-fsmrf');
const mrf = new Mrf(srf);
const logger = require('pino')(Object.assign({
  timestamp: () => {return `, "time": "${new Date().toISOString()}"`;}
}, {level: 'info'}));
const {synthAudio} = require('@jambonz/realtimedb-helpers')({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379
}, logger);
const CallSession = require('./lib/call-session');

assert.ok(process.env.AWS_ACCESS_KEY_ID, 'env AWS_ACCESS_KEY_IS is missing');
assert.ok(process.env.AWS_SECRET_ACCESS_KEY, 'env AWS_SECRET_ACCESS_KEY is missing');
assert.ok(process.env.BOT_ID, 'env BOT_ID is missing');
assert.ok(process.env.BOT_ALIAS_ID, 'env BOT_ALIAS_ID is missing');
assert.ok(process.env.AWS_REGION, 'env AWS_REGION is missing');

/* connect to the drachtio server */
srf.locals.synthAudio = synthAudio;
srf.connect({
  host: process.env.DRACHTIO_HOST || '127.0.0.1',
  port: process.env.DRACHTIO_PORT || 9022,
  secret: process.env.DRACHTIO_SECRET || 'cymru'
})
  .on('connect', (err, hp) => logger.info(`connected to sip on ${hp}`))
  .on('error', (err) => logger.info(err, 'Error connecting'));

/* we want to handle incoming invites */
srf.invite((req, res) => {
  const callSession = new CallSession(logger, mrf, req, res);
  callSession
    .on('intent', (intent) => logger.info(intent, 'received intent'))
    .on('transcription', (transcript) => logger.info(transcript, 'received transcription'))
    .on('text', (evt) => logger.info(evt, 'text response'))
    .on('start-play', (evt) => logger.info(evt, 'starting playback'))
    .on('stop-play', (evt) => logger.info(evt, 'stopping playback'))
    .on('playback-interrupted', (evt) => logger.info(evt, 'stopping playback'))
    .on('audio', (evt) => logger.info(`received audio file ${evt.path}`))
    .on('playback_interruption', (err) => logger.info(err, 'received playback interruption'))
    .on('dtmf', (dtmf) => logger.info(dtmf, 'received dtmf'))
    .on('end', (err) => {
      logger.info(err, 'received dialog close');
      callSession.hangup();
    })
    .on('error', (err) => logger.info(err, 'received error'));
  callSession.exec();
});
