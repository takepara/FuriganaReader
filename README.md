# JpTokenizer (Static Cloudflare Pages App)

A fully static web app that:

1. Uses Google OAuth/OIDC in the browser (Google Identity Services)
2. Calls Vertex AI Gemini from the client side using user-bound OAuth access tokens
3. Produces strict token-by-token output in English:
   - Japanese token
   - Romaji
   - Part of speech (English)
   - Meaning (English)

## Files

- `index.html`: UI shell
- `styles.css`: visual design and responsive layout
- `app.js`: OIDC auth, Gemini call, output parsing/rendering
- `config.js`: local configuration values

## Setup

1. Create an OAuth 2.0 Client ID (Web application) in Google Cloud.
2. Add your local origin and Cloudflare Pages origin to Authorized JavaScript origins.
3. Enable Vertex AI API in the same project.
4. Edit `config.js`:
   - `googleClientId`
   - `googleCloudProjectId`
   - `googleCloudLocation`
   - `oauthScopes`
   - `geminiModel`

The app sends requests to Vertex AI with the signed-in user's access token and includes the configured project as `x-goog-user-project` for quota and billing.

## Run locally

Because this app loads scripts and calls OAuth endpoints, run with a local web server:

```bash
python3 -m http.server 8080
```

Open: `http://localhost:8080`

## Deploy to Cloudflare Pages

1. Push this folder to a Git repository.
2. Create a Cloudflare Pages project from that repository.
3. Build command: leave empty
4. Build output directory: `/` (root)
5. Set production domain in Google OAuth Authorized JavaScript origins.

## Important Notes

- This app intentionally has no server-side code and no Cloudflare Workers.
- OAuth + Vertex AI behavior can vary depending on project policy and API scope configuration.
- If OAuth token calls to Vertex AI fail due to policy/CORS/scope constraints, adjust scopes and project settings in Google Cloud.
