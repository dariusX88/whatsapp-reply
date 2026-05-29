// wa-responder.js — read a chat, draft a reply with Claude, send via Playwright.
// Reads ANTHROPIC_API_KEY from $WA_HOME/.env. Sends NOTHING unless you pass --send.
//
// Usage:
//   node wa-responder.js "Name"                interactive: draft, then ask y/e/n
//   node wa-responder.js "Name" --draft        print the draft only, send NOTHING
//   node wa-responder.js "Name" --send "text"  open the chat and send exactly "text"
//
// Name match is a case-INsensitive substring of the chat title.
// Uses the same $WA_HOME/wa-profile login as wa-reader.js, so no re-scan needed.

const os = require("os");
const path = require("path");
const fs = require("fs");

const WA_HOME = process.env.WA_HOME || path.join(os.homedir(), ".whatsapp-reply");
const PROFILE_DIR = path.join(WA_HOME, "wa-profile");
// override:true so the .env value wins even if the parent shell already exports
// an (often empty) ANTHROPIC_API_KEY — dotenv won't override a present var otherwise.
require("dotenv").config({ path: path.join(WA_HOME, ".env"), override: true });

const { chromium } = require("playwright");
const readline = require("readline");

// ── CONFIG ──────────────────────────────────────────────────────────────
const TEST_MODE = true;                  // true = draft even when the last msg is yours.
const MAX_MSGS  = 15;                    // recent messages fed to Claude for context
const MODEL     = "claude-haiku-4-5-20251001";
const USER_NAME = process.env.WA_USER_NAME || "me";   // replies are written "as" this person

// Optional freeform context about you (job, city, what's going on this week),
// read from $WA_HOME/context.txt if present. Keeps drafts grounded.
let CONTEXT = "";
try { CONTEXT = fs.readFileSync(path.join(WA_HOME, "context.txt"), "utf8").trim(); } catch {}

// ── CLI ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const sendIdx = argv.indexOf("--send");
const SEND_TEXT  = sendIdx >= 0 ? argv[sendIdx + 1] : null;
const DRAFT_ONLY = argv.includes("--draft");
const positional = argv.filter((a, i) => !a.startsWith("--") && !(sendIdx >= 0 && i === sendIdx + 1));
const TARGET = positional[0];
// ──────────────────────────────────────────────────────────────────────────

if (!TARGET) {
  console.error('❌ No contact name given. Usage: node wa-responder.js "Name" [--draft | --send "text"]');
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error(`❌ No ANTHROPIC_API_KEY in ${path.join(WA_HOME, ".env")} — run /wa-setup.`);
  process.exit(1);
}

const ask = (q) =>
  new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => { rl.close(); res(a.trim()); });
  });

async function draftReply(messages) {
  const convo = messages
    .map((m) => `${m.direction === "outgoing" ? USER_NAME : m.sender}: ${m.text}`)
    .join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      system:
        `You draft a SHORT, casual WhatsApp reply AS ${USER_NAME}. Relaxed, friendly texting tone. ` +
        "1-3 sentences. No em-dashes. Don't invent facts not in the context or conversation. " +
        "Reply in the SAME language the other person is using. " +
        "Even if the last message is just a link, a sticker, a photo, or has no clear question, " +
        "still write a brief, natural reaction (a short acknowledgement is fine). " +
        "NEVER ask for clarification, NEVER explain yourself, NEVER refuse, NEVER mention being an AI. " +
        `Output ONLY the message text ${USER_NAME} would send, nothing else.`,
      messages: [
        { role: "user", content: `Context:\n${CONTEXT || "(none)"}\n\nConversation:\n${convo}\n\nDraft my reply to the latest message.` },
      ],
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content.map((b) => b.text || "").join("").trim();
}

async function readChat(page) {
  // Pull recent message bubbles with sender + direction (stable selectors).
  return await page.$$eval(
    "#main div.message-in, #main div.message-out",
    (rows, max) =>
      rows.slice(-max).map((row) => {
        const pre = row.querySelector("[data-pre-plain-text]");
        const meta = pre?.getAttribute("data-pre-plain-text") || "";
        const m = meta.match(/^\[(.*?)\]\s*(.*?):\s*$/);
        const textEl = row.querySelector("span.selectable-text, span._ao3e, .copyable-text span");
        return {
          timestamp: m ? m[1] : "",
          sender: m ? m[2] : "Unknown",
          direction: row.classList.contains("message-out") ? "outgoing" : "incoming",
          text: textEl ? textEl.innerText : "",
        };
      }).filter((x) => x.text),
    MAX_MSGS
  );
}

async function sendReply(page, text) {
  const box = page.locator('footer div[contenteditable="true"]');
  await box.click();
  await box.fill(text);          // safer than type() for emoji/multibyte
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
}

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto("https://web.whatsapp.com");
  await page.waitForSelector('div[aria-label="Chat list"]', { timeout: 120000 });
  console.log("Logged in.\n");

  const name = TARGET;
  const target = name.toLowerCase();

  // Open the chat. Prefer clicking it directly in the already-rendered chat list
  // (same [role="row"] selector the reader trusts) — far more robust than search,
  // whose results markup WA keeps changing. Fall back to search if it isn't
  // currently rendered in the sidebar.
  let opened = false;
  const rows = await page.locator('div[aria-label="Chat list"] [role="row"]').all();
  for (const row of rows) {
    if (await row.locator("button").count()) continue;       // skip Archived pseudo-row
    const title = ((await row.innerText()).split("\n").filter(Boolean)[0]) || "";
    if (title.toLowerCase().includes(target)) { await row.click(); opened = true; break; }
  }
  if (!opened) {
    // WA Web's search box aria-label is locale-bound; match the EN one and fall
    // back to the structural #side input[role="textbox"]. Real keystrokes so
    // WA's type-to-filter actually fires.
    const search = page
      .locator('input[aria-label="Search or start a new chat"], #side input[role="textbox"]')
      .first();
    await search.click();
    await search.pressSequentially(name, { delay: 40 });
    await page.waitForTimeout(1500);
    const firstResult = page
      .locator('#pane-side [role="listitem"], div[aria-label="Chat list"] [role="row"]')
      .first();
    if (!(await firstResult.count())) {
      console.log(`⚠️  No chat match for "${name}".`);
      await ctx.close();
      process.exit(2);
    }
    await firstResult.click();
  }
  await page.waitForTimeout(1500);

  // --send mode: chat is open, just send the approved text and stop.
  if (SEND_TEXT) {
    await sendReply(page, SEND_TEXT);
    console.log(`✅ Sent to ${name}.`);
    await page.waitForTimeout(1500);
    await ctx.close();
    return;
  }

  const msgs = await readChat(page);
  if (!msgs.length) {
    console.log(`(${name}) no readable messages.`);
    await ctx.close();
    return;
  }

  const last = msgs[msgs.length - 1];
  if (!TEST_MODE && last.direction === "outgoing") {
    console.log(`(${name}) last message is yours — nothing to reply to.`);
    await ctx.close();
    return;
  }

  console.log(`\n━━━ ${name} ━━━`);
  console.log(`Latest from ${last.sender}: "${last.text}"\n`);
  console.log("Drafting…");

  let draft;
  try { draft = await draftReply(msgs); }
  catch (e) { console.log(`❌ Draft failed: ${e.message}`); await ctx.close(); process.exit(1); }

  // --draft mode: print the draft in a parseable form and stop. Send nothing.
  if (DRAFT_ONLY) {
    console.log(`\n>>>DRAFT_START<<<\n${draft}\n>>>DRAFT_END<<<\n`);
    await ctx.close();
    return;
  }

  // Interactive mode (when run directly in a terminal).
  console.log(`\n💬 Draft reply:\n   "${draft}"\n`);
  const choice = (await ask("Send it?  [y]es / [e]dit / [n]o: ")).toLowerCase();

  if (choice === "y") {
    await sendReply(page, draft);
    console.log("✅ Sent.");
  } else if (choice === "e") {
    const edited = await ask("Type your version: ");
    if (edited) { await sendReply(page, edited); console.log("✅ Sent (edited)."); }
    else console.log("Empty — skipped.");
  } else {
    console.log("Skipped.");
  }

  await page.waitForTimeout(1500);
  await ctx.close();
})();
