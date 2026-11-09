import { chromium } from 'playwright';
const B = 'http://localhost:4000';
const browser = await chromium.launch();

async function page(width = 390, height = 900) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  return { p, errs, ctx };
}

async function login(p) {
  await p.goto(B + '/staff', { waitUntil: 'networkidle' });
  await p.locator('#login-email').fill('dentiste@demo.dz');
  await p.locator('#login-password').fill('Demo2026!dent');
  await p.getByRole('button', { name: /Se connecter/ }).click();
  await p.waitForURL(/tableau-de-bord/, { timeout: 15000 });
}

// 1) réservation patient complète jusqu'à la confirmation
{
  const { p, errs, ctx } = await page();
  await p.goto(B + '/d/cabinet-el-yasmine', { waitUntil: 'networkidle' });
  await p.getByRole('radio', { name: 'Contrôle' }).click();
  await p.getByRole('button', { name: /Continuer/ }).click();
  await p.waitForTimeout(500);
  const days = p.getByRole('option');
  const n = await days.count();
  for (let i = 0; i < n; i++) {
    if (await days.nth(i).isEnabled()) { await days.nth(i).click(); break; }
  }
  await p.waitForTimeout(400);
  await p.locator('button[dir="ltr"]').first().click();
  await p.getByRole('button', { name: /Continuer/ }).click();
  await p.locator('#p-first').fill('Yasmine');
  await p.locator('#p-last').fill('Démo');
  await p.locator('#p-phone').fill('0551 23 45 67');
  await p.locator('#p-email').fill('yasmine@example.dz');
  await p.getByRole('checkbox').last().check();
  await p.screenshot({ path: '../.shots/14-booking-details.png', fullPage: true });
  await p.getByRole('button', { name: /Continuer/ }).click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: '../.shots/15-booking-summary.png', fullPage: true });
  await p.getByRole('button', { name: /Confirmer le rendez-vous/ }).click();
  await p.waitForURL(/\/r\//, { timeout: 15000 });
  await p.waitForTimeout(800);
  await p.screenshot({ path: '../.shots/16-booking-confirmed.png', fullPage: true });
  console.log('URL confirmation:', p.url().replace(/t=[^&]+/, 't=***'));
  if (errs.length) console.log('erreurs:', errs.slice(0, 3));
  await ctx.close();
}

// 2) modale de détail rendez-vous (espace cabinet)
{
  const { p, errs, ctx } = await page(1280, 1000);
  await login(p);
  await p.goto(B + '/staff/agenda', { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  await p.locator('button:has-text("Détails")').first().click().catch(() => {});
  await p.waitForTimeout(400);
  // ouvrir via la première carte de rendez-vous du jour
  const appt = p.locator('li button').filter({ hasText: /Confirmé|Demandé|Arrivé|Terminé/ }).first();
  if (await appt.count()) await appt.click();
  await p.waitForTimeout(700);
  await p.screenshot({ path: '../.shots/17-appointment-modal.png', fullPage: false });
  if (errs.length) console.log('erreurs modal:', errs.slice(0, 3));
  await ctx.close();
}

// 3) liste des rendez-vous (desktop) + agenda jour mobile
{
  const { p, errs, ctx } = await page(1280, 1000);
  await login(p);
  await p.goto(B + '/staff/rendez-vous', { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  await p.screenshot({ path: '../.shots/18-appointments-list.png', fullPage: true });
  if (errs.length) console.log('erreurs liste:', errs.slice(0, 3));
  await ctx.close();
}
{
  const { p, ctx } = await page();
  await login(p);
  await p.goto(B + '/staff/agenda', { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  await p.screenshot({ path: '../.shots/19-agenda-day-mobile.png', fullPage: true });
  await ctx.close();
}

// 4) espace cabinet en arabe (RTL sur les tableaux/formulaires)
{
  const { p, ctx } = await page(1280, 1000);
  await login(p);
  await p.locator('button[lang="ar"]').first().click();
  await p.goto(B + '/staff/rendez-vous', { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  await p.screenshot({ path: '../.shots/20-staff-ar.png', fullPage: true });
  await ctx.close();
}

await browser.close();
console.log('captures additionnelles terminées');
