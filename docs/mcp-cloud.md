# PressBuilder Cloud + ChatGPT MCP

## Functionality
This fork exposes a secured Streamable HTTP MCP endpoint at \`POST /mcp\` and a password-protected web editor.
Tools: list_decks, get_deck, create_deck, update_deck, update_cue, update_slide, update_object, reorder_slides, render_video, get_render_status, get_editor_link.

Create video projects from scripts in chat, edit individual cues/slides, and request asynchronous MP4 export. Video rendering captures deterministic browser Canvas frames through Chromium DevTools and encodes them with FFmpeg/libx264; sufficient CPU/RAM are required. Always inspect get_render_status and review the video.

**Scope:** new slides use PressBuilder's built-in placeholder renderer. Rich bespoke scenes currently need TypeScript authored under \`src/decks/<id>/\` and a new deployment. MCP cannot turn arbitrary narration into finished bespoke motion graphics yet.

## Railway deploy

1. Build from the repository Dockerfile, expose service port 3000, and attach a persistent volume at \`/data\`.
2. Required service variables:
   - \`MCP_API_KEY\`: random 32-byte+ bearer token (do not put in Git).
   - \`PB_WEB_USER\`: browser login name.
   - \`PB_WEB_PASSWORD\`: strong independent password (16+ chars).
   - \`PB_DATA_DIR=/data\`
   - \`PUBLIC_URL=https://<your-railway-domain>\`
3. Test public \`GET /health\` → JSON status ok. No other public route is unauthenticated.
4. Open the HTTPS domain in a browser using HTTP Basic authentication for the editor.
5. Add a private MCP plugin in ChatGPT with transport Streamable HTTP, URL \`https://<your-domain>/mcp\`, API key auth in Bearer header, and enter \`MCP_API_KEY\` securely in the app's connection UI. Don't paste tokens into a conversation.

## API guarantees
- MCP and web UI use different credentials, and neither accepts unrestricted shell commands or arbitrary paths.
- Local editing API remains available in \`npm run dev\` for development. Cloud server uses a separate isolated data root.
- Files survive redeployments **only** when \`/data\` is backed by a Railway volume.
- The cloud UI compiles the scene registry at build time; changing scene TypeScript requires a rebuild.
- MP4s are available at \`/out/<id>.mp4\` behind web authentication.
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

The archive contains `plugin.json`, `mcp.json`, and an editing skill. Install it as a private plugin in ChatGPT; connect using your `MCP_API_KEY` as a Bearer API key in the secure plugin connection UI. The plugin is **not usable before the remote server is deployed**.

Do not expose credentials in GitHub issues, repository files, or chat. The published web editor has separate HTTP Basic credentials.
