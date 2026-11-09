# Guide de test — Mawid

Deux façons de tester : **dans le navigateur** (démonstration, 15 min) ou **automatiquement** (tests
API + interface). L'application tourne déjà (`npm start`) et sert tout sur un seul port.

---

> ✅ **Compatibilité aperçu intégré vérifiée** : l'application se charge, réserve et connecte aussi dans
> un cadre isolé (`npm run preview:check`). Si vous voyez malgré tout un écran vide, rechargez la page
> de l'aperçu une fois (le serveur doit être démarré : `npm start`).

## 0. Ouvrir l'application

| Accès | URL |
|---|---|
| Aperçu live (barre d'aperçu Arena) | le panneau « Mawid — application » correspond au port **4000** |
| En local sur votre machine | `npm install` → `cp .env.example .env` → `npm run db:migrate` → `npm run db:seed` → `npm run build` → `npm start` → **http://localhost:4000** |
| Mode développement (rechargement à chaud) | `npm run dev` → **http://localhost:5173** (Vite + proxy `/api`) |

Conseil : ouvrez l'aperçu **en mode mobile** (largeur ~390 px) — c'est la cible principale.

### Comptes de démonstration (fictifs)

| E-mail | Rôle | Cabinet |
|---|---|---|
| `dentiste@demo.dz` | propriétaire | Cabinet El Yasmine (Alger) |
| `secretaire@demo.dz` | secrétaire | Cabinet El Yasmine (Alger) |
| `dentiste.nour@demo.dz` | propriétaire | Cabinet du Dr Nour (Oran) — **autre cabinet** |

Mot de passe commun : **`Demo2026!dent`** (bouton « Pré-remplir » sur la page de connexion).

---

## 1. Parcours patient — réserver (5 min)

1. Accueil → rechercher « yasmine » ou choisir la wilaya **16 — Alger** → **Rechercher**.
2. Ouvrir la fiche **Cabinet dentaire El Yasmine** : vérifier nom, spécialité, adresse, téléphone,
   langues, horaires (dépliable) et **prochaine disponibilité réelle**.
3. Cliquer **Prendre rendez-vous** :
   - Étape 1 : le bouton **Continuer est désactivé** tant qu'aucun motif n'est choisi.
   - Étape 2 : les jours sans créneau sont grisés ; choisir un jour puis une heure.
   - Étape 3 : prénom, nom, téléphone (essayez `123` → erreur de champ), e-mail facultatif ;
     cocher **la politique de confidentialité** (obligatoire).
   - Étape 4 : récapitulatif → **Confirmer le rendez-vous**.
4. **Attendu** : page de confirmation avec **référence `MW-XXXXXX`**, statut *Confirmé*, date/heure,
   cabinet, adresse, et boutons *Copier le lien de gestion / Déplacer / Annuler / Exporter / Supprimer*.
5. Revenir sur la fiche du cabinet : **le créneau réservé n'apparaît plus** dans les disponibilités.

### Vérifier l'anti double réservation
- Réservation → **Déplacer** le rendez-vous sur un autre créneau : l'ancien redevient libre, le nouveau
  disparaît de la liste publique.
- **Annuler** : message « Rendez-vous annulé. Le créneau est de nouveau libre. » + le créneau réapparaît.
- Ouvrir la même page publique dans un 2ᵉ onglet, choisir le créneau déjà pris : la validation serveur
  refuse (`409`) et l'interface recharge les disponibilités.

### Vérifier le lien à usage limité
- Retirer `?t=…` de l'URL `/r/MW-…` en gardant la référence → **« Réservation introuvable »**.
- Réutiliser le lien de démonstration fourni : **`/r/MW-DEMO01?t=demo-manage-token-000000000000`**.

### Vérifier le QR code
- Sur la fiche cabinet, le QR affiché en bas pointe vers l'URL publique (pas de données patient).
- Bouton **Scanner un QR code** (accueil) : autoriser la caméra, ou constater le repli explicite
  (saisie du code `cabinet-el-yasmine`) si la caméra est refusée.
- QR téléchargeable : Connexion → **Profil public** → *Télécharger le QR (PNG)*.

---

## 2. Espace cabinet — gérer (5 min)

Connexion : `/staff` → **Pré-remplir** `dentiste@demo.dz` → **Se connecter**.

1. **Tableau de bord** : rendez-vous du jour, **Demandes à confirmer** (bouton *Confirmer* → le compteur
   baisse), prochaines visites, annulations, occupation estimée, créneaux libres.
2. **Agenda** :
   - vue **Jour** : les créneaux libres affichent « + Libre » → cliquer pour créer un rendez-vous au
     comptoir ; les rendez-vous affichent heure, patient, statut.
   - vues **Semaine** / **Mois** (navigation ‹ Aujourd'hui ›, filtre par statut).
3. **Rendez-vous** : filtrer par statut `Demandé`, ouvrir **Détails** → changer le statut
   (*Arrivé*, *Terminé*, *Absent*), déplacer, annuler ; l'**historique** en bas trace qui a fait quoi.
4. **Horaires & absences** :
   - modifier un horaire (ex. fermer le samedi) → **Enregistrer** → vérifier sur la page publique que
     le jour est bien fermé.
   - **Blocage rapide** : *Bloquer maintenant* (30 min) → le créneau disparaît des disponibilités.
   - **Absence programmée** : choisir une période couvrant un rendez-vous existant → la liste
     **« Rendez-vous concernés »** s'affiche (aucune suppression silencieuse) → les déplacer ou annuler.
5. **Profil public** : modifier le nom/la spécialité, voir l'URL publique et le QR, vérifier
   *Confirmer automatiquement* (désactivé → les nouvelles demandes arrivent en *Demandé*).
6. **Réglages** : notifications (canal **Non configuré**, boîte « simulée »), *Simuler l'envoi des
   rappels dus*, équipe (ajouter/désactiver une secrétaire), journal d'activité, demandes de données.

### Vérifier les rôles
- Se déconnecter, se connecter avec **`secretaire@demo.dz`** : l'onglet *Réglages* et *Profil public*
  sont masqués ; la secrétaire peut néanmoins créer/déplacer/annuler des rendez-vous.
- Tenter `PUT /api/staff/profile` avec sa session → **403** (règle serveur, testée).

### Vérifier l'isolation entre cabinets
- Se connecter avec **`dentiste.nour@demo.dz`** : le tableau de bord ne montre **que** les rendez-vous
  du cabinet d'Oran. Aucun rendez-vous d'El Yasmine n'est visible ni modifiable (404 sur accès direct).

---

## 3. Bilingue et RTL (2 min)

- Sélecteur **FR / العربية** en haut de chaque page → toute l'interface passe en arabe, la mise en page
  s'inverse (**RTL réel**), les tableaux, formulaires et modales restent lisibles, les heures et
  téléphones conservent les chiffres latins.
- Recharger la page : **la langue est mémorisée**.
- Faire un parcours de réservation en arabe : la demande enregistrée porte `patient_language = ar`, et
  le texte libre éventuel est conservé **tel que saisi** (aucune traduction automatique).

---

## 4. Tests automatisés (1 commande)

```bash
npm test              # 19 tests API (node:test + supertest) + 10 tests UI (Vitest)
npm run test:server
npm run test:client
npx tsc --noEmit      # typage strict
```

Couverture des règles critiques : création de réservation, créneau indisponible, **double réservation
concurrente** (2 connexions SQLite + trigger), chevauchement partiel, annulation/libération, déplacement,
absence/urgence bloquante avec rendez-vous listés, délai minimal + horizon, validation serveur,
**isolation multi-tenant**, permissions secrétaire, jeton de gestion obligatoire, anti-brute-force,
absence de fuite du motif dans les notifications, et (UI) bascule FR→AR avec `dir="rtl"`.

---

## 5. Voir la table des rendez-vous (3 façons)

**a) Dans l'application (le plus simple)**
1. Se connecter avec `dentiste@demo.dz` / `Demo2026!dent`.
2. **Tableau de bord** → compteurs par statut (en attente, confirmés, terminés, annulés, absents).
3. **Agenda** (jour / semaine / mois) → cliquer sur un rendez-vous ouvre sa fiche complète.
4. **Rendez-vous** → la liste filtrable (statut, période) : c'est exactement la table `appointments`.

**b) En une commande, dans le terminal** (tableau lisible, heures en `Africa/Algiers`)

```bash
npm run db:appointments            # 30 jours en arrière + 30 jours à venir
npm run db:appointments -- --all   # tout l'historique
npm run db:appointments -- --date 2026-11-03
npm run db:appointments -- --status requested
npm run db:appointments -- --practice cabinet-el-yasmine
npm run db:appointments -- --patient Saidi
```

En bas de la sortie : le nombre de rendez-vous par statut, le total, puis **une ligne complète au
format JSON** pour voir toutes les colonnes réellement stockées.

**c) En SQL brut (lecture seule)**

```bash
npm run db:sql -- "SELECT status, COUNT(*) AS nombre FROM appointments GROUP BY status"
npm run db:sql -- "SELECT public_ref, starts_at, status FROM appointments ORDER BY starts_at"
```

La commande refuse toute écriture (`INSERT`, `UPDATE`, `DELETE`, `DROP`…) : elle ne peut pas
modifier les données de démonstration.

> Contrôle utile après un test de double réservation : la requête ci-dessous **ne doit renvoyer
> aucune ligne** (aucun créneau occupé deux fois).
>
> ```bash
> npm run db:sql -- "SELECT practice_id, starts_at, COUNT(*) AS n FROM appointments WHERE status IN ('requested','confirmed','arrived','completed') GROUP BY practice_id, starts_at HAVING COUNT(*) > 1"
> ```

---

## 6. Remise à zéro des données de démonstration

```bash
npm run db:reset      # efface et recrée les données fictives
npm run db:purge      # anonymise les rendez-vous au-delà de la durée de conservation
```

## À garder en tête pendant le test
- Aucune donnée réelle : tout est fictif.
- **Aucun e-mail / SMS / WhatsApp n'est envoyé** : les messages sont enregistrés en statut
  « simulated » dans la boîte de notifications du cabinet.
- Pas de dossier médical, de diagnostic, d'ordonnance ni de paiement — hors périmètre assumé.
- Aucune mention de conformité juridique (loi 18-07 / ANPDP) : à valider avec un juriste avant tout
  lancement réel (voir README §7).
