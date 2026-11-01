# PressBuilder Cloud + ChatGPT MCP

## Functionality
This fork exposes a secured Streamable HTTP MCP endpoint at `POST /mcp` and a password-protected web editor.
Tools: list_decks, get_deck, create_deck, update_deck, update_cue, update_slide, update_object, set_slide_visuals, reorder_slides, render_video, get_render_status, get_editor_link.

Create video projects from scripts in chat, edit individual cues/slides, and request asynchronous MP4 export. Video rendering captures deterministic browser Canvas frames through Chromium DevTools and encodes them with FFmpeg/libx264; sufficient CPU/RAM are required. Always inspect get_render_status and review the video.

**Scope:** new slides initially use PressBuilder's placeholder renderer. Call `set_slide_visuals` to author simple editable animated text, rectangles, circles, lines, bars and cue-triggered entrances from ChatGPT without redeployment. Advanced bespoke scenes and arbitrary video-footage editing still require additional development.

## Railway deploy

1. Build from the repository Dockerfile, expose service port 3000, and attach a persistent volume at `/data`.
2. Required service variables:
   - `MCP_API_KEY`: optional legacy 32-byte+ bearer token for administrative clients; never put it in Git.
   - `OAUTH_CLIENT_ID`: pre-registered client ID, e.g. `pressbuilder-chatgpt`.
   - `OAUTH_CLIENT_SECRET`: random confidential OAuth client secret (32+ chars).
   - `OAUTH_REDIRECT_URIS`: comma-separated **exact** permitted callback URLs; default is the stable ChatGPT callback. Never allow arbitrary redirects.
   - `PB_WEB_USER`: browser login name.
   - `PB_WEB_PASSWORD`: strong independent password (16+ chars).
   - `PB_DATA_DIR=/data`
   - `PUBLIC_URL=https://<your-railway-domain>`
3. Test public `GET /health` → JSON status ok; OAuth discovery metadata URLs are also public as required by MCP.
4. Open the HTTPS domain in a browser using HTTP Basic authentication for the editor.
5. Add a private MCP plugin in ChatGPT with transport Streamable HTTP, URL `https://<your-domain>/mcp`, authentication **OAuth**, client ID from `OAUTH_CLIENT_ID`, client secret from `OAUTH_CLIENT_SECRET`, and token endpoint auth method `client_secret_basic` (HTTP Basic). When ChatGPT asks to connect, authenticate using the editor's HTTP Basic login in the browser and press *Разрешить доступ* on the consent screen.

## API guarantees
- MCP and web UI use different credentials, and neither accepts unrestricted shell commands or arbitrary paths.
- Local editing API remains available in `npm run dev` for development. Cloud server uses a separate isolated data root.
- Files survive redeployments **only** when `/data` is backed by a Railway volume.
- The cloud UI compiles the scene registry at build time; changing scene TypeScript requires a rebuild.
- MP4s are available at `/out/<id>.mp4` behind web authentication.
- The current export pipeline is serialized to prevent stream collisions. One render job runs at a time.
- Server job state is held in process memory and disappears on restart; completed video files persist.
- Do not expose the original Vite development server publicly.
- Limit access to trusted users; browser and MCP writes share projects and last write wins.


## Private ChatGPT plugin

After the server has a real HTTPS domain, generate the plugin archive from the current repository:

```bash
node tools/mcp-plugin.mjs https://your-domain.up.railway.app
tar -tzf out/pressbuilder-mcp-plugin.tar.gz
```

The archive contains `plugin.json`, `mcp.json` (OAuth configuration, without the secret), and an editing skill. Install it as a private plugin in ChatGPT, supply `OAUTH_CLIENT_SECRET` through the secure ChatGPT connection UI, and approve browser consent. The plugin requires the remote server to be deployed.

Do not expose credentials in GitHub issues, repository files, or chat. The published web editor has separate HTTP Basic credentials.

## OAuth 2.0 / MCP configuration

- MCP URL: `https://pressbuilder-production.up.railway.app/mcp`
- Authorization endpoint: `https://pressbuilder-production.up.railway.app/oauth/authorize`
- Token endpoint: `https://pressbuilder-production.up.railway.app/oauth/token`
- Protected resource metadata: `/.well-known/oauth-protected-resource/mcp`
- Authorization-server metadata: `/.well-known/oauth-authorization-server`
- Token authentication method: **client_secret_basic**.
- Grant: `authorization_code` with PKCE `S256`, followed by rotating `refresh_token` grants.
- Scope: `mcp:tools` (all tools read/write); access tokens valid 1 hour, refresh tokens 30 days.
- Redirect URI: `https://chatgpt.com/connector_platform_oauth_redirect`; if ChatGPT explicitly shows a different redirect in the connection settings, **copy that exact URL into** `OAUTH_REDIRECT_URIS`, separated by commas. Do not use wildcard callbacks.
- OAuth code/token **hashes** and the OAuth scope/audience/expiry records persist in `/data/oauth-state.json`; authorization codes are short-lived and single use.
- The OAuth consent page requires the existing *editor* Basic username/password and explicit approval. Tokens do not grant access to the password-protected editor or MP4 downloads; they authorize only the MCP endpoint.
- The legacy `MCP_API_KEY` is temporarily accepted by the MCP endpoint. Revoke it when all clients have migrated to OAuth if desired.
- One private user and one pre-registered confidential OAuth client; not a public multi-tenant identity service. For multi-user use, replace this with an established identity provider and per-user scopes.

**Do not** use an OAuth access token, refresh token or `MCP_API_KEY` as the OAuth client secret. Never paste OAuth secrets into GitHub.
