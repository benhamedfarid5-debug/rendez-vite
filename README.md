# Mawid — prise de rendez-vous dentaire en Algérie (FR / AR)

Application web **réellement utilisable en démonstration** : un patient trouve un cabinet, voit les
créneaux *réellement libres* et réserve ; le cabinet gère son agenda, ses horaires, ses absences et
ses urgences sans jamais créer de double réservation.

> **Ce que le produit n'est pas** : ce n'est ni un dossier médical, ni un outil de diagnostic, ni un
> système d'ordonnance, de facturation ou de paiement. Aucun conseil médical n'est délivré.
> Toutes les données livrées sont **fictives**.

| | |
|---|---|
| Interface | Bilingue français / العربية, RTL réel, mobile-first |
| Fuseau | `Africa/Algiers` (heures stockées en UTC, affichées en heure locale) |
| Rôles | Propriétaire (dentiste) et secrétaire / assistante |
| Autorité | Le **serveur** calcule les disponibilités et valide chaque réservation |
| Notifications | Architecture d'adaptateurs prête — **aucun envoi réel** sans identifiants (voir §8) |

---

## 1. Démarrage rapide (5 minutes)

```bash
# 1. Prérequis : Node.js >= 20 (testé avec Node 20.20)
node -v

# 2. Dépendances
npm install

# 3. Configuration (aucune clé externe nécessaire)
cp .env.example .env

# 4. Base de données + données de démonstration
npm run db:migrate
npm run db:seed        # npm run db:reset pour repartir de zéro

# 5. Lancement
npm run dev            # API sur :4000 + front Vite sur :5173  → http://localhost:5173
```

**Mode production local (un seul port, une seule commande)**

```bash
npm run build          # compile le front dans dist/
npm start              # sert l'API + le front sur http://localhost:4000
```

### Comptes de démonstration (fictifs — jamais en production)

| E-mail | Rôle | Cabinet | Mot de passe |
|---|---|---|---|
| `dentiste@demo.dz` | Propriétaire | Cabinet El Yasmine (Hydra, Alger) | `Demo2026!dent` |
| `secretaire@demo.dz` | Secrétaire | Cabinet El Yasmine (Hydra, Alger) | `Demo2026!dent` |
| `dentiste.nour@demo.dz` | Propriétaire | Cabinet du Dr Nour (Oran) — **autre tenant** | `Demo2026!dent` |
| `dentiste.constantine@demo.dz` | Propriétaire | Cabinet Le Sourire (Constantine) | `Demo2026!dent` |

- Connexion : **`/staff`** (les comptes sont pré-remplissables d'un clic sur la page de connexion).
- Page publique du cabinet principal : **`/d/cabinet-el-yasmine`**
- Réservation de démonstration gérée par le patient :
  **`/r/MW-DEMO01?t=demo-manage-token-000000000000`** (annuler / déplacer / exporter / supprimer).
- QR code du cabinet : `/api/public/practices/cabinet-el-yasmine/qr.png` (téléchargeable depuis
  Réglages → Profil public).

Le mot de passe de démonstration est modifiable via `DEMO_PASSWORD` **avant** `npm run db:seed`.

---

## 2. Choix techniques (et pourquoi)

Le dossier de travail était **vide** : la stack a donc été choisie pour tenir trois contraintes
imposées par le cahier des charges — fonctionner localement sans clé externe, être réellement testable,
et rester maintenable par une petite équipe.

| Brique | Choix | Raison |
|---|---|---|
| Runtime | **Node.js 20 + Express 4** | Même langage côté serveur et client, écosystème mature, démarrage instantané. |
| Base | **SQLite (better-sqlite3)** | Zéro service à installer pour la démo ; transactions **ACID**, `BEGIN IMMEDIATE`, index uniques partiels et **triggers** → les garanties anti-double-réservation sont réelles, pas seulement applicatives. Migration vers PostgreSQL documentée (§11). |
| Front | **React 18 + TypeScript + Vite** | Démarrage rapide, typage strict (`tsc --noEmit` passe), découpage automatique de `jsQR`. |
| Style | **Tailwind CSS** avec un thème dédié | Palette calme bleu-vert, tailles tactiles 44 px, RTL natif via propriétés logiques (`ms-`, `start-`, `border-e`). |
| Validation | **Zod** côté serveur | Une seule source de vérité pour les règles de saisie, messages d'erreur par champ. |
| Auth | Sessions **httpOnly** + hachage **bcrypt (12 tours)** | Pas de JWT stocké dans le navigateur : rien de sensible dans `localStorage`. |
| QR | `qrcode` (serveur) + `jsqr` (scan caméra) | Le QR n'est **jamais** généré avec des données patient. |
| Tests | `node:test` + `supertest` (API), **Vitest + Testing Library** (UI) | Aucun framework lourd, exécution rapide, couverture des règles critiques. |

---

## 3. Architecture

```
server/
  app.js                 assemble Express (sécurité, routes, erreurs, service du front compilé)
  index.js               point d'entrée (port, arrêt propre, balayage des rappels)
  db/schema.sql          schéma complet + index + triggers anti-chevauchement (idempotent)
  db/index.js            ouverture SQLite (WAL, foreign_keys, busy_timeout)
  lib/time.js            conversions fuseau horaire (Intl, sans dépendance)
  lib/availability.js    moteur de créneaux (source de vérité)
  lib/security.js        sessions, bcrypt, jetons, limitation de débit persistante
  lib/notifications.js   adaptateurs e-mail / SMS / WhatsApp (désactivés par défaut)
  lib/validation.js      schémas Zod + normalisation des téléphones algériens
  lib/http.js            erreurs typées, cookies, en-têtes de sécurité, garde CSRF
  routes/public.js       recherche, fiche, disponibilités, réservation, QR, gestion patient
  routes/auth.js         connexion, déconnexion, sonde de session, middlewares
  routes/staff.js        tableau de bord, agenda, rendez-vous, horaires, absences, réglages
  services/scheduling.js règles métier (réserver, déplacer, annuler, statuts, audit)
  tests/                19 tests d'API (node:test)
  cli/                  migrate.js | seed.js | purge.js | appointments.js (table des RDV) | sql.js (SQL lecture seule)
src/
  pages/                 accueil, recherche, fiche + réservation, gestion, login, aide, confidentialité
  pages/staff/           tableau de bord, agenda, liste, profil public, horaires, réglages
  components/            design system (boutons, champs, modales, statuts, scanner QR…)
  i18n/                  dictionnaire FR/AR complet + direction RTL
  lib/                   client API typé, contexte d'authentification, utilitaires de dates
  tests/                 10 tests d'interface (Vitest)
shared/constants.js      motifs, statuts, jours, canaux — partagés serveur ⇄ client
```

### Modèle de données (SQLite)

`practices` (cabinet + profil public + QR `public_id`) · `users` (comptes de l'équipe, **séparés des
patients**) · `sessions` · `working_hours` (horaires récurrents + pause) · `calendar_exceptions`
(absence, fermeture, urgence, retard) · `appointments` (**données patient** : nom, téléphone, e-mail
facultatif, motif, texte libre facultatif, langue, début/fin UTC, statut, horodatages) ·
`notifications` · `audit_log` · `rate_events` · `data_requests` (export / suppression).

Index et contraintes notables :

```sql
-- Un seul rendez-vous actif par créneau
CREATE UNIQUE INDEX ux_appt_active_slot ON appointments (practice_id, starts_at)
  WHERE status IN ('requested','confirmed','arrived','completed');
-- Index de lecture (cabinet, date), statut, téléphone
-- Triggers trg_appt_no_overlap_ins / trg_appt_no_overlap_upd : refus de tout chevauchement
```

---

## 4. Parcours patient

1. **Accueil** `/` — recherche par nom de cabinet **et** wilaya, explication du QR, bouton
   « Scanner un QR code » (caméra), repli explicite si la caméra est refusée (saisie du code ou
   recherche par nom).
2. **Résultats** `/recherche?q=…&wilaya=…` — cartes avec **prochaine disponibilité réelle**.
3. **Fiche publique** `/d/:slug` — nom (FR/AR), spécialité, adresse, ville/wilaya, téléphone,
   horaires généraux, langues parlées, prochaine disponibilité. *Aucune donnée privée, aucun
   rendez-vous d'autres patients.*
4. **Réservation en 4 étapes** — motif prédéfini (`Contrôle`, `Douleur / gêne`, `Détartrage`,
   `Consultation`, `Autre`), précision facultative avec avertissement « pas de détails médicaux
   sensibles », date, créneau réellement libre, prénom/nom/téléphone/e-mail facultatif, consentement
   à la politique de confidentialité (obligatoire) et opt-in notifications (facultatif).
5. **Confirmation** `/r/:ref?t=JETON` — date, heure, dentiste, adresse, **référence** (ex. `MW-7K2QF9`),
   état clair (`Confirmé` ou `En attente` + explication), lien de gestion copiable.
6. **Gestion** — annuler, déplacer (créneaux libres uniquement), exporter ses données, demander la
   suppression (anonymisation). Le lien est **à usage limité** : jeton 24 octets non devinable,
   stocké **haché**, valable jusqu'à `MANAGE_LINK_GRACE_DAYS` (30 j) après le rendez-vous.

Aucune inscription n'est nécessaire pour demander un rendez-vous.

---

## 5. Espace cabinet (privé)

Navigation : **Tableau de bord · Agenda · Rendez-vous · Profil public · Réglages** (+ Horaires & absences).

- **Tableau de bord** : rendez-vous du jour, demandes à confirmer (action en un clic), prochaines
  visites, annulations du jour, blocages à venir, **occupation estimée** (minutes réservées / minutes
  encore ouvrables) et créneaux libres restants. Indicateurs purement descriptifs, sans prévision.
- **Agenda** jour / semaine / mois : navigation par date, filtre par statut, statuts visibles
  (libellé **et** symbole, jamais la couleur seule), création au comptoir en cliquant sur une heure
  libre, déplacement avec détection de conflit.
- **Rendez-vous** : liste filtrable (période, statut, nom/téléphone/référence), détail, changement de
  statut (`demandé → confirmé → arrivé → terminé`, `annulé`, `absent`), export CSV de planning.
- **Fiche rendez-vous** : coordonnées, motif **traduit** + texte libre **conservé tel que saisi** (avec
  indication de la langue d'origine), historique d'audit (qui a changé quoi et quand).
- **Profil public** : nom/spécialité/adresse/ville en FR **et** AR, wilaya, téléphone, durée standard,
  délai minimal, horizon maximal, confirmation automatique, visibilité dans la recherche, QR code
  (téléchargement PNG) et lien de partage.
- **Horaires & absences** : horaires par jour, pauses, jours de repos ; **blocage rapide** (urgence /
  retard / indisponibilité, N minutes à partir de maintenant) et périodes programmées (absence, congé,
  fermeture, urgence). Les rendez-vous impactés sont **listés** — jamais supprimés — et peuvent être
  déplacés ou annulés depuis cette liste.
- **Réglages** : notifications et rappels, canal, durée de conservation, équipe (ajout/désactivation
  d'un membre), journal d'activité, demandes de données.

### Rôles et permissions

| Action | Propriétaire | Secrétaire |
|---|---|---|
| Gérer les rendez-vous (créer, déplacer, statut, annuler) | ✅ | ✅ |
| Consulter agenda / tableau de bord / journal | ✅ | ✅ |
| Profil public, horaires, absences/blocages, notifications, conservation | ✅ | ❌ (403) |
| Gérer l'équipe, traiter les demandes de données | ✅ | ❌ (403) |

Ces règles sont appliquées **côté serveur** (`requireOwner`) et reflétées dans l'interface.

---

## 6. Disponibilités et anti-double-réservation

Le serveur est la seule autorité (`server/lib/availability.js`, `server/services/scheduling.js`).

**Calcul d'un créneau** — pour chaque pas de `slot_duration_min` dans la plage d'ouverture du jour :
exclusion des pauses, des jours non travaillés, des exceptions (absence, fermeture, urgence, retard),
des rendez-vous actifs (y compris chevauchement partiel), du délai minimal (`min_lead_hours`) et de
l'horizon (`horizon_days`). Toute heure passée est exclue.

**Trois barrières contre la double réservation** (la 2ᵉ et la 3ᵉ tiennent même si deux requêtes
arrivent exactement en même temps) :

1. **Transaction `BEGIN IMMEDIATE`** : verrou d'écriture pris *avant* la vérification de
   disponibilité, ce qui sérialise deux réservations concurrentes.
2. **Index unique partiel** sur `(practice_id, starts_at)` pour les statuts actifs.
3. **Triggers SQLite** refusant tout chevauchement de plages (durées différentes incluses).

En cas de conflit, l'API renvoie `409 SLOT_TAKEN` et l'interface affiche « Ce créneau vient d'être
réservé » puis **recharge les disponibilités** : le patient choisit un autre créneau sans perdre sa
saisie.

**Annulation / reprogrammation** : le statut passe à `cancelled` (ou `starts_at`/`ends_at` changent)
dans une transaction ; le créneau est immédiatement proposé à nouveau (testé).

---

## 7. Sécurité, confidentialité et contexte algérien

### Minimisation des données
Collectées : nom, prénom, téléphone, e-mail *facultatif*, catégorie de motif, texte libre *facultatif*,
langue, date/heure. **Jamais** : date de naissance, NIN, photo, radio, document clinique, diagnostic,
historique médical, paiement.

### Multi-tenant strict
Chaque requête de l'espace cabinet est filtrée par `practice_id` issu de la session — jamais par un
paramètre d'URL. Un accès direct à l'identifiant d'un rendez-vous d'un autre cabinet renvoie `404`
(voir tests `access.test.js`).

### Compatibilité avec les aperçus intégrés (iframe sandboxée)

L'application fonctionne dans un cadre intégré (`<iframe sandbox="allow-scripts">`), où le document a
une origine opaque et où les cookies sont inutilisables. Trois adaptations, sans affaiblir la
production :

| Contrainte du cadre | Adaptation | Garde-fou production |
|---|---|---|
| Scripts/CSS/API traités comme cross-origin | en-têtes **CORS** reflétés + préflight `OPTIONS` (`server/lib/http.js`) | `DEMO_MODE=0` → seules les origines de même hôte et celles de `ALLOWED_ORIGINS` sont autorisées |
| Cookies de session indisponibles | `/api/auth/login` renvoie aussi un jeton, conservé **en mémoire** (jamais `localStorage`) et envoyé en `Authorization: Bearer` | le cookie `HttpOnly` reste le mécanisme principal |
| Soumission native de formulaire bloquée (`allow-forms` absent) | composant `<Form>` + `<SubmitButton>` (`src/components/form.tsx`) : la validation appelle le gestionnaire directement, touche Entrée gérée | rendu et sémantique inchangés (`<form>`, labels, autocomplétion) |
| Origine `null` sur les requêtes mutantes | tolérée en démonstration | `DEMO_MODE=0` → refus `403 CSRF_ORIGIN` |

Vérification automatisée de ce contexte : `npm run preview:check` (Playwright, iframe sandboxée).

### Mesures techniques en place
- Mots de passe **bcrypt** (12 tours) ; messages d'erreur identiques quel que soit le motif (pas
  d'énumération de comptes) ; coût de calcul constant si l'e-mail est inconnu.
- **Verrouillage de compte** après 5 échecs (15 min) **et** limitation de débit persistante par IP et
  par e-mail (`rate_events`), également active sur la réservation, la recherche et la consultation de
  réservation.
- Sessions : cookie `HttpOnly` + `SameSite=Lax` (+ `Secure` en production), jeton haché en base,
  expiration (`SESSION_TTL_HOURS`), maximum 10 sessions actives, révocation à la déconnexion et à la
  désactivation d'un compte.
- **Garde CSRF** par contrôle d'`Origin`/`Referer` sur toutes les requêtes mutantes (tolérance
  journalisée uniquement en mode démonstration, à cause des proxys de prévisualisation).
- En-têtes de sécurité (`nosniff`, `Referrer-Policy`, `Permissions-Policy`) ; `/api/*` en `noindex`.
- Validation **Zod** systématique côté serveur + normalisation des téléphones (`0551…` → `+213551…`).
- **Logs minimaux** : ni corps de requête, ni motif, ni texte libre ; IP hachée avec sel.
- Le motif de visite **n'apparaît jamais** dans une URL, un QR code, une notification ou un log.
- QR code : uniquement `/d/:slug` (slug + identifiant public) — **aucune** donnée patient.
- Export et suppression des données depuis le lien de gestion du patient (`data_requests` +
  anonymisation immédiate) ; purges de conservation via `npm run db:purge`.

### Point juridique — à vérifier avant toute mise en production
> ⚠️ **La loi algérienne n° 18-07 relative à la protection des personnes physiques dans le traitement
> des données à caractère personnel, ainsi que les exigences de l'ANPDP, doivent être vérifiées avec
> un juriste / l'autorité compétente avant tout lancement réel.** Cette application n'affiche
> volontairement **aucune** mention « conforme loi 18-07 » ou « conforme ANPDP » : aucune conformité ne
> peut être déclarée sans audit. Le choix de l'hébergement (localisation des serveurs) et tout
> **transfert de données hors d'Algérie** (SMS/WhatsApp/e-mail, sauvegardes, CDN) nécessitent également
> une validation juridique préalable. Une déclaration/autorisation auprès de l'ANPDP peut être requise.

La page **`/confidentialite`** explique les finalités, les droits et renvoie ce cadre juridique. Le
consentement à la confidentialité est **distinct** de l'opt-in notifications.

---

## 8. Notifications — prêtes, mais honnêtes

`server/lib/notifications.js` définit trois adaptateurs (`email`, `sms`, `whatsapp`).

- **Sans identifiants** (état livré) : `isConfigured()` renvoie `false` → le message est enregistré en
  base avec le statut **`simulated`** et un texte explicite (« Mode démonstration : aucun envoi réel »).
  L'interface affiche « Non configuré » sur chaque canal et une **boîte de notifications**.
- **Avec identifiants** : `isConfigured()` devient vrai, l'adaptateur tente l'envoi et le statut passe
  à `sent` ou `failed` (l'échec est visible, jamais masqué).
- **Aucun message** ne contient le motif de visite ni le texte libre : uniquement prénom, cabinet,
  date, heure et référence.
- Rappels : `reminder_enabled` + `reminder_hours_before` (24 h par défaut, configurable), canal au
  choix. Balayage automatique toutes les 5 min (`sweepReminders`, idempotent) et bouton
  « Simuler l'envoi des rappels dus » dans Réglages.
- L'envoi est conditionné au **consentement du patient** (`notify_consent`).

### Brancher un fournisseur réel

1. Implémenter `send()` de l'adaptateur concerné dans `server/lib/notifications.js` (SDK officiel :
   SMTP/Nodemailer pour l'e-mail, Twilio/opérateur local pour le SMS, WhatsApp Business API).
2. Renseigner les variables correspondantes dans `.env` :
   `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` — ou
   `SMS_API_KEY`, `SMS_SENDER` — ou `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`.
3. Relancer : le badge du canal passe à « configuré » et les nouveaux messages sont réellement envoyés.
4. **Avant** : vérifier le consentement recueilli, la base légale, le contenu des messages, et le
   transfert de données éventuel (cf. §7).

---

## 9. Français / العربية et accessibilité

- Dictionnaire complet FR/AR (`src/i18n/dictionary.ts`) : navigation, formulaires, boutons, tableaux,
  messages d'erreur, e-mails simulés, motifs prédéfinis (traduits).
- Langue par défaut **français**, sélecteur visible partout, préférence **mémorisée**
  (`localStorage`), RTL réel (`<html dir="rtl" lang="ar">` + propriétés logiques CSS).
- Chiffres en **numération latine** dans les deux langues ; téléphones toujours au format
  international (`+213…`), en `dir="ltr"`.
- Aucune traduction automatique de texte libre (aucun service externe appelé). Le texte du patient est
  conservé tel quel avec sa langue ; l'interface d'extension est prévue
  (`TRANSLATION_ENABLED=0` dans `.env.example`, désactivée par défaut et soumise au consentement).
- Accessibilité : cibles tactiles ≥ 44 px, labels associés, focus visible (`ring`), erreurs reliées
  aux champs (`aria-invalid`, `role="alert"`), statut jamais porté par la couleur seule, `aria-current`
  sur l'étape courante, modales avec piège de focus + `Échap`, lien « aller au contenu », états
  chargement / vide / erreur / succès explicites.

---

## 10. Tests et vérifications

```bash
npm test           # API (19 tests) + interface (10 tests)
npm run test:server
npm run test:client
npx tsc --noEmit   # typage strict
npm run build      # build de production
```

**Couverture des règles critiques (`server/tests/`)**

| Sujet | Test |
|---|---|
| Création de réservation, référence, statut auto/manuel | `booking.test.js` |
| Créneau indisponible → `409` + message | idem |
| **Double réservation concurrente** (2 connexions SQLite, garantie transactionnelle + trigger) | idem |
| Chevauchement partiel (durées différentes) refusé | idem |
| Annulation patient → créneau libéré et re-réservable | idem |
| Reprogrammation → ancien créneau libéré, nouveau occupé | idem |
| Absence/fermeture : disponibilités vidées, rendez-vous **listés** sans suppression | idem |
| Délai minimal + horizon appliqués côté serveur | idem |
| Validation serveur (téléphone, consentement, motif inconnu), normalisation `+213` | idem |
| **Isolation multi-tenant** (lecture et écriture croisées → `404`) | `access.test.js` |
| Permissions secrétaire (403 sur profil/horaires/absences, OK sur rendez-vous) | idem |
| Accès non authentifié, jeton de gestion obligatoire | idem |
| Anti-brute-force (verrouillage 423 / limitation 429) | idem |
| Aucun envoi réel + aucun motif/texte libre dans les notifications | idem |
| Session par jeton (Bearer) + CORS pour l'aperçu en iframe | `access.test.js` |

**Interface (`src/tests/`)** : bascule FR→AR avec `dir="rtl"` réel, persistance de la langue,
traduction des erreurs API, statut avec libellé + symbole, étapes du parcours, état vide, parcours de
réservation (motifs, blocage tant qu'aucun motif, affichage des créneaux libres, mention « en attente »).

**Inspector la table des rendez-vous**

| Moyen | Comment |
|---|---|
| Interface | Tableau de bord (compteurs), Agenda jour/semaine/mois, page « Rendez-vous » (liste filtrable) |
| CLI | `npm run db:appointments` — 60 jours par défaut, options `--all`, `--date YYYY-MM-DD`, `--status`, `--practice`, `--patient` ; heures rendues en `Africa/Algiers` ; totaux par statut et une ligne JSON complète |
| SQL | `npm run db:sql -- "SELECT public_ref, starts_at, status FROM appointments ORDER BY starts_at;"` (lecture seule, les écritures sont refusées) |

**Vérifications manuelles effectuées** (Chromium headless, mobile 390 px et desktop 1280 px) : accueil,
recherche, fiche + réservation complète jusqu'à la confirmation, gestion patient, connexion, tableau de
bord, agenda jour/semaine, création au comptoir, modale de détail, horaires, réglages, profil + QR,
espace cabinet en arabe (RTL) — **zéro erreur console**.

---

## 11. Déploiement recommandé

1. **Serveur** : VPS (2 vCPU / 2 Go suffisent) derrière un reverse proxy **HTTPS** (Caddy ou Nginx +
   Let's Encrypt). `NODE_ENV=production`, `COOKIE_SECURE=1`, `DEMO_MODE=0` (désactive les tolérances
   de démo : CSRF strict, pas de multiplicateur de débit).
2. **Secrets** : `IP_HASH_SALT` long et aléatoire, `.env` en `chmod 600`, jamais commité
   (`.gitignore` couvre `.env`, `data/`, `dist/`, `node_modules/`).
3. **Données** : sauvegarde **chiffrée** et testée de `data/mawid.db` (WAL) ; `npm run db:purge` en
   tâche planifiée selon `retention_days` ; journalisation applicative sans données patient.
4. **Base** : SQLite convient à un cabinet ou à plusieurs cabinets à faible volume **sur une seule
   instance**. Pour plusieurs instances / forte charge : migration PostgreSQL (le SQL utilisé —
   index partiels, transactions, contraintes `CHECK` — est portable ; remplacer les triggers de
   chevauchement par une contrainte d'exclusion `EXCLUDE USING gist (practice_id WITH =, tsrange(...) WITH &&)`).
5. **Exploitation** : `pm2`/`systemd`, supervision de `/api/health`, purge des sessions expirées,
   rotation des journaux, tests de restauration.
6. **Avant ouverture au public** : audit juridique (§7), **2FA** pour les comptes propriétaires,
   envoi d'e-mails réellement configuré, politique de conservation validée, et vérification de
   l'hébergement (localisation des données).

---

## 12. Limites connues (assumées dans cette version)

- **Un praticien par cabinet** (le schéma prévoit `users` multi-rôles ; plusieurs dentistes par cabinet
  demanderaient une table `practitioners` et un créneau par praticien).
- **Pas de SMS/e-mail/WhatsApp réellement envoyés** : aucun identifiant fourni, adaptateurs non
  implémentés (volontairement) — voir §8.
- **Pas de traduction automatique** du texte libre ; **pas** de dossier médical, ordonnance, facturation
  ni paiement (hors périmètre assumé).
- **Pas de 2FA**, pas de récupération de mot de passe par e-mail (procédure : le propriétaire
  réinitialise depuis Réglages → Équipe).
- **SQLite mono-instance** (voir §11 pour PostgreSQL).
- Les dates `<input type="date">` suivent le format du navigateur (jj/mm/aaaa en français) ; les
  **heures** utilisent un champ 24 h dédié, identique en FR et AR.
- Le lien de gestion patient expire 30 jours après le rendez-vous (configurable) ; au-delà, le patient
  doit contacter le cabinet.
- Aucune conformité juridique n'est revendiquée : voir l'avertissement du §7.

### Hypothèses prises (faute d'information explicite)
- Semaine algérienne : **vendredi fermé** par défaut (modifiable jour par jour) ; 9 h–17 h avec pause
  12 h–13 h, créneaux de 30 min.
- Un cabinet = un tenant, une adresse, une langue d'affichage par utilisateur (pas par cabinet).
- Téléphone mobile algérien obligatoire (`05/06/07`), e-mail facultatif.
- Les créneaux du jour déjà passés ne sont plus réservables (`min_lead_hours` par défaut : 2 h).
- Les patients peuvent annuler/déplacer jusqu'à 1 h après le début (au-delà : message invitant à
  appeler le cabinet).
- « Occupation estimée » = minutes réservées / minutes encore ouvrables de la journée.

---

## 13. Commandes utiles

| Commande | Effet |
|---|---|
| `npm run dev` | API + front en développement (Vite, proxy `/api`) |
| `npm run build` / `npm start` | Build de production puis serveur unique sur `:4000` |
| `npm run db:migrate` | Applique le schéma (idempotent) |
| `npm run db:seed` | Données de démonstration (idempotent) |
| `npm run db:reset` | Efface et recrée les données de démonstration |
| `npm run db:purge` | Anonymise les rendez-vous au-delà de la durée de conservation |
| `npm run db:appointments` | Affiche la table des rendez-vous (`-- --all`, `--date`, `--status`, `--practice`, `--patient`) |
| `npm run db:sql -- "SELECT …"` | Requête SQL **en lecture seule** sur la base locale |
| `npm test` | Tests API + interface |
| `npx tsc --noEmit` | Vérification de typage |
| `npm run preview:check` | Vérifie le rendu + réservation + connexion dans une iframe sandboxée |
| `npm run screenshots` | Régénère les captures de référence (`.shots/`) |

Captures d'écran de référence : dossier `.shots/` — régénérables avec
`npm run screenshots` (Playwright, nécessite `npx playwright install chromium`). Les scripts de capture
vivent dans `scripts/` et ne font pas partie de l'application.
