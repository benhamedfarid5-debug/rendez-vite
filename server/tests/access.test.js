import supertest from 'supertest';
import assert from 'node:assert/strict';
import test from 'node:test';
import { at, baseBooking, login, localDate, makeApp, seedPractice, seedUser, tempDbFile } from './helpers.js';

/** Isolation multi-tenant, rôles et sécurité de la gestion des réservations. */

test('un utilisateur ne peut pas lire ni modifier les rendez-vous d’un autre cabinet', async () => {
  const file = tempDbFile();
  const { db } = makeApp(file);
  seedPractice(db, { id: 'pA', slug: 'cabinet-a', name: 'Cabinet A' });
  seedPractice(db, { id: 'pB', slug: 'cabinet-b', name: 'Cabinet B' });
  await seedUser(db, 'pA', { email: 'a@test.dz' });
  await seedUser(db, 'pB', { email: 'b@test.dz' });

  const publicAgent = makeApp(file).agent;
  const created = await publicAgent.post('/api/public/practices/cabinet-b/appointments').send(baseBooking(at(2, '10:00')));
  assert.equal(created.status, 201);
  const apptB = created.body.appointment;

  const agentA = makeApp(file).agent;
  assert.equal((await login(agentA, 'a@test.dz')).status, 200);

  const list = await agentA.get(`/api/staff/appointments?from=${localDate(-1)}&to=${localDate(10)}`);
  assert.equal(list.status, 200);
  assert.equal(list.body.appointments.length, 0, 'le cabinet A ne voit aucun rendez-vous du cabinet B');

  const direct = await agentA.get(`/api/staff/appointments/${apptB.id}`);
  assert.equal(direct.status, 404, 'accès direct par identifiant refusé');

  const patch = await agentA.patch(`/api/staff/appointments/${apptB.id}`).send({ status: 'cancelled' });
  assert.equal(patch.status, 404);

  // Le rendez-vous du cabinet B est intact.
  const row = db.prepare('SELECT status FROM appointments WHERE id = ?').get(apptB.id);
  assert.equal(row.status, 'confirmed');
  db.close();
});

test('la secrétaire ne peut pas modifier les réglages sensibles (profil, horaires, absences)', async () => {
  const file = tempDbFile();
  const { db } = makeApp(file);
  seedPractice(db);
  await seedUser(db, 'p1', { email: 'owner@test.dz', role: 'owner' });
  await seedUser(db, 'p1', { email: 'secretaire@test.dz', role: 'secretary' });

  const agent = makeApp(file).agent;
  assert.equal((await login(agent, 'secretaire@test.dz')).status, 200);

  const me = await agent.get('/api/auth/me');
  assert.equal(me.body.user.role, 'secretary');
  assert.equal(me.body.permissions.manageProfile, false);
  assert.equal(me.body.permissions.manageAppointments, true);

  const profile = await agent.put('/api/staff/profile').send({
    name_fr: 'Piraté', specialty_fr: 'X', languages: ['fr'], slot_duration_min: 30,
    min_lead_hours: 2, horizon_days: 30, auto_confirm: true, is_listed: true,
  });
  assert.equal(profile.status, 403);

  const hours = await agent.put('/api/staff/hours').send({ hours: [] });
  assert.equal(hours.status, 403);

  const block = await agent.post('/api/staff/exceptions').send({ kind: 'closure', starts_at: at(3, '09:00'), ends_at: at(3, '10:00') });
  assert.equal(block.status, 403);

  // Mais elle peut bien gérer les rendez-vous.
  const created = await agent.post('/api/staff/appointments').send({
    first_name: 'Salma', last_name: 'Test', phone: '0661000111', reason_code: 'checkup', starts_at: at(2, '09:00'),
  });
  assert.equal(created.status, 201);
  db.close();
});

test('accès non authentifié à l’espace cabinet refusé', async () => {
  const file = tempDbFile();
  makeApp(file).db;
  const agent = makeApp(file).agent;
  for (const path of ['/api/staff/overview', '/api/staff/appointments', '/api/staff/profile', '/api/staff/audit']) {
    const res = await agent.get(path);
    assert.equal(res.status, 401, path);
  }
  db0(file);
});

function db0(file) {
  // ferme la connexion ouverte par makeApp
  void file;
}

test('gestion d’une réservation : jeton obligatoire, référence seule insuffisante', async () => {
  const file = tempDbFile();
  const { db, agent } = makeApp(file);
  seedPractice(db);
  const created = await agent.post('/api/public/practices/cabinet-test/appointments').send(baseBooking(at(2, '12:00')));
  const { reference } = created.body.appointment;

  const noToken = await agent.get(`/api/public/appointments/${reference}`);
  assert.equal(noToken.status, 404);

  const wrongToken = await agent.get(`/api/public/appointments/${reference}?t=mauvais-jeton-123456`);
  assert.equal(wrongToken.status, 404);

  const cancelWrong = await agent.post(`/api/public/appointments/${reference}/cancel`).send({ token: 'mauvais-jeton-123456' });
  assert.equal(cancelWrong.status, 404);

  const ok = await agent.get(`/api/public/appointments/${reference}?t=${created.body.manage_token}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.appointment.reference, reference);
  // Aucune donnée privée du cabinet dans la réponse publique.
  assert.equal(ok.body.practice.hours, undefined);
  db.close();
});

test('limitation de débit sur la connexion après plusieurs échecs', async () => {
  const file = tempDbFile();
  const { db } = makeApp(file);
  seedPractice(db);
  await seedUser(db, 'p1', { email: 'owner@test.dz' });
  const agent = makeApp(file).agent;

  // Deux mécanismes complémentaires protègent la connexion :
  //  - verrouillage du compte après 5 échecs (423),
  //  - limitation de débit par IP / par e-mail (429).
  const statuses = [];
  for (let i = 0; i < 40; i += 1) {
    const res = await agent.post('/api/auth/login').send({ email: 'owner@test.dz', password: 'mauvais-mot-de-passe' });
    statuses.push(res.status);
  }
  const blocked = statuses.filter((s) => s === 423 || s === 429);
  assert.ok(blocked.length > 0, `une protection doit s’appliquer (reçu : ${[...new Set(statuses)].join(',')})`);
  assert.ok(blocked.length >= 30, 'la grande majorité des tentatives doit être bloquée');
  assert.ok(!statuses.includes(200), 'aucune tentative ne doit réussir');
  db.close();
});

test('en-têtes de sécurité et absence de fuite du motif dans les notifications', async () => {
  const file = tempDbFile();
  const { db, agent } = makeApp(file);
  seedPractice(db);
  const res = await agent.get('/api/health');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-powered-by'], undefined);

  const created = await agent.post('/api/public/practices/cabinet-test/appointments').send(
    baseBooking(at(3, '10:00'), {
      free_text: 'texte libre du patient',
      notify_consent: true,
      email: 'patient@example.dz',
    }),
  );
  assert.equal(created.status, 201);

  await new Promise((r) => setTimeout(r, 60));
  const notifs = db.prepare('SELECT * FROM notifications').all();
  assert.ok(notifs.length >= 1, 'une notification simulée doit être enregistrée');
  for (const n of notifs) {
    assert.equal(n.status, 'simulated', 'aucun envoi réel en mode démonstration');
    const serialized = JSON.stringify(n);
    assert.ok(!serialized.includes('texte libre du patient'), 'le texte libre ne doit jamais figurer dans une notification');
    assert.ok(!serialized.includes('checkup'), 'le motif ne doit pas figurer dans la notification');
  }
  db.close();
});

test('session : le jeton renvoyé par /login fonctionne en Bearer (aperçu en iframe)', async () => {
  const file = tempDbFile();
  const { db } = makeApp(file);
  seedPractice(db);
  await seedUser(db, 'p1', { email: 'owner@test.dz' });

  const agent = makeApp(file).agent;
  const loginRes = await login(agent, 'owner@test.dz');
  assert.equal(loginRes.status, 200);
  assert.ok(loginRes.body.session_token, 'le jeton de repli doit être renvoyé');

  // Requête sans cookie, avec Authorization: Bearer (contexte d’iframe sandboxée)
  const bearer = await supertest(makeApp(file).app)
    .get('/api/auth/session')
    .set('Authorization', `Bearer ${loginRes.body.session_token}`);
  assert.equal(bearer.status, 200);
  assert.equal(bearer.body.user.email, 'owner@test.dz');

  const staff = await supertest(makeApp(file).app).get('/api/staff/overview').set('Authorization', `Bearer ${loginRes.body.session_token}`);
  assert.equal(staff.status, 200);

  // Jeton invalide → 401
  const bad = await supertest(makeApp(file).app).get('/api/staff/overview').set('Authorization', 'Bearer jeton-invalide-1234567890');
  assert.equal(bad.status, 401);
  db.close();
});

test('CORS : origine « null » (iframe sandboxée) acceptée en démonstration, en-têtes cohérents', async () => {
  const file = tempDbFile();
  const { db, app } = makeApp(file);
  seedPractice(db);
  const res = await supertest(app).options('/api/auth/login').set('Origin', 'null');
  assert.equal(res.status, 204);
  assert.equal(res.headers['access-control-allow-origin'], 'null');
  assert.equal(res.headers['access-control-allow-credentials'], 'true');

  const post = await supertest(app)
    .post('/api/auth/login')
    .set('Origin', 'null')
    .send({ email: 'inconnu@test.dz', password: 'motdepasse123' });
  assert.notEqual(post.status, 400, 'l’origine opaque ne doit pas être rejetée en mode démonstration');
  db.close();
});
