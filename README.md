# drachtio-lex-phone-gateway

An open source telephony gateway for AWS lex.

## Prerequisites
You'll need a server outfitted with the following software:

- [drachtio server](https://drachtio.org),
- Freeswitch 1.10.1 (see [this ansible role](https://github.com/davehorton/ansible-role-fsmrf)), and
- [aws lex module](https://github.com/davehorton/drachtio-freeswitch-modules/tree/master/modules/mod_aws_lex) for Freeswitch
- [redis server](https://redis.io)

## Configuration
as per usual:
```
npm install
```
Then run the program, setting the below environment variables as needed:

|Env var name|Default|Meaning|
|------------|---------|-------|
|DRACHTIO_HOST|'127.0.0.1'|drachtio server IP|
|DRACHTIO_PORT|9022|drachtio server control port|
|DRACHTIO_SECRET|'cymru'|drachtio server shared secret|
|REDIS_HOST|'127.0.0.1'|redis server IP|
|REDIS_PORT|6379|redis server tcp port|
|FREESWITCH_HOST|'127.0.0.1'|freeswitch server IP|
|FREESWITCH_PORT|8021|Freeswitch server control port|
|FREESWITCH_SECRET|'ClueCon'|Freeswitch server shared secret|
|AWS_ACCESS_KEY_ID|None - required.|AWS access key id|
|AWS_SECRET_ACCESS_KEY|None - required.|AWS secret access key|
|AWS_REGION|us-east-1|AWS region the bot is running in|
|LEX_LOCALE|en_US|language/dialect for speech recognition|
|LEX_WELCOME_INTENT|None - optional.|Initial intent|
|BOT_ID|None - required.|Lex bot id|
|BOT_ALIAS_ID|None - required.|Lex bot alias id|
|LEX_PLATFORM|None - optional.|platform identifier to send with metadata|
|LEX_START_TIMEOUT_MS|None - optional.|start timeout threshold for any intent and slot|
