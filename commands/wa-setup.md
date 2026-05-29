---
description: One-time setup for the WhatsApp Reply plugin — installs dependencies, logs into WhatsApp Web, and stores your API key.
allowed-tools: ["Bash", "Read", "Write"]
---

Set up the WhatsApp Reply plugin runtime for the user. Walk through these steps with Bash, explaining briefly as you go. The runtime home is `~/.whatsapp-reply` (referred to as `$WA_HOME`).

1. **Create the runtime home and copy the scripts in.**
   - `mkdir -p ~/.whatsapp-reply`
   - Copy `wa-reader.js`, `wa-responder.js`, and `package.json` from this plugin's `scripts/` directory into `~/.whatsapp-reply/`.
   - The plugin's script directory is `${CLAUDE_PLUGIN_ROOT}/scripts`. If `$CLAUDE_PLUGIN_ROOT` is empty, locate the plugin under `~/.claude/plugins/cache/**/whatsapp-reply*/scripts` and copy from there.

2. **Install dependencies** (this is the slow step — Chromium download):
   - `cd ~/.whatsapp-reply && npm install && npx playwright install chromium`

3. **Collect credentials.** Ask the user for:
   - their **Anthropic API key** (from console.anthropic.com), and
   - their **first name** (replies are written to sound like them).
   Then write `~/.whatsapp-reply/.env`:
   ```
   ANTHROPIC_API_KEY=<their key>
   WA_USER_NAME=<their first name>
   ```

4. **Optional context.** Ask for one or two lines about them (job, city, what's going on this week) to keep drafts grounded. If given, write it to `~/.whatsapp-reply/context.txt`. Skip if they decline.

5. **Log in to WhatsApp Web.** Run `node ~/.whatsapp-reply/wa-reader.js`. A Chrome window opens on web.whatsapp.com — tell the user to open WhatsApp on their phone → **Linked Devices → Link a Device** → scan the QR. Once their chat list prints, the login is saved (they won't scan again).

When their chats list successfully, confirm setup is complete and tell them they can now say things like **"reply to [name] on WhatsApp"** or **"respond to my WhatsApp."**

Never put the API key in chat output or commit it anywhere — it lives only in `~/.whatsapp-reply/.env`.
