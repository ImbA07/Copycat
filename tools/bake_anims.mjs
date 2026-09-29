// Startet tools/bake_anims.html in einem Headless-Browser und schreibt assets/anims.json.
// Voraussetzung: lokaler Server auf Port 8765 im Projektordner, playwright-core, UAL-Dateien in _preview/ual/.
import { writeFileSync } from 'node:fs';
const [,, pw = 'playwright-core', exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'] = process.argv;
const { chromium } = await import(pw);
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage();
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('http://localhost:8765/tools/bake_anims.html');
await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
const json = await page.evaluate(() => window.out);
writeFileSync(new URL('../assets/anims.json', import.meta.url), json);
console.log('assets/anims.json', (json.length / 1024).toFixed(0), 'KB');
await browser.close();
