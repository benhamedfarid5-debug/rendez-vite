#!/usr/bin/env node
/**
 * Vérifie que l'application fonctionne dans un cadre intégré (iframe
 * `sandbox="allow-scripts"`, origine opaque « null ») : c'est le contexte de
 * l'aperçu intégré. Contrôle le rendu, une réservation patient complète et une
 * connexion à l'espace cabinet, sans cookie (repli par jeton en mémoire).
 *
 * Usage : node scripts/preview-check.mjs [http://localhost:4000]
 * Prérequis : npx playwright install chromium
 */
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4000';
const browser = await chromium.launch();
const errors = [];

async function withFrame(url, run) {
  const file = `/tmp/mawid-preview-${Date.now()}.html`;
  fs.writeFileSync(
    file,
    `<!doctype html><html><body style="margin:0">
      <iframe src="${url}" sandbox="allow-scripts" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>
    </body></html>`,
  );
  const page = await browser.newPage({ viewport: { width: 460, height: 940 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
  await page.goto(`file://${file}`);
  await page.waitForTimeout(1800);
  await run(page, page.frameLocator('iframe'));
  fs.unlinkSync(file);
  await page.close();
}

// 1. Rendu de l'accueil dans l'iframe
await withFrame(`${BASE}/`, async (page, f) => {
  const title = await f.getByRole('heading', { level: 1 }).first().innerText().catch(() => '');
  console.log(`accueil dans iframe : ${title ? `OK — « ${title.slice(0, 40)}… »` : 'ÉCHEC'}`);
});

// 2. Réservation complète
await withFrame(`${BASE}/d/cabinet-el-yasmine`, async (page, f) => {
  await f.getByRole('radio', { name: 'Contrôle' }).click();
  await f.getByRole('button', { name: /Continuer/ }).click();
  await page.waitForTimeout(800);
  const days = f.getByRole('option');
  const count = await days.count();
  for (let i = 0; i < count; i += 1) {
    if (await days.nth(i).isEnabled()) { await days.nth(i).click(); break; }
  }
  await page.waitForTimeout(600);
  await f.locator('button[dir="ltr"]').first().click();
  await f.getByRole('button', { name: /Continuer/ }).click();
  await page.waitForTimeout(400);
  await f.locator('#p-first').fill('Test');
  await f.locator('#p-last').fill('Apercu');
  await f.locator('#p-phone').fill('0551 00 11 22');
  await f.getByRole('checkbox').last().check();
  await f.getByRole('button', { name: /Continuer/ }).click();
  await page.waitForTimeout(400);
  await f.getByRole('button', { name: /Confirmer le rendez-vous/ }).click();
  await page.waitForTimeout(2000);
  const ok = await f.getByText(/Votre rendez-vous est confirmé/).count();
  console.log(`réservation patient dans iframe : ${ok ? 'OK (confirmation affichée)' : 'ÉCHEC'}`);
});

// 3. Connexion équipe sans cookie (jeton en mémoire)
await withFrame(`${BASE}/staff`, async (page, f) => {
  await f.locator('#login-email').fill('dentiste@demo.dz');
  await f.locator('#login-password').fill('Demo2026!dent');
  await f.getByRole('button', { name: /Se connecter/ }).click();
  await page.waitForTimeout(2200);
  const dash = await f.getByRole('heading', { name: 'Tableau de bord' }).count();
  console.log(`connexion équipe dans iframe : ${dash ? 'OK (tableau de bord)' : 'ÉCHEC'}`);
});

await browser.close();
console.log(errors.length ? `erreurs console : ${JSON.stringify([...new Set(errors)].slice(0, 5))}` : 'erreurs console : aucune');
