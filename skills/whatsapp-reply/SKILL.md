---
name: whatsapp-reply
description: Use when the user wants to reply to WhatsApp messages from Claude Code — e.g. "reply to [name] on WhatsApp", "respond to my WhatsApp", "draft a WhatsApp reply to X", or names a contact and asks you to answer them. Reads the chat, drafts a reply in the user's voice, and sends ONLY after the user approves.
allowed-tools: ["Bash", "Read"]
---

# WhatsApp Reply

Draft and send WhatsApp replies on the user's behalf. **ALWAYS show the draft and get explicit approval before sending. Never auto-send.**

Runtime lives in `$WA_HOME` (default `~/.whatsapp-reply/`): the scripts, the logged-in browser profile (`wa-profile/`), and `.env` (the API key). A headful Chrome window opening during these steps is expected — WhatsApp Web requires it.

## 0. Check setup first
Run: `ls ~/.whatsapp-reply/wa-responder.js ~/.whatsapp-reply/.env`
If either is missing, tell the user to run `/wa-setup` once, then stop.

## 1. Figure out the target
- **User named a contact** ("reply to Anna", "answer Tom on WhatsApp") → that name is the target. Go to step 2.
- **No name given** ("respond to my WhatsApp", "anyone waiting on me?") → list unread chats:
  `node ~/.whatsapp-reply/wa-reader.js --unread`
  Show the 🔵 chats to the user and ask which one(s) to handle. For each chosen chat, do step 2.

## 2. Draft (this NEVER sends)
`node ~/.whatsapp-reply/wa-responder.js "NAME" --draft`

The draft prints between `>>>DRAFT_START<<<` and `>>>DRAFT_END<<<`. Show it to the user **verbatim** and ask: **send / edit / skip**.

- Name matching is a case-insensitive substring of the chat title.
- If it prints `No chat match for "NAME"` (exit code 2), run `node ~/.whatsapp-reply/wa-reader.js --name "NAME"` to find the exact title, confirm with the user, and retry with the title that matched.

## 3. Send (ONLY on explicit approval)
- **Approved as-is** → `node ~/.whatsapp-reply/wa-responder.js "NAME" --send "EXACT DRAFT TEXT"`
- **User edited it** → send their version: `node ~/.whatsapp-reply/wa-responder.js "NAME" --send "EDITED TEXT"`
- **Skip** → do nothing.

Pass the text exactly as approved. Mind shell quoting — if the text contains double quotes, escape them or use single quotes.

## Rules
- One draft → one approval → one send. When sweeping multiple chats, approve **each** message individually. Never batch-send.
- Reply language follows the other person automatically (handled in the script).
- If you see an `ANTHROPIC_API_KEY` error, the key is missing/empty in `~/.whatsapp-reply/.env` — point the user to `/wa-setup`.
- Don't fabricate what the contact said. If the draft looks off, re-run `--draft` or let the user edit.
