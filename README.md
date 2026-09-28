# Photo to Google Drive

A small Arabic mobile-friendly page. Visitors explicitly open their camera, preview a photo, and choose whether to upload it. The server sends the JPEG to a folder in **your** Google Drive. Camera permission alone never uploads a photo.

## Connect your Google Drive

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project, enable **Google Drive API**, and configure the OAuth consent screen for your account. Set its publishing status to **In production** for a long-lived refresh token; an External app left in Testing issues tokens that normally expire in seven days. You may see Google's unverified app warning if you haven't completed verification.
2. Create an **OAuth client ID** of type **Web application**. Add `https://developers.google.com/oauthplayground` to the authorized redirect URIs. Copy its client ID and client secret.
3. Open [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/). In the gear/settings menu, enable **Use your own OAuth credentials** and paste the client ID and secret. Authorize the `https://www.googleapis.com/auth/drive.file` scope while signed in to the Google account that should own the photos. Exchange the authorization code and copy the **refresh token**. Never put the token or client secret in the webpage or in a public repository.
4. Create a Drive folder **with that same OAuth app**, so the `drive.file` scope can access it. While the Playground access token is still valid, use an authenticated Drive `files.create` request with metadata `{ "name": "Site Photos", "mimeType": "application/vnd.google-apps.folder" }`, or use the Playground's Drive API method `files.create`. Copy the returned folder ID. A folder created manually in Drive may not be accessible with `drive.file` until opened with a Google Picker under this OAuth app.

Drive authentication uses the user's OAuth refresh token on the Vercel server. Website visitors **never** need a Google account and never receive Drive credentials.

## Deploy on Vercel

1. Import this project directory into [Vercel](https://vercel.com/new) through a repository, or install the Vercel CLI and run `vercel deploy` from this directory. Choose **Other** as the framework preset if prompted. The static files live at the project root and `api/` holds the Vercel Functions.
2. In the Vercel project's **Settings → Environment Variables**, add these for **Production**:

   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REFRESH_TOKEN`
   - `GOOGLE_DRIVE_FOLDER_ID`

3. For a public link, configure a [Cloudflare Turnstile](https://dash.cloudflare.com/) widget for your Vercel hostname, then set **both** `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in the same Vercel settings. This prevents casual automated uploads to your Drive. The widget and server verification are optional for a small trusted audience.
4. Deploy to production (`vercel deploy --prod` or the Vercel dashboard). Open the HTTPS address on a phone, grant camera permission, capture, review, send, and check the chosen Drive folder. If you add environment variables after the first deployment, redeploy so the function sees them.

You cannot publish this site into someone else's Vercel account or connect it to their Drive without access to that Vercel account and the four Drive values above. Keep `.env.local` private; `.gitignore` excludes it.

## Run locally

Install the Vercel CLI, copy `.env.example` to `.env.local`, fill in the four Google variables, then run `vercel dev`. Camera access works on localhost or HTTPS. Run `npm test` to check the upload handler without sending a real photo.

## Limits

The browser resizes and compresses photos before sending them. The server accepts JPEG up to 2 MB; Vercel Functions have a 4.5 MB request limit. The upload function retains no local copy. Images remain in your Drive folder until you delete them. For large public campaigns, add stricter rate limits or a dedicated upload service.
