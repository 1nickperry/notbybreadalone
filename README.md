# notbybreadalone (Daily Verse)

Marketing site and SMS signup for [notbybreadalone.app](https://notbybreadalone.app).

## What's here

- `public/` - static marketing site (HTML/CSS/JS) plus PHP signup/unsubscribe endpoints for Hostinger
- `src/` - Node helpers for verse scheduling and sending
- `data/` - verse corpus and non-secret preference samples (no phone numbers committed)
- `.env.example` - required environment variable names for local SMS sending

## Local notes

1. Copy `.env.example` to `.env` and fill in Twilio (or other) credentials.
2. Do not commit `.env` or `data/numbers.json`.
3. Deploy the contents of `public/` as the static site for `notbybreadalone.app`.

## Donate

PayPal: https://paypal.me/perrynick
