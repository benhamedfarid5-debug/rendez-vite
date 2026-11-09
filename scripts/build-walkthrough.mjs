#!/usr/bin/env node
/**
 * Génère « VOIR-APPLICATION.html » : une visite guidée de l'application en images
 * (captures réelles, encodées dans le fichier pour s'afficher hors ligne).
 */
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = 'http://localhost:4000';
const browser = await chromium.launch();
const shots = [];

async function capture(name, path, { width = 390, height = 844, actions, title, note }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, locale: 'fr-FR' });
  const page = await ctx.newPage();
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  if (actions) await actions(page);
  if (page.url() !== BASE + path) await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const buf = await page.screenshot({ type: 'jpeg', quality: 78, fullPage: true });
  shots.push({ name, title, note, b64: buf.toString('base64') });
  console.log('capture', name, Math.round(buf.length / 1024) + ' Ko');
  await ctx.close();
}

const login = async (p, email = 'dentiste@demo.dz') => {
  await p.goto(BASE + '/staff', { waitUntil: 'networkidle' });
  await p.locator('#login-email').fill(email);
  await p.locator('#login-password').fill('Demo2026!dent');
  await p.getByRole('button', { name: /Se connecter/ }).click();
  await p.waitForURL(/tableau-de-bord/, { timeout: 15000 });
  await p.waitForTimeout(600);
};

await capture('accueil', '/', {
  title: '1. Accueil du patient',
  note: 'Recherche par nom de dentiste et wilaya, bouton « Scanner un QR code », explications en 3 étapes. Sélecteur FR / العربية en haut.',
});

await capture('accueil-ar', '/', {
  actions: async (p) => { await p.locator('button[lang="ar"]').first().click(); await p.waitForTimeout(400); },
  title: '2. Le même écran en arabe (RTL réel)',
  note: 'Toute la mise en page s’inverse : menus, formulaires, boutons. Les heures et téléphones gardent les chiffres latins.',
});

await capture('recherche', '/recherche?q=&wilaya=16', {
  title: '3. Résultats de recherche',
  note: 'Chaque cabinet affiche sa prochaine disponibilité réellement libre, calculée par le serveur.',
});

await capture('fiche', '/d/cabinet-el-yasmine', {
  title: '4. Page publique du cabinet',
  note: 'Nom, spécialité, adresse, ville/wilaya, téléphone, langues, horaires dépliables et prochaine disponibilité. Aucune donnée d’un autre patient.',
});

await capture('reservation', '/d/cabinet-el-yasmine', {
  actions: async (p) => {
    await p.getByRole('radio', { name: 'Contrôle' }).click();
    await p.getByRole('button', { name: /Continuer/ }).click();
    await p.waitForTimeout(800);
    const days = p.getByRole('option');
    const n = await days.count();
    for (let i = 0; i < n; i += 1) if (await days.nth(i).isEnabled()) { await days.nth(i).click(); break; }
    await p.waitForTimeout(700);
    await p.locator('button[dir="ltr"]').first().click();
  },
  title: '5. Choix de la date et du créneau',
  note: 'Seuls les créneaux réellement libres sont proposés. Les jours complets sont grisés, les heures déjà prises n’apparaissent pas.',
});

await capture('confirmation', '/r/MW-DEMO01?t=demo-manage-token-000000000000', {
  title: '6. Confirmation et gestion du rendez-vous',
  note: 'Référence unique, statut (« Confirmé » ou « En attente »), lien de gestion pour annuler / déplacer / exporter / supprimer ses données.',
});

await capture('connexion', '/staff', {
  title: '7. Connexion de l’équipe',
  note: 'Comptes de démonstration pré-remplissables en un clic. Mot de passe commun : Demo2026!dent',
});

await capture('tableau-de-bord', '/staff/tableau-de-bord', {
  width: 1280, height: 900,
  actions: async (p) => { await login(p); },
  title: '8. Tableau de bord du cabinet',
  note: 'Rendez-vous du jour, demandes à confirmer en un clic, prochaines visites, annulations, occupation estimée et créneaux libres.',
});

await capture('agenda', '/staff/agenda?view=week', {
  width: 1280, height: 900,
  actions: async (p) => { await login(p); },
  title: '9. Agenda semaine',
  note: 'Vues jour / semaine / mois, navigation par date, filtres et statuts lisibles (libellé + symbole, jamais la couleur seule).',
});

await capture('horaires', '/staff/horaires', {
  width: 1280, height: 900,
  actions: async (p) => { await login(p); },
  title: '10. Horaires, absences et blocages',
  note: 'Horaires par jour, pauses, jours de repos. Blocage rapide (urgence) et absences programmées : les rendez-vous concernés sont listés, jamais supprimés.',
});

await capture('staff-ar', '/staff/rendez-vous', {
  width: 1280, height: 900,
  actions: async (p) => {
    await login(p);
    await p.locator('button[lang="ar"]').first().click();
    await p.waitForTimeout(400);
  },
  title: '11. Espace cabinet en arabe',
  note: 'Tableaux, filtres et statuts en arabe, avec inversion complète de la mise en page (RTL).',
});

await browser.close();

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Mawid — l'application en images</title>
<style>
  :root { --brand:#257378; --ink:#12212a; --muted:#4b5b63; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, Tahoma, Arial, sans-serif;
         background:#fbf9f5; color:var(--ink); line-height:1.5; }
  header { background:linear-gradient(135deg,#1e4b50,#2f8f94); color:#fff; padding:28px 20px 34px; }
  .wrap { max-width:1080px; margin:0 auto; }
  h1 { font-size:1.6rem; margin:0 0 6px; }
  .sub { opacity:.9; font-size:.95rem; max-width:60ch; }
  .badge { display:inline-block; background:rgba(255,255,255,.16); border-radius:999px; padding:4px 12px;
           font-size:.75rem; margin-bottom:14px; }
  .notice { background:#fff7e6; border:1px solid #f0d9a8; color:#7a5b10; border-radius:12px;
            padding:12px 14px; margin:18px auto 0; max-width:1080px; font-size:.85rem; }
  main { max-width:1080px; margin:0 auto; padding:24px 20px 60px; display:grid; gap:26px; }
  figure { margin:0; background:#fff; border-radius:18px; padding:14px; box-shadow:0 1px 2px rgba(18,56,74,.06),
           0 10px 30px -18px rgba(18,56,74,.35); }
  figcaption { padding:6px 6px 12px; }
  figcaption h2 { font-size:1.02rem; margin:0 0 4px; }
  figcaption p { margin:0; color:var(--muted); font-size:.86rem; }
  img { display:block; width:100%; height:auto; border-radius:10px; border:1px solid #e6e2da; }
  .phone img { max-width:390px; margin:0 auto; }
  footer { text-align:center; color:var(--muted); font-size:.8rem; padding:0 20px 40px; }
  code { background:#eef3f3; padding:1px 5px; border-radius:4px; font-size:.85em; }
</style>
</head>
<body>
<header>
  <div class="wrap">
    <span class="badge">Visite guidée — captures réelles de l'application</span>
    <h1>Mawid — prise de rendez-vous dentaire (FR / العربية)</h1>
    <p class="sub">Voici l'application écran par écran, telle qu'elle s'affiche réellement. Pour la tester vous-même,
    ouvrez l'aperçu live (bouton « Aperçu » de l'espace de travail, port 4000) ou <code>http://localhost:4000</code> après <code>npm start</code>.</p>
  </div>
</header>
<div class="notice">
  <strong>Se connecter à l'espace cabinet :</strong> <code>dentiste@demo.dz</code> — mot de passe <code>Demo2026!dent</code>
  (comptes fictifs). Le rendez-vous de démonstration est accessible via <code>/r/MW-DEMO01?t=demo-manage-token-000000000000</code>.
</div>
<main>
${shots.map((s) => `  <figure class="${s.width === 390 ? 'phone' : ''}">
    <figcaption><h2>${s.title}</h2><p>${s.note}</p></figcaption>
    <img alt="${s.title}" src="data:image/jpeg;base64,${s.b64}" />
  </figure>`).join('\n')}
</main>
<footer>Données fictives · aucun e-mail, SMS ou WhatsApp n'est réellement envoyé · Mawid</footer>
</body>
</html>`;

fs.writeFileSync('VOIR-APPLICATION.html', html);
console.log('VOIR-APPLICATION.html écrit —', Math.round(Buffer.byteLength(html) / 1024) + ' Ko');
