#!/usr/bin/env node
// Build a print-ready A5 double-sided manual/insert for The Deck of Hard Truths.
// - Trim: A5 (148 x 210 mm)
// - Bleed: 3 mm all sides (Beschnitt)
// - Crop marks (Schnittmarken): 5 mm outside the bleed, all 4 corners
// - 2 pages: front (intro + card types), back (how to play + rules)
// - Vector PDF; text and the Illumio SVG stay scalable
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_HTML = join(__dirname, 'manual-layout.html');
const OUT_PDF = join(__dirname, 'illumio-hard-truths-manual.pdf');

// Geometry (mm)
const TRIM_W = 148;
const TRIM_H = 210;
const BLEED = 3;
const MARK_LEN = 5;
const MARK_STROKE = 0.25;
const PAGE_PAD = BLEED + MARK_LEN + 2; // 10mm
const PAGE_W = TRIM_W + 2 * PAGE_PAD;  // 168
const PAGE_H = TRIM_H + 2 * PAGE_PAD;  // 230

const BLEED_OFF = PAGE_PAD - BLEED;    // 7
const TRIM_OFF = PAGE_PAD;             // 10
const MARK_START = PAGE_PAD - BLEED - MARK_LEN; // 2

const ILLUMIO_LOGO = `<svg viewBox="0 0 400 100" xmlns="http://www.w3.org/2000/svg"><path d="M89.706 10.294V89.706H10.294V10.294H89.706ZM4.8 0C2.16 0 0 2.16 0 4.8V95.2C0 97.84 2.16 100 4.8 100H95.2C97.84 100 100 97.84 100 95.2V4.8C100 2.16 97.84 0 95.2 0H4.8Z" fill="#FF5500"/><path d="M58.714 42.828L63.542 38H76.314C77.64 38 78.714 36.926 78.714 35.6V22.4C78.714 21.074 77.64 20 76.314 20H63.114C61.788 20 60.714 21.074 60.714 22.4V35.172L55.886 40H41.542L33.288 31.746V24.974C33.288 23.648 32.214 22.574 30.888 22.574H23.688C22.362 22.574 21.288 23.648 21.288 24.974V32.174C21.288 33.5 22.362 34.574 23.688 34.574H30.46L38.714 42.828V57.172L30.46 65.426H23.688C22.362 65.426 21.288 66.5 21.288 67.826V75.026C21.288 76.352 22.362 77.426 23.688 77.426H30.888C32.214 77.426 33.288 76.352 33.288 75.026V68.254L41.542 60H55.886L60.714 64.828V77.6C60.714 78.926 61.788 80 63.114 80H76.314C77.64 80 78.714 78.926 78.714 77.6V64.4C78.714 63.074 78.714 62 76.314 62H63.542L58.714 57.172V42.83Z" fill="#FF5500"/><path d="M136 28.608H120V15.264H136V28.608ZM120 34.736H136V83.266H120V34.736Z" fill="white"/><path d="M143.2 15.264H159.2V83.264H143.2V15.264Z" fill="white"/><path d="M166.4 15.264H182.4V83.264H166.4V15.264Z" fill="white"/><path d="M237.6 34.49V83.266H221.6V76.648C218.414 81.55 212.574 84.736 206.692 84.736C192.722 84.736 188.8 76.648 188.8 63.902V34.49H204.8V64.286C204.8 68.924 208.56 72.686 213.2 72.686C217.84 72.686 221.6 68.924 221.6 64.286V34.49H237.6Z" fill="white"/><path d="M321.6 54.098V83.266H305.6V52.856C305.6 48.878 302.376 45.656 298.4 45.656C294.424 45.656 291.2 48.878 291.2 52.856V83.266H275.2V52.856C275.2 48.878 271.976 45.656 268 45.656C264.024 45.656 260.8 48.878 260.8 52.856V83.266H244.8V34.49H260.8V41.108C263.742 36.206 268.82 33.02 274.456 33.02C280.584 33.02 285.976 34.98 288.672 40.864C292.104 35.716 297.742 32.774 303.868 33.02C319.31 33.02 321.6 44.784 321.6 54.098Z" fill="white"/><path d="M344 28.608H328V15.264H344V28.608ZM328 34.736H344V83.266H328V34.736Z" fill="white"/><path d="M374.02 33.264C388.236 33.264 399.756 44.538 400 58.754C400 72.97 388.726 84.49 374.51 84.734C360.294 84.734 348.774 73.46 348.53 59.244V58.998C348.04 45.272 358.824 33.752 372.55 33.262C373.04 33.262 373.53 33.262 374.02 33.262V33.264ZM374.02 72.48C381.372 72.48 383.824 65.128 383.824 59C383.824 52.872 381.374 45.52 374.02 45.52C366.666 45.52 364.462 52.872 364.462 59C364.462 65.128 366.668 72.48 374.02 72.48Z" fill="white"/></svg>`;

const cropMarks = `
  <div class="crop-mark h tl-h"></div>
  <div class="crop-mark v tl-v"></div>
  <div class="crop-mark h tr-h"></div>
  <div class="crop-mark v tr-v"></div>
  <div class="crop-mark h bl-h"></div>
  <div class="crop-mark v bl-v"></div>
  <div class="crop-mark h br-h"></div>
  <div class="crop-mark v br-v"></div>
`;

const pageCSS = `
@page { size: ${PAGE_W}mm ${PAGE_H}mm; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { background: white; }
body { font-family: 'Inter', -apple-system, sans-serif; color: #e0e0e0; }

.print-page {
  width: ${PAGE_W}mm;
  height: ${PAGE_H}mm;
  position: relative;
  page-break-after: always;
  break-after: page;
  overflow: hidden;
  background: white;
}
.print-page:last-child { page-break-after: auto; break-after: auto; }

/* Bleed area — dark bg extends into bleed so trim drift doesn't show white */
.bleed {
  position: absolute;
  left: ${BLEED_OFF}mm; top: ${BLEED_OFF}mm;
  width: ${TRIM_W + 2 * BLEED}mm;
  height: ${TRIM_H + 2 * BLEED}mm;
  background: #0a0a1a;
}

.trim {
  position: absolute;
  left: ${TRIM_OFF}mm; top: ${TRIM_OFF}mm;
  width: ${TRIM_W}mm;
  height: ${TRIM_H}mm;
  padding: 11mm 11mm 14mm 11mm;
  color: #e0e0e0;
  font-size: 9pt;
  line-height: 1.4;
  overflow: hidden;
}

/* Crop marks */
.crop-mark { position: absolute; background: #000; z-index: 10; }
.crop-mark.h { height: ${MARK_STROKE}mm; width: ${MARK_LEN}mm; }
.crop-mark.v { width: ${MARK_STROKE}mm; height: ${MARK_LEN}mm; }
.crop-mark.tl-h { top: ${TRIM_OFF}mm; left: ${MARK_START}mm; }
.crop-mark.tl-v { top: ${MARK_START}mm; left: ${TRIM_OFF}mm; }
.crop-mark.tr-h { top: ${TRIM_OFF}mm; right: ${MARK_START}mm; }
.crop-mark.tr-v { top: ${MARK_START}mm; right: ${TRIM_OFF}mm; }
.crop-mark.bl-h { bottom: ${TRIM_OFF}mm; left: ${MARK_START}mm; }
.crop-mark.bl-v { bottom: ${MARK_START}mm; left: ${TRIM_OFF}mm; }
.crop-mark.br-h { bottom: ${TRIM_OFF}mm; right: ${MARK_START}mm; }
.crop-mark.br-v { bottom: ${MARK_START}mm; right: ${TRIM_OFF}mm; }

/* Typography */
h1, h2, h3 { color: #fff; font-weight: 900; letter-spacing: -0.2pt; }
h1 { font-size: 24pt; line-height: 1.1; margin-bottom: 3mm;
  background: linear-gradient(135deg, #dc2626, #d97706, #2563eb);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}
h2 { font-size: 11pt; margin-bottom: 2mm; color: #fff; font-weight: 700; letter-spacing: 0.3pt; text-transform: uppercase; }
h3 { font-size: 10pt; font-weight: 700; margin-bottom: 1.5mm; color: #fff; }
p { color: #aaa; margin-bottom: 2mm; }
strong { color: #fff; font-weight: 700; }

.subtitle { font-size: 10pt; color: #888; margin-bottom: 4mm; font-weight: 500; }
.event { font-size: 7.5pt; color: #666; letter-spacing: 1pt; text-transform: uppercase; margin-bottom: 6mm; }
.logo-small { width: 28mm; margin-bottom: 4mm; }
.logo-small svg { width: 100%; height: auto; display: block; }
.divider { height: 0.3mm; background: rgba(255,255,255,0.1); margin: 4mm 0; }
.small-divider { height: 0.3mm; background: rgba(255,255,255,0.1); margin: 2.5mm 0; }

/* Card type boxes */
.types { display: grid; grid-template-columns: 1fr; gap: 3mm; margin-bottom: 4mm; }
.type-box { border-radius: 2mm; padding: 3mm 3.5mm; border: 0.3mm solid; }
.type-box.red    { border-color: #dc2626; background: linear-gradient(135deg, #1a0a0a, #2a1015); }
.type-box.yellow { border-color: #d97706; background: linear-gradient(135deg, #1a1400, #2a1d05); }
.type-box.blue   { border-color: #2563eb; background: linear-gradient(135deg, #0a0a1a, #0d1530); }
.type-head { display: flex; align-items: baseline; gap: 2mm; margin-bottom: 1mm; }
.type-name { font-size: 10.5pt; font-weight: 900; letter-spacing: 0.4pt; text-transform: uppercase; }
.type-box.red    .type-name { color: #ff6b6b; }
.type-box.yellow .type-name { color: #fbbf24; }
.type-box.blue   .type-name { color: #93c5fd; }
.type-count { font-size: 7pt; color: #666; letter-spacing: 1pt; text-transform: uppercase; font-weight: 600; }
.type-quote { font-size: 8.5pt; color: #bbb; font-style: italic; margin-bottom: 1mm; }
.type-rule { font-size: 8pt; color: #888; padding-left: 2mm; border-left: 0.4mm solid; }
.type-box.red    .type-rule { border-color: #dc2626; }
.type-box.yellow .type-rule { border-color: #d97706; }
.type-box.blue   .type-rule { border-color: #2563eb; }

/* Steps */
.steps { list-style: none; counter-reset: step; margin-bottom: 1mm; }
.steps li {
  counter-increment: step; position: relative; padding-left: 6mm;
  margin-bottom: 1.6mm; min-height: 4mm;
}
.steps li::before {
  content: counter(step);
  position: absolute; left: 0; top: 0.3mm;
  width: 4.2mm; height: 4.2mm; border-radius: 50%;
  background: rgba(255,255,255,0.08); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 7pt; font-weight: 700;
}
.steps .step-title { font-size: 8.5pt; font-weight: 700; color: #fff; line-height: 1.25; }
.steps .step-desc { font-size: 7.3pt; color: #888; line-height: 1.3; margin-top: 0.3mm; }

/* Rule columns */
.rules-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2.5mm; margin-bottom: 2.5mm; }
.rule-box {
  background: rgba(255,255,255,0.03);
  border: 0.3mm solid rgba(255,255,255,0.08);
  border-radius: 2mm; padding: 2.5mm 3mm;
}
.rule-box h3 { font-size: 8pt; font-weight: 700; color: #fff; margin-bottom: 1mm; }
.rule-box ul { list-style: none; }
.rule-box ul li {
  font-size: 7.2pt; color: #aaa; padding: 0.3mm 0 0.3mm 2.5mm; position: relative; line-height: 1.3;
}
.rule-box ul li::before { content: "→"; position: absolute; left: 0; color: #666; }

/* Timing — compact inline format */
.timing {
  font-size: 7.2pt; color: #aaa; line-height: 1.5;
  display: grid; grid-template-columns: 1fr 1fr; column-gap: 5mm;
  margin-bottom: 2mm;
}
.timing .row { display: grid; grid-template-columns: 11mm 1fr; gap: 1mm; padding: 0.2mm 0; }
.timing .t { color: #fff; font-weight: 700; font-variant-numeric: tabular-nums; }

/* Tips — single compact box with inline labels */
.tip {
  background: rgba(37,99,235,0.08);
  border: 0.3mm solid rgba(37,99,235,0.25);
  border-radius: 2mm; padding: 2.2mm 3mm; margin-bottom: 1.5mm;
  font-size: 7.3pt; color: #bcd4ff; line-height: 1.35;
}
.tip b {
  color: #60a5fa; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.5pt; font-size: 6.5pt;
  margin-right: 1.5mm;
}

/* Footer — pinned inside trim area with proper clearance */
.foot {
  position: absolute;
  left: 11mm; right: 11mm; bottom: 7mm;
  display: flex; justify-content: space-between; align-items: flex-end;
  font-size: 6.5pt; color: #555; letter-spacing: 0.5pt;
}
.foot .brand { color: #888; text-transform: uppercase; letter-spacing: 1pt; font-weight: 600; }

/* Page slug (outside trim, in slug area) */
.slug {
  position: absolute;
  left: 2mm; bottom: 1mm;
  font-size: 5pt; color: #aaa; letter-spacing: 0.2pt;
}
`;

function pageFront() {
  return `
<div class="print-page">
  <div class="bleed"></div>
  <div class="trim">
    <div class="logo-small">${ILLUMIO_LOGO}</div>
    <div class="event">CIO CISO xGermany · Munich 2026</div>
    <h1>The Deck of<br>Hard Truths</h1>
    <div class="subtitle">An interactive cybersecurity roundtable game</div>
    <div class="divider"></div>

    <h2>What is this?</h2>
    <p>A deck of <strong>26 cards</strong> built to spark real conversations between security leaders. No vendor pitches. No textbook answers.</p>
    <p style="color:#ccc;">Draw a card. React. The table reacts back. Repeat.</p>

    <div class="divider"></div>

    <h2>The Three Card Types</h2>
    <div class="types">
      <div class="type-box red">
        <div class="type-head"><div class="type-name">🔴 Breach Scenario</div><div class="type-count">8 cards</div></div>
        <div class="type-quote">"This just happened. What do you do?"</div>
        <div class="type-rule">You have <strong>60 seconds</strong> to describe your response. Table then votes: <strong>contained</strong> or <strong>catastrophic.</strong></div>
      </div>
      <div class="type-box yellow">
        <div class="type-head"><div class="type-name">🟡 Hot Take</div><div class="type-count">10 cards</div></div>
        <div class="type-quote">"Defend this. 30 seconds. Even if you disagree."</div>
        <div class="type-rule">Defend the statement for <strong>30 seconds</strong> — even if you think it's wrong. Then the table debates.</div>
      </div>
      <div class="type-box blue">
        <div class="type-head"><div class="type-name">🔵 Trade-Off</div><div class="type-count">8 cards</div></div>
        <div class="type-quote">"Pick a side. No 'it depends.'"</div>
        <div class="type-rule">Two competing priorities. Pick <strong>one</strong> and defend it. The table shows hands for each side.</div>
      </div>
    </div>

    <div class="foot">
      <div class="brand">The Deck of Hard Truths</div>
      <div>1 / 2 · Turn over for how to play →</div>
    </div>
  </div>
  ${cropMarks}
  <div class="slug">Illumio · Manual · A5 · Trim ${TRIM_W}×${TRIM_H}mm · Bleed ${BLEED}mm · Page 1 (front)</div>
</div>`;
}

function pageBack() {
  return `
<div class="print-page">
  <div class="bleed"></div>
  <div class="trim">
    <h2 style="margin-top:0;">How to Play</h2>
    <ol class="steps">
      <li>
        <div class="step-title">Fan cards face-down</div>
        <div class="step-desc">Color-coded backs are visible, so you know the card type before you draw.</div>
      </li>
      <li>
        <div class="step-title">Draw a card</div>
        <div class="step-desc">Moderator picks someone or takes a volunteer. Choose your color (risk level) — or go blind.</div>
      </li>
      <li>
        <div class="step-title">Read it aloud</div>
        <div class="step-desc">The moderator reads, so the drawer has a moment to think.</div>
      </li>
      <li>
        <div class="step-title">Respond</div>
        <div class="step-desc">🔴 60s for breach scenarios · 🟡 30s for hot takes · 🔵 pick a side immediately for trade-offs.</div>
      </li>
      <li>
        <div class="step-title">Table reacts</div>
        <div class="step-desc">Show of hands, quick debate, or moderator picks a dissenter to challenge. 2–3 minutes total per card.</div>
      </li>
      <li>
        <div class="step-title">Move on</div>
        <div class="step-desc">The energy is in snap decisions, not deep dives. That's what the main discussion is for.</div>
      </li>
    </ol>

    <div class="small-divider"></div>

    <h2>Ground Rules</h2>
    <div class="rules-grid">
      <div class="rule-box">
        <h3>✅ Do</h3>
        <ul>
          <li>Be honest. "I don't know" is valid.</li>
          <li>Challenge each other. Disagreement is the point.</li>
          <li>Share real stories. Anonymize if needed.</li>
          <li>Have fun. Serious content, not a serious vibe.</li>
        </ul>
      </div>
      <div class="rule-box">
        <h3>🚫 Don't</h3>
        <ul>
          <li>Give vendor pitches.</li>
          <li>Say "it depends" on trade-offs.</li>
          <li>Dominate the table.</li>
          <li>Take it outside. Chatham House Rule.</li>
        </ul>
      </div>
    </div>

    <h2>Suggested Timing · 60-minute session</h2>
    <div class="timing">
      <div class="row"><div class="t">0:00</div><div>Icebreaker round</div></div>
      <div class="row"><div class="t">0:05</div><div>🃏 Draw 1 warm-up card</div></div>
      <div class="row"><div class="t">0:08</div><div>Discussion block 1</div></div>
      <div class="row"><div class="t">0:23</div><div>🃏 Draw 2 cards</div></div>
      <div class="row"><div class="t">0:28</div><div>Discussion block 2</div></div>
      <div class="row"><div class="t">0:43</div><div>🃏 Draw 2 cards</div></div>
      <div class="row"><div class="t">0:48</div><div>Discussion block 3</div></div>
      <div class="row"><div class="t">0:55</div><div>🃏 Draw 1 final card</div></div>
      <div class="row"><div class="t">0:58</div><div>Wrap-up</div></div>
    </div>

    <div class="small-divider"></div>

    <div class="tip"><b>Moderator</b>Read aloud yourself. Push back on corporate answers: "OK, but what would you <em>actually</em> do at 3 AM?" After each response, quick poll: who agrees, who'd do something different.</div>
    <div class="tip"><b>Everyone</b>Honest &gt; polished. If your gut says "we'd be screwed" — say that. Everyone here has been there.</div>

    <div class="foot">
      <div class="brand">Created by Alexander Goller · illumio.com</div>
      <div>2 / 2</div>
    </div>
  </div>
  ${cropMarks}
  <div class="slug">Illumio · Manual · A5 · Trim ${TRIM_W}×${TRIM_H}mm · Bleed ${BLEED}mm · Page 2 (back)</div>
</div>`;
}

async function main() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Deck of Hard Truths — Manual</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet">
<style>${pageCSS}</style>
</head>
<body>
${pageFront()}
${pageBack()}
</body>
</html>`;

  writeFileSync(OUT_HTML, html);
  console.log(`Wrote ${OUT_HTML}`);

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`file://${OUT_HTML}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);

  await page.pdf({
    path: OUT_PDF,
    width: `${PAGE_W}mm`,
    height: `${PAGE_H}mm`,
    printBackground: true,
    margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
    preferCSSPageSize: true,
  });

  console.log(`Wrote ${OUT_PDF}`);
  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
