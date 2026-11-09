import { chromium } from 'playwright';
const B = 'http://localhost:4000';
const browser = await chromium.launch();

async function shot(name, path, { width = 390, height = 900, actions, full = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'fr-FR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(B + path, { waitUntil: 'networkidle' });
  if (actions) await actions(page);
  if (page.url() !== B + path) { await page.goto(B + path, { waitUntil: 'networkidle' }); }
  await page.waitForTimeout(600);
  await page.screenshot({ path: `../.shots/${name}.png`, fullPage: full });
  if (errors.length) console.log(`[${name}] erreurs console:`, errors.slice(0, 5));
  await ctx.close();
}

await shot('01-home-mobile', '/');
await shot('02-home-ar-mobile', '/', { actions: async (p) => { await p.locator('button[lang="ar"]').first().click(); await p.waitForTimeout(300); } });
await shot('03-search', '/recherche?q=&wilaya=');
await shot('04-practice', '/d/cabinet-el-yasmine');
await shot('05-practice-step2', '/d/cabinet-el-yasmine', {
  actions: async (p) => {
    await p.getByRole('radio', { name: 'Contrôle' }).click();
    await p.getByRole('button', { name: /Continuer/ }).click();
    await p.waitForTimeout(500);
    const days = p.getByRole('option');
    await days.nth(1).click();
    await p.waitForTimeout(300);
  },
});
await shot('06-practice-ar', '/d/cabinet-el-yasmine', {
  width: 390,
  actions: async (p) => { await p.locator('button[lang="ar"]').first().click(); await p.waitForTimeout(300); },
});
await shot('07-login', '/staff');
await shot('08-dashboard', '/staff/tableau-de-bord', {
  width: 1280, height: 950,
  actions: async (p) => { await login(p); },
});
await shot('09-agenda-week', '/staff/agenda?view=week', {
  width: 1280, height: 950,
  actions: async (p) => { await login(p); },
});
await shot('10-schedule', '/staff/horaires', {
  width: 1280, height: 1000,
  actions: async (p) => { await login(p); },
});
await shot('11-settings', '/staff/reglages', {
  width: 1280, height: 1000,
  actions: async (p) => { await login(p); },
});
await shot('12-dashboard-mobile', '/staff/tableau-de-bord', {
  actions: async (p) => { await login(p); },
});
await shot('13-profile', '/staff/profil', {
  width: 1280, height: 1100,
  actions: async (p) => { await login(p); },
});

async function login(p) {
  await p.locator('#login-email').fill('dentiste@demo.dz');
  await p.locator('#login-password').fill('Demo2026!dent');
  await p.getByRole('button', { name: /Se connecter/ }).click();
  await p.waitForURL(/tableau-de-bord/, { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(500);
}

await browser.close();
console.log('captures terminées');
