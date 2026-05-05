# Furigana Reader

A fully static web app for learners of Japanese. Enter Japanese text and get a token-by-token breakdown with:

- Hiragana and romaji reading of the full input
- Per-token: Japanese text, romaji, part of speech (English), and meaning (English)

Powered by the Gemini API (Google AI Studio). No server-side code — everything runs in the browser.

## Files

- `index.html`: UI shell
- `styles.css`: visual design and responsive layout
- `app.js`: API key management, Gemini API call, response parsing and rendering
- `config.js`: configuration values (Gemini model ID)

## Setup

1. Get a free API key from [Google AI Studio](https://aistudio.google.com/apikey).
2. (Optional) Edit `config.js` to change the Gemini model:
   - `geminiModel` — defaults to `gemini-2.5-flash-lite`

The API key is entered in the UI at runtime and stored in `localStorage`. It is sent directly to `generativelanguage.googleapis.com` and never leaves your browser in any other way.

## Run locally

Serve the files with any static web server, e.g.:

```bash
python3 -m http.server 8080
```

Open: `http://localhost:8080`

## Deploy to Cloudflare Pages

1. Push this folder to a Git repository.
2. Create a Cloudflare Pages project from that repository.
3. Build command: leave empty
4. Build output directory: `/` (root)

## Notes

- No server-side code, no Cloudflare Workers, no tracking.
- The API key is stored only in your browser's `localStorage` and is never sent anywhere except the Gemini API.
