# drachtio-lex-phone-gateway

An open source telephony gateway for AWS lex.

## Prerequisites
You'll need a server outfitted with the following software:

- [drachtio server](https://drachtio.org),
- Freeswitch 1.10.1 (see [this ansible role](https://github.com/davehorton/ansible-role-fsmrf)), and
- [aws lex module](https://github.com/davehorton/drachtio-freeswitch-modules/tree/master/modules/mod_aws_lex) for Freeswitch
- [redis server](https://redis.io)

## Configuration
```
npm install
```
Then run the program, setting the below environment variables as needed:

|Env var name|Default|Meaning|
|------------|---------|-------|
|AWS_ACCESS_KEY_ID|None - required.|AWS access key id|
|AWS_SECRET_ACCESS_KEY|None - required.|AWS secret access key|
|AWS_REGION|us-east-1|AWS region the bot is running in|
|BOT_ID|None - required.|Lex bot id|
|BOT_ALIAS_ID|None - required.|Lex bot alias id|
|DRACHTIO_HOST|'127.0.0.1'|drachtio server IP|
|DRACHTIO_PORT|9022|drachtio server control port|
|DRACHTIO_SECRET|'cymru'|drachtio server shared secret|
|FREESWITCH_HOST|'127.0.0.1'|freeswitch server IP|
|FREESWITCH_PORT|8021|Freeswitch server control port|
|FREESWITCH_SECRET|'ClueCon'|Freeswitch server shared secret|
|GOOGLE_APPLICATION_CREDENTIALS|None - optional|Should be provided if text-to-speech is used with vendor = 'google'|
|LEX_LOCALE|en_US|language/dialect for speech recognition|
|LEX_PLATFORM|None - optional.|platform identifier to send with metadata|
|LEX_START_TIMEOUT_MS|None - optional.|start timeout threshold for any intent and slot|
|LEX_WELCOME_INTENT|None - optional.|Initial intent|
|REDIS_HOST|'127.0.0.1'|redis server IP|
|REDIS_PORT|6379|redis server tcp port|
|TTS_VENDOR|None - optional|If provided, text-to-speech will be used for prompts instead of returned audio|
|TTS_LANGUAGE|None - optional| If provided, language to use for text-to-speech|
|TTS_VOICE|None - optional|If provided, voice to use for text-to-speech|

Audio prompts can be played using the audio provided by lex, or by using text-to-speech of the returned text prompts.  Either AWS/Polly or Google can be used for TTS.  When using TTS credentials must be supplied via the relevant environment variables above.  Redis is used to cache the returned audio to minimize the requests to the TTS service.