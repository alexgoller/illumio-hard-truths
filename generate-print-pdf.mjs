#!/usr/bin/env node
// Build a print-ready vector PDF from cards.html with 3mm bleed + crop marks.
// - Trim: 63.5 x 88.9 mm (poker standard)
// - Bleed: 3mm on each side (Beschnitt)
// - Crop marks (Schnittmarken): 5mm long, offset 0mm from bleed edge, outside bleed
// - Output pages alternate front + matching back for duplex printing
// - Pure vector: no PNG rasterization; text stays selectable, SVG stays scalable
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CARDS_HTML = join(__dirname, 'cards.html');
const OUT_PDF = join(__dirname, 'illumio-hard-truths-print.pdf');
const OUT_HTML = join(__dirname, 'print-layout.html');

// Geometry (all mm) — large-format cards (2x poker) for table readability.
// Trim 127 x 177.8 mm keeps the poker 2.5:3.5 aspect ratio, preserves bleed
// and crop marks, and keeps the printable area comfortably inside A5.
const TRIM_W = 127;
const TRIM_H = 177.8;
const BLEED = 3;
const MARK_LEN = 5;
const MARK_OFFSET = 0;       // gap between bleed edge and start of crop mark
const MARK_STROKE = 0.25;    // crop mark line thickness
const PAGE_PAD = BLEED + MARK_OFFSET + MARK_LEN + 2; // 10mm
const PAGE_W = TRIM_W + 2 * PAGE_PAD; // 147
const PAGE_H = TRIM_H + 2 * PAGE_PAD; // 197.8

// Offsets from page edge
const BLEED_OFF = PAGE_PAD - BLEED;     // 7mm
const TRIM_OFF  = PAGE_PAD;             // 10mm

// Border colors per card type (match original .card border)
const BORDER_COLOR = { red: '#dc2626', yellow: '#d97706', blue: '#2563eb' };

// Design-pixel size of the original card (from generate-cards.mjs)
const DESIGN_W = 375;
const DESIGN_H = 525;

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // 1) Load original cards.html and extract card outerHTML + classes
  await page.goto(`file://${CARDS_HTML}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const fullHTML = readFileSync(CARDS_HTML, 'utf8');
  const styleMatch = fullHTML.match(/<style>([\s\S]*?)<\/style>/);
  const baseStyles = styleMatch ? styleMatch[1] : '';

  const cards = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.card').forEach((el, i) => {
      const cls = el.className;
      const type = ['red','yellow','blue'].find(c => cls.split(/\s+/).includes(c)) || 'red';
      const isBack = cls.includes('back');
      const idEl = el.querySelector('.card-id');
      const id = idEl ? idEl.textContent.trim() : null;
      out.push({ index: i, isBack, type, id, html: el.outerHTML });
    });
    return out;
  });

  const backs = {};
  cards.filter(c => c.isBack).forEach(c => { backs[c.type] = c.html; });
  const fronts = cards.filter(c => !c.isBack);

  // Order: for duplex printing, alternate front + matching back
  const sequence = [];
  for (const f of fronts) {
    sequence.push({ ...f, kind: 'front' });
    sequence.push({ type: f.type, isBack: true, html: backs[f.type], kind: 'back' });
  }

  // 2) Print-specific CSS (mm-based page, scaled design for card internals)
  const scale = (TRIM_W * 3.7795275591) / DESIGN_W; // mm -> px at 96dpi, divided by design px
  const printCSS = `
@page { size: ${PAGE_W}mm ${PAGE_H}mm; margin: 0; }
html, body { margin: 0; padding: 0; background: white; }
body { font-family: 'Inter', sans-serif; }

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

/* Colored bleed area — matches the card's border color so a slight trim drift still looks intentional */
.bleed-bg {
  position: absolute;
  left: ${BLEED_OFF}mm;
  top: ${BLEED_OFF}mm;
  width: ${TRIM_W + 2*BLEED}mm;
  height: ${TRIM_H + 2*BLEED}mm;
}
.bleed-bg.red    { background: ${BORDER_COLOR.red}; }
.bleed-bg.yellow { background: ${BORDER_COLOR.yellow}; }
.bleed-bg.blue   { background: ${BORDER_COLOR.blue}; }

/* Trim-sized container; crops the scaled card to trim dimensions */
.card-trim {
  position: absolute;
  left: ${TRIM_OFF}mm;
  top: ${TRIM_OFF}mm;
  width: ${TRIM_W}mm;
  height: ${TRIM_H}mm;
  overflow: hidden;
}

/* Render original design at its native pixel size, scale to trim */
.card-trim > .card {
  width: ${DESIGN_W}px !important;
  height: ${DESIGN_H}px !important;
  aspect-ratio: unset !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  transform: scale(${scale.toFixed(6)});
  transform-origin: top left;
  margin: 0 !important;
}

/* Crop marks (Schnittmarken) — outside bleed, aligned to trim edges */
.crop-mark { position: absolute; background: #000; }
.crop-mark.h { height: ${MARK_STROKE}mm; width: ${MARK_LEN}mm; }
.crop-mark.v { width: ${MARK_STROKE}mm; height: ${MARK_LEN}mm; }

/* Top-left: horizontal mark at trim Y, vertical mark at trim X */
.crop-mark.tl-h { top: ${TRIM_OFF}mm; left: ${PAGE_PAD - BLEED - MARK_OFFSET - MARK_LEN}mm; }
.crop-mark.tl-v { top: ${PAGE_PAD - BLEED - MARK_OFFSET - MARK_LEN}mm; left: ${TRIM_OFF}mm; }
/* Top-right */
.crop-mark.tr-h { top: ${TRIM_OFF}mm; right: ${PAGE_PAD - BLEED - MARK_OFFSET - MARK_LEN}mm; }
.crop-mark.tr-v { top: ${PAGE_PAD - BLEED - MARK_OFFSET - MARK_LEN}mm; right: ${TRIM_OFF}mm; }
/* Bottom-left */
.crop-mark.bl-h { bottom: ${TRIM_OFF}mm; left: ${PAGE_PAD - BLEED - MARK_OFFSET - MARK_LEN}mm; }
.crop-mark.bl-v { bottom: ${PAGE_PAD - BLEED - MARK_OFFSET - MARK_LEN}mm; left: ${TRIM_OFF}mm; }
/* Bottom-right */
.crop-mark.br-h { bottom: ${TRIM_OFF}mm; right: ${PAGE_PAD - BLEED - MARK_OFFSET - MARK_LEN}mm; }
.crop-mark.br-v { bottom: ${PAGE_PAD - BLEED - MARK_OFFSET - MARK_LEN}mm; right: ${TRIM_OFF}mm; }

/* Page metadata in the slug area — useful for the print shop */
.page-slug {
  position: absolute;
  left: 2mm;
  bottom: 1mm;
  font-family: 'Inter', sans-serif;
  font-size: 1.8mm;
  color: #888;
  letter-spacing: 0.1mm;
}
`;

  // 3) Build pages
  const pagesHTML = sequence.map((c, i) => {
    const label = c.kind === 'front'
      ? `${c.id || ('CARD-' + (i+1))} · Front`
      : `${c.type.toUpperCase()} · Back`;
    return `
<div class="print-page">
  <div class="bleed-bg ${c.type}"></div>
  <div class="card-trim">${c.html}</div>
  <div class="crop-mark h tl-h"></div>
  <div class="crop-mark v tl-v"></div>
  <div class="crop-mark h tr-h"></div>
  <div class="crop-mark v tr-v"></div>
  <div class="crop-mark h bl-h"></div>
  <div class="crop-mark v bl-v"></div>
  <div class="crop-mark h br-h"></div>
  <div class="crop-mark v br-v"></div>
  <div class="page-slug">Illumio · Deck of Hard Truths · ${label} · Trim ${TRIM_W}×${TRIM_H}mm · Bleed ${BLEED}mm</div>
</div>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Deck of Hard Truths — Print Layout</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap" rel="stylesheet">
<style>
${baseStyles}
${printCSS}
</style>
</head>
<body>
${pagesHTML}
</body>
</html>`;

  writeFileSync(OUT_HTML, html);
  console.log(`Wrote ${OUT_HTML} (${sequence.length} pages)`);

  // 4) Render HTML to PDF
  const pdfPage = await context.newPage();
  await pdfPage.goto(`file://${OUT_HTML}`, { waitUntil: 'networkidle' });
  // Let web fonts finish
  await pdfPage.evaluate(() => document.fonts.ready);
  await pdfPage.waitForTimeout(500);

  await pdfPage.pdf({
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
