// wa-reader.js — read-only WhatsApp Web reader (plugin runtime copy).
// Runs on YOUR machine, uses YOUR logged-in session. Reads only. Sends nothing.
//
// Usage:
//   node wa-reader.js              list all chats (unread first)
//   node wa-reader.js --unread     list only chats with unread messages
//   node wa-reader.js --name "x"   list only chats whose title contains "x" (case-insensitive)
//
// Login is stored in $WA_HOME/wa-profile (default ~/.whatsapp-reply/wa-profile),
// so you only scan the QR once. The browser stays linked as a device.

const os = require("os");
const path = require("path");
const { chromium } = require("playwright");

const WA_HOME = process.env.WA_HOME || path.join(os.homedir(), ".whatsapp-reply");
const PROFILE_DIR = path.join(WA_HOME, "wa-profile");

const argv = process.argv.slice(2);
const UNREAD_ONLY = argv.includes("--unread");
const nameIdx = argv.indexOf("--name");
const NAME = nameIdx >= 0 ? (argv[nameIdx + 1] || "").toLowerCase() : null;

(async () => {
  // Persistent profile = QR scanned once, session reused on every run.
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false, // headful: needed for the QR, and lower detection risk
    viewport: { width: 1280, height: 900 },
  });

  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto("https://web.whatsapp.com");

  console.log("Waiting for WhatsApp to load… (scan the QR if it appears)");
  await page.waitForSelector('div[aria-label="Chat list"]', { timeout: 120000 });
  console.log("Logged in. Reading chats…\n");

  // The chat list is virtualised: only rows in the current viewport exist in the
  // DOM at any moment. Harvest in a loop — read rendered rows, scroll the last
  // one into view to reveal the next batch, dedupe by name + preview — until we
  // go 3 iterations without seeing a new chat.
  const rowSel = 'div[aria-label="Chat list"] [role="row"]';
  const seen = new Map(); // name|preview -> { name, lastMsg, unread }

  const harvestVisible = async () => {
    const rows = await page.locator(rowSel).all();
    let added = 0;
    for (const row of rows) {
      // Skip the icon-only Archived pseudo-row (it has a button, no name text).
      if (await row.locator("button").count()) continue;

      const text = (await row.innerText()).split("\n").filter(Boolean);
      if (text.length < 2) continue;

      const name = text[0];
      const lastMsg = text[text.length - 1];

      if (/^\d+\s+unread\s+messages?$/i.test(name)) continue;
      if (lastMsg === "Loading…") continue;
      if (NAME && !name.toLowerCase().includes(NAME)) continue;

      const key = `${name}|${lastMsg.slice(0, 60)}`;
      if (seen.has(key)) continue;

      const unreadBadge = await row.locator('span[aria-label*="unread"]').count();
      seen.set(key, { name, lastMsg, unread: unreadBadge > 0 });
      added++;
    }
    return added;
  };

  let stagnantSteps = 0;
  for (let i = 0; i < 80; i++) {
    const added = await harvestVisible();
    stagnantSteps = added === 0 ? stagnantSteps + 1 : 0;
    if (stagnantSteps >= 3) break;
    // scrollIntoView walks ancestors and finds whichever element actually
    // scrolls — robust against not knowing the exact scroll container.
    await page.locator(rowSel).last().evaluate((el) => el.scrollIntoView({ block: "end" }));
    await page.waitForTimeout(350);
  }

  let results = Array.from(seen.values());
  if (UNREAD_ONLY) results = results.filter((r) => r.unread);
  results.sort((a, b) => Number(b.unread) - Number(a.unread)); // unread first

  if (!results.length) {
    console.log(UNREAD_ONLY ? "No unread chats." : "No chats matched.");
  } else {
    for (const r of results) {
      console.log(`${r.unread ? "🔵" : "  "} ${r.name}`);
      console.log(`     └─ ${r.lastMsg}\n`);
    }
  }

  console.log("Done. Closing in 5s…");
  await page.waitForTimeout(5000);
  await ctx.close();
})();
