import assert from 'node:assert/strict';
import test from 'node:test';
import Database from '../db/sqlite.js';
import { at, baseBooking, localDate, login, makeApp, seedPractice, seedUser, tempDbFile } from './helpers.js';

/**
 * Parcours de réservation : création, conflits, libération, règles métier.
 */

test('création d’une réservation valide (confirmation automatique)', async () => {
  const file = tempDbFile();
  const { db, agent } = makeApp(file);
  seedPractice(db, { autoConfirm: 1 });

  const res = await agent.post('/api/public/practices/cabinet-test/appointments').send(baseBooking(at(1, '10:00')));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.match(res.body.appointment.reference, /^MW-[A-Z0-9]{6}$/);
  assert.equal(res.body.appointment.status, 'confirmed');
  assert.equal(res.body.appointment.date, localDate(1));
  assert.equal(res.body.appointment.start, '10:00');
  assert.ok(res.body.manage_token, 'un jeton de gestion doit être renvoyé');
  assert.ok(res.body.manage_url.includes('/r/'));

  // Le rendez-vous existe bien en base et le créneau disparaît des disponibilités.
  const avail = await agent.get('/api/public/practices/cabinet-test/availability?from=' + localDate(1) + '&days=1');
  const day = avail.body.days[0];
  assert.ok(!day.slots.some((s) => s.time === '10:00'), 'le créneau réservé ne doit plus être proposé');
  db.close();
});

test('la demande reste « en attente » si le cabinet ne confirme pas automatiquement', async () => {
  const file = tempDbFile();
  const { db, agent } = makeApp(file);
  seedPractice(db, { autoConfirm: 0 });
  const res = await agent.post('/api/public/practices/cabinet-test/appointments').send(baseBooking(at(2, '11:00')));
  assert.equal(res.status, 201);
  assert.equal(res.body.appointment.status, 'requested');
  db.close();
});

test('créneau indisponible : double réservation refusée avec un message utile', async () => {
  const file = tempDbFile();
  const { db, agent, app } = makeApp(file);
  seedPractice(db);
  const slot = at(1, '09:30');
  const first = await agent.post('/api/public/practices/cabinet-test/appointments').send(baseBooking(slot));
  assert.equal(first.status, 201);

  const second = await agent
    .post('/api/public/practices/cabinet-test/appointments')
    .send(baseBooking(slot, { first_name: 'Autre', phone: '0661223344' }));
  assert.equal(second.status, 409);
  assert.ok(['SLOT_TAKEN', 'SLOT_UNAVAILABLE'].includes(second.body.error.code));
  db.close();
});

test('double réservation concurrente : la base refuse le chevauchement (garantie transactionnelle)', async () => {
  const file = tempDbFile();
  const { db } = makeApp(file);
  seedPractice(db);
  const slot = at(3, '14:00');

  // Deux connexions indépendantes (comme deux instances serveur) tentent la même insertion.
  const db2 = new Database(file);
  db2.pragma('foreign_keys = ON');
  const insert = (conn, ref) =>
    conn
      .prepare(
        `INSERT INTO appointments (id, practice_id, public_ref, manage_token_hash, patient_first_name, patient_last_name,
           patient_phone, reason_code, patient_language, starts_at, ends_at, status, source, notify_consent, privacy_consent_at, created_at, updated_at)
         VALUES (?, 'p1', ?, 'x', 'A', 'B', '+213551112233', 'checkup', 'fr', ?, ?, 'confirmed', 'online', 0, ?, ?, ?)`,
      )
      .run(cryptoId(), ref, slot, endIso(slot), slot, slot, slot);

  const results = await Promise.allSettled([
    Promise.resolve().then(() => insert(db, 'MW-AAAAAA')),
    Promise.resolve().then(() => insert(db2, 'MW-BBBBBB')),
  ]);
  const ok = results.filter((r) => r.status === 'fulfilled');
  const failed = results.filter((r) => r.status === 'rejected');
  assert.equal(ok.length, 1, 'un seul rendez-vous doit être accepté');
  assert.equal(failed.length, 1, 'la seconde insertion doit être rejetée');
  assert.match(String(failed[0].reason.message), /SLOT_OVERLAP|UNIQUE/);

  const count = db.prepare("SELECT COUNT(*) AS c FROM appointments WHERE status = 'confirmed'").get().c;
  assert.equal(count, 1);
  db2.close();
  db.close();
});

test('un chevauchement partiel (durées différentes) est lui aussi refusé', async () => {
  const file = tempDbFile();
  const { db, agent } = makeApp(file);
  seedPractice(db);
  const first = await agent.post('/api/public/practices/cabinet-test/appointments').send(baseBooking(at(4, '09:00')));
  assert.equal(first.status, 201);

  // Rendez-vous de 45 min créé par l'équipe à 09:20 -> chevauchement interdit.
  await seedUser(db, 'p1');
  const agent2 = makeApp(file).agent;
  await login(agent2, 'owner@test.dz');
  const res = await agent2.post('/api/staff/appointments').send({
    first_name: 'Chevauchement',
    last_name: 'Test',
    phone: '0770112233',
    reason_code: 'other',
    starts_at: at(4, '09:20'),
    duration_min: 45,
  });
  assert.equal(res.status, 409);
  db.close();
});

test('annulation patient : le créneau est libéré immédiatement', async () => {
  const file = tempDbFile();
  const { db, agent } = makeApp(file);
  seedPractice(db);
  const slot = at(2, '15:30');
  const created = await agent.post('/api/public/practices/cabinet-test/appointments').send(baseBooking(slot));
  const { reference } = created.body.appointment;
  const token = created.body.manage_token;

  const before = await agent.get(`/api/public/practices/cabinet-test/availability?from=${localDate(2)}&days=1`);
  assert.ok(!before.body.days[0].slots.some((s) => s.time === '15:30'));

  const cancel = await agent.post(`/api/public/appointments/${reference}/cancel`).send({ token });
  assert.equal(cancel.status, 200, JSON.stringify(cancel.body));

  const after = await agent.get(`/api/public/practices/cabinet-test/availability?from=${localDate(2)}&days=1`);
  assert.ok(after.body.days[0].slots.some((s) => s.time === '15:30'), 'le créneau doit redevenir disponible');

  // Un nouveau patient peut réserver le même créneau.
  const rebook = await agent
    .post('/api/public/practices/cabinet-test/appointments')
    .send(baseBooking(slot, { first_name: 'Nouveau', phone: '0770556677' }));
  assert.equal(rebook.status, 201);
  db.close();
});

test('reprogrammation : l’ancien créneau est libéré et le nouveau occupé', async () => {
  const file = tempDbFile();
  const { db, agent } = makeApp(file);
  seedPractice(db);
  const created = await agent.post('/api/public/practices/cabinet-test/appointments').send(baseBooking(at(1, '09:00')));
  const { reference } = created.body.appointment;
  const token = created.body.manage_token;

  const move = await agent.post(`/api/public/appointments/${reference}/reschedule`).send({ token, starts_at: at(1, '16:00') });
  assert.equal(move.status, 200, JSON.stringify(move.body));
  assert.equal(move.body.appointment.start, '16:00');

  const avail = await agent.get(`/api/public/practices/cabinet-test/availability?from=${localDate(1)}&days=1`);
  const times = avail.body.days[0].slots.map((s) => s.time);
  assert.ok(times.includes('09:00'), 'ancien créneau libéré');
  assert.ok(!times.includes('16:00'), 'nouveau créneau occupé');
  db.close();
});

test('une absence bloque les réservations et liste les rendez-vous concernés', async () => {
  const file = tempDbFile();
  const { db, agent } = makeApp(file);
  seedPractice(db);
  await seedUser(db, 'p1');
  const staff = makeApp(file).agent;
  await login(staff, 'owner@test.dz');

  const booked = await agent.post('/api/public/practices/cabinet-test/appointments').send(baseBooking(at(5, '10:00')));
  assert.equal(booked.status, 201);

  const block = await staff.post('/api/staff/exceptions').send({
    kind: 'absence',
    starts_at: at(5, '09:00'),
    ends_at: at(5, '17:00'),
    note: 'Congé',
  });
  assert.equal(block.status, 201, JSON.stringify(block.body));
  assert.equal(block.body.affected.length, 1, 'le rendez-vous existant doit être signalé, jamais supprimé');
  assert.equal(block.body.affected[0].reference, booked.body.appointment.reference);

  const avail = await agent.get(`/api/public/practices/cabinet-test/availability?from=${localDate(5)}&days=1`);
  assert.equal(avail.body.days[0].slots.length, 0, 'aucun créneau ne doit rester ouvert');

  const attempt = await agent
    .post('/api/public/practices/cabinet-test/appointments')
    .send(baseBooking(at(5, '11:00'), { phone: '0555998877' }));
  assert.equal(attempt.status, 409);
  db.close();
});

test('le délai minimal et l’horizon de réservation sont appliqués côté serveur', async () => {
  const file = tempDbFile();
  const { db, agent } = makeApp(file);
  const practice = seedPractice(db);
  db.prepare('UPDATE practices SET min_lead_hours = 48, horizon_days = 10 WHERE id = ?').run(practice.id);

  const tooSoon = await agent.post('/api/public/practices/cabinet-test/appointments').send(baseBooking(at(0, '23:30')));
  assert.equal(tooSoon.status, 409, 'réservation trop proche refusée');

  const withinLead = await agent.post('/api/public/practices/cabinet-test/appointments').send(baseBooking(at(3, '10:00')));
  assert.equal(withinLead.status, 201);

  const tooFar = await agent
    .post('/api/public/practices/cabinet-test/appointments')
    .send(baseBooking(at(40, '10:00'), { phone: '0555443322' }));
  assert.equal(tooFar.status, 409);
  db.close();
});

test('validation serveur : téléphone invalide et consentement manquant', async () => {
  const file = tempDbFile();
  const { db, agent } = makeApp(file);
  seedPractice(db);

  const badPhone = await agent.post('/api/public/practices/cabinet-test/appointments').send(baseBooking(at(1, '09:00'), { phone: '123' }));
  assert.equal(badPhone.status, 422);
  assert.ok(badPhone.body.error.fields.phone);

  const noConsent = await agent
    .post('/api/public/practices/cabinet-test/appointments')
    .send(baseBooking(at(1, '09:00'), { privacy_consent: false }));
  assert.equal(noConsent.status, 422);

  const badReason = await agent
    .post('/api/public/practices/cabinet-test/appointments')
    .send(baseBooking(at(1, '09:00'), { reason_code: 'diagnostic' }));
  assert.equal(badReason.status, 422);
  db.close();
});

test('le téléphone est normalisé au format international', async () => {
  const file = tempDbFile();
  const { db, agent } = makeApp(file);
  seedPractice(db);
  const res = await agent
    .post('/api/public/practices/cabinet-test/appointments')
    .send(baseBooking(at(2, '10:30'), { phone: '0551 11 22 33' }));
  assert.equal(res.status, 201);
  assert.equal(res.body.appointment.patient_phone, '+213551112233');
  db.close();
});

function cryptoId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function endIso(startIso) {
  return new Date(Date.parse(startIso) + 30 * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}
