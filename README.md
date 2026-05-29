# WhatsApp Reply

A Claude Code plugin that replies to your WhatsApp messages for you.

Say a contact's name — *"reply to Anna on WhatsApp"* — and Claude opens the chat, drafts a reply **in your voice and in the right language**, shows it to you, and sends it **only after you approve**. Or just say *"respond to my WhatsApp"* and Claude lists who's waiting on you so you can clear them one by one.

It runs entirely **on your own machine**, using **your own** WhatsApp login and Anthropic API key. Nothing is hosted, nothing is shared.

---

## How it works

```
You: "reply to Anna on WhatsApp"
 → Claude opens your WhatsApp Web session (Playwright)
 → reads the last messages in that chat
 → drafts a reply with Claude (Haiku) in your texting style + language
 → shows you the draft
You: "send it"  (or "change it to …")
 → it's sent. Nothing goes out without your OK.
```

Two small scripts do the browser work; a Claude Code **skill** wires the "just say a name" behavior into every session.

## Install

Requires **Node.js 18+** and **npm** on your machine.

```
/plugin marketplace add dariusX88/whatsapp-reply
/plugin install whatsapp-reply
/wa-setup
```

`/wa-setup` (one time, ~2 min) installs dependencies, asks for your Anthropic API key + first name, and opens WhatsApp Web so you can **scan the QR** with your phone (WhatsApp → Linked Devices). After that you're set.

## Use

In any Claude Code session:

- **"reply to [name] on WhatsApp"** → drafts a reply to that person's last message, you approve, it sends.
- **"respond to my WhatsApp"** → lists your unread chats; pick who to answer.
- **"change it to …"** → edits the draft before sending.

A Chrome window will open while it works — that's normal; WhatsApp Web needs a real browser.

## Where your data lives

Everything runtime is in `~/.whatsapp-reply/`:

| File | What |
|------|------|
| `wa-profile/` | your linked WhatsApp Web session (like a logged-in browser) |
| `.env` | your `ANTHROPIC_API_KEY` and first name |
| `context.txt` | optional one-liner about you, to ground drafts |

None of this is in the plugin repo or shared with anyone. Your API key never appears in chat. To unlink: open WhatsApp on your phone → Linked Devices → remove the device, and delete `~/.whatsapp-reply/`.

## Configuration

- **`WA_USER_NAME`** (in `.env`) — the name replies are written "as".
- **`~/.whatsapp-reply/context.txt`** — optional freeform context (job, city, current week) the drafter uses.
- **`WA_HOME`** (env var) — override the runtime location (default `~/.whatsapp-reply`).
- Model is `claude-haiku-4-5` (fast + cheap); edit `MODEL` in `wa-responder.js` to change.

## Limitations & honest notes

- **Per-person setup.** Each user logs in with their own phone and uses their own API key — there's no shared/hosted account.
- **WhatsApp's Terms** disallow unofficial automation. This is fine for personal use with a handful of contacts; **don't** use it for bulk/marketing messaging or you risk a ban.
- **Selectors can drift.** WhatsApp Web changes its HTML occasionally; if reading/sending breaks, the selectors in the scripts may need a touch-up.
- **Approve before send is the whole point** — keep it that way. Auto-sending AI drafts to real people is how embarrassing things get sent.

## License

MIT
