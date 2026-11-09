import { chromium } from 'playwright';
const B = 'http://localhost:4000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto(B + '/staff', { waitUntil: 'networkidle' });
await p.locator('#login-email').fill('dentiste@demo.dz');
await p.locator('#login-password').fill('Demo2026!dent');
await p.getByRole('button', { name: /Se connecter/ }).click();
await p.waitForURL(/tableau-de-bord/, { timeout: 15000 });
// samedi = jour ouvré dans la démo
const sat = new Date(Date.now() + 86400000);
const iso = sat.toISOString().slice(0, 10);
await p.goto(`${B}/staff/agenda?date=${iso}&view=day`, { waitUntil: 'networkidle' });
await p.waitForTimeout(900);
await p.screenshot({ path: '.shots/21-agenda-day-open.png', fullPage: true });
await browser.close();
console.log('capture agenda jour ouvré OK', iso);
