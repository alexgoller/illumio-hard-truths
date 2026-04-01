#!/usr/bin/env node
// Generate individual high-res PNG cards from cards.html using Playwright
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const OUTPUT_DIR = join(__dirname, 'images');
const CARDS_HTML = join(__dirname, 'cards.html');

// Card dimensions at 300dpi (poker size 2.5" x 3.5")
const CARD_WIDTH = 750;
const CARD_HEIGHT = 1050;
const DEVICE_SCALE = 2; // 2x for crisp rendering

async function main() {
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    deviceScaleFactor: DEVICE_SCALE,
    viewport: { width: 1200, height: 900 },
  });

  const page = await context.newPage();

  // Load the cards HTML as a local file
  await page.goto(`file://${CARDS_HTML}`, { waitUntil: 'networkidle' });

  // Wait for fonts to load
  await page.waitForTimeout(2000);

  // Inject a rendering container for individual cards
  const cardData = await page.evaluate(() => {
    const cards = document.querySelectorAll('.card');
    const result = [];
    cards.forEach((card, i) => {
      const classes = card.className;
      const isBack = classes.includes('back');
      // Get card ID from content
      const idEl = card.querySelector('.card-id');
      const id = idEl ? idEl.textContent.trim() : null;
      // Get card type
      let type = 'unknown';
      if (classes.includes('red')) type = 'red';
      else if (classes.includes('yellow')) type = 'yellow';
      else if (classes.includes('blue')) type = 'blue';

      // Get title for filename
      const titleEl = card.querySelector('.card-title');
      const title = titleEl ? titleEl.textContent.trim() : null;

      result.push({ index: i, isBack, id, type, title, classes });
    });
    return result;
  });

  console.log(`Found ${cardData.length} cards total`);

  // Create a standalone page for rendering each card
  const renderPage = await context.newPage();

  // Get the full HTML to extract styles
  const fullHTML = readFileSync(CARDS_HTML, 'utf8');
  const styleMatch = fullHTML.match(/<style>([\s\S]*?)<\/style>/);
  const styles = styleMatch ? styleMatch[1] : '';

  for (const card of cardData) {
    // Get the card's outer HTML
    const cardHTML = await page.evaluate((idx) => {
      const cards = document.querySelectorAll('.card');
      return cards[idx].outerHTML;
    }, card.index);

    // Build a standalone page with just this card
    const standalone = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${CARD_WIDTH / DEVICE_SCALE}px;
  height: ${CARD_HEIGHT / DEVICE_SCALE}px;
  overflow: hidden;
}
${styles}
.card-grid { display: contents; }
.card {
  width: ${CARD_WIDTH / DEVICE_SCALE}px !important;
  height: ${CARD_HEIGHT / DEVICE_SCALE}px !important;
  aspect-ratio: unset !important;
}
</style>
</head><body>${cardHTML}</body></html>`;

    await renderPage.setViewportSize({
      width: CARD_WIDTH / DEVICE_SCALE,
      height: CARD_HEIGHT / DEVICE_SCALE,
    });

    await renderPage.setContent(standalone, { waitUntil: 'networkidle' });
    await renderPage.waitForTimeout(500);

    // Generate filename
    let filename;
    if (card.isBack) {
      filename = `back-${card.type}.png`;
    } else {
      const slug = card.title
        ? card.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
        : `card-${card.index}`;
      filename = `${card.id.toLowerCase()}-${slug}.png`;
    }

    const outPath = join(OUTPUT_DIR, filename);

    await renderPage.screenshot({
      path: outPath,
      type: 'png',
      omitBackground: true, // transparent background
    });

    console.log(`✅ ${filename} (${CARD_WIDTH}x${CARD_HEIGHT}px @${DEVICE_SCALE}x)`);
  }

  await browser.close();
  console.log(`\nDone! ${cardData.length} cards saved to ${OUTPUT_DIR}`);
}

main().catch(console.error);
