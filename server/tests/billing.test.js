import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { login, makeApp, seedPractice, seedUser, tempDbFile } from './helpers.js';
import { addMonths } from '../lib/billing.js';

/** Abonnements : essai gratuit, paiement, cabinet masqué après expiration, webhook signé. */

const registerBody = (email) => ({
  full_name: 'Dr Essai',
  email,
  password: 'TestPass2026!',
  phone: '0551234567',
  practice_name: 'Cabinet Essai',
  wilaya_code: 6,
  honor_declaration: true,
});

test('inscription : 1er mois gratuit, cabinet visible', async () => {
  const file = tempDbFile();
  const { db, agent } = makeApp(file);
  const r = await agent.post('/api/auth/register').send(registerBody('essai@test.dz'));
  assert.equal(r.status, 201);
  const p = db.prepare("SELECT * FROM practices WHERE name_fr = 'Cabinet Essai'").get();
  assert.equal(p.subscription_plan, 'trial');
  const days = (new Date(p.subscription_until) - Date.now()) / 86400000;
  assert.ok(days > 29 && days <= 30.01, `essai de 30 jours (${days})`);
  const search = await agent.get('/api/public/practices?q=essai');
  assert.equal(search.body.results.length, 1);
  db.close();
});

test('abonnement terminé : le cabinet disparaît et ne prend plus de rendez-vous', async () => {
  const file = tempDbFile();
  const { db, agent } = makeApp(file);
  seedPractice(db, { id: 'pX', slug: 'cabinet-x', name: 'Cabinet X' });
  db.prepare("UPDATE practices SET subscription_plan = 'month', subscription_until = '2020-01-01T00:00:00Z' WHERE id = 'pX'").run();
  const search = await agent.get('/api/public/practices?q=cabinet x');
  assert.equal(search.body.results.length, 0);
  const avail = await agent.get('/api/public/practices/cabinet-x/availability');
  assert.equal(avail.body.days.length, 0);
  db.close();
});

test('paiement (mode test) : prolonge l’abonnement selon la formule, réservé au propriétaire', async () => {
  const file = tempDbFile();
  const { db } = makeApp(file);
  seedPractice(db, { id: 'pY', slug: 'cabinet-y', name: 'Cabinet Y' });
  await seedUser(db, 'pY', { email: 'owner@y.dz' });
  await seedUser(db, 'pY', { email: 'sec@y.dz', role: 'secretary' });
  const until = new Date(Date.now() + 10 * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  db.prepare("UPDATE practices SET subscription_plan = 'trial', subscription_until = ? WHERE id = 'pY'").run(until);

  const sec = makeApp(file).agent;
  await login(sec, 'sec@y.dz');
  assert.equal((await sec.post('/api/staff/billing/checkout').send({ plan: 'year', method: 'cib' })).status, 403);

  const owner = makeApp(file).agent;
  await login(owner, 'owner@y.dz');
  const info = await owner.get('/api/staff/billing');
  assert.deepEqual(info.body.plans.map((p) => p.amount), [2000, 6000, 10000]);

  const co = await owner.post('/api/staff/billing/checkout').send({ plan: 'year', method: 'edahabia' });
  assert.equal(co.status, 200);
  assert.ok(co.body.checkout_url.startsWith('/staff/abonnement/test'));
  const pay = await owner.post(`/api/staff/billing/test/${co.body.payment_id}/paid`).send({});
  assert.equal(pay.body.status, 'paid');

  const p = db.prepare("SELECT * FROM practices WHERE id = 'pY'").get();
  assert.equal(p.subscription_plan, 'year');
  assert.equal(p.subscription_until, addMonths(until, 12), 'les 12 mois s’ajoutent après la fin de l’essai');
  // Rejouer le paiement ne prolonge pas deux fois.
  await owner.post(`/api/staff/billing/test/${co.body.payment_id}/paid`).send({});
  assert.equal(db.prepare("SELECT subscription_until FROM practices WHERE id = 'pY'").get().subscription_until, p.subscription_until);
  db.close();
});

test('webhook Chargily : signature obligatoire, paiement validé une seule fois', async () => {
  process.env.CHARGILY_SECRET_KEY = 'test_sk_secret';
  try {
    const file = tempDbFile();
    const { db, agent } = makeApp(file);
    seedPractice(db, { id: 'pZ', slug: 'cabinet-z', name: 'Cabinet Z' });
    db.prepare(
      "INSERT INTO payments (id, practice_id, plan, amount_da, method, status, created_at) VALUES ('pay1', 'pZ', 'month', 2000, 'cib', 'pending', '2026-01-01T00:00:00Z')",
    ).run();
    const body = JSON.stringify({ type: 'checkout.paid', data: { id: 'chk_1', amount: 2000, status: 'paid', metadata: { payment_id: 'pay1' } } });

    const bad = await agent.post('/api/billing/webhook').set('Content-Type', 'application/json').set('signature', 'faux').send(body);
    assert.equal(bad.status, 403);
    assert.equal(db.prepare("SELECT status FROM payments WHERE id = 'pay1'").get().status, 'pending');

    const sig = crypto.createHmac('sha256', 'test_sk_secret').update(body).digest('hex');
    const ok = await agent.post('/api/billing/webhook').set('Content-Type', 'application/json').set('signature', sig).send(body);
    assert.equal(ok.status, 200);
    assert.equal(db.prepare("SELECT status FROM payments WHERE id = 'pay1'").get().status, 'paid');
    assert.equal(db.prepare("SELECT subscription_plan FROM practices WHERE id = 'pZ'").get().subscription_plan, 'month');
    db.close();
  } finally {
    delete process.env.CHARGILY_SECRET_KEY;
  }
});

test('paiement par téléphone : code créé par l’admin, utilisable une seule fois', async () => {
  const file = tempDbFile();
  const { db } = makeApp(file);
  seedPractice(db, { id: 'pC', slug: 'cabinet-c', name: 'Cabinet C' });
  await seedUser(db, 'pC', { email: 'owner@c.dz' });

  const admin = makeApp(file).agent;
  assert.equal((await admin.post('/api/admin/codes').send({ plan: 'semester' })).status, 401, 'admin non connecté');
  assert.equal((await admin.post('/api/admin/login').send({ email: 'admin@rendez-vite.dz', password: 'faux' })).status, 401);
  assert.equal((await admin.post('/api/admin/login').send({ email: 'admin@rendez-vite.dz', password: 'Admin2026!rv' })).status, 200);
  const created = await admin.post('/api/admin/codes').send({ plan: 'semester', note: 'Dr C' });
  assert.equal(created.status, 201);
  assert.match(created.body.code, /^RV-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  const owner = makeApp(file).agent;
  await login(owner, 'owner@c.dz');
  assert.equal((await owner.post('/api/staff/billing/redeem').send({ code: 'RV-AAAA-AAAA' })).status, 404);
  const typed = created.body.code.toLowerCase().replace(/-/g, ' ');
  const ok = await owner.post('/api/staff/billing/redeem').send({ code: typed });
  assert.equal(ok.status, 200);
  const p = db.prepare("SELECT * FROM practices WHERE id = 'pC'").get();
  assert.equal(p.subscription_plan, 'semester');
  const pay = db.prepare("SELECT * FROM payments WHERE practice_id = 'pC'").get();
  assert.equal(pay.method, 'phone');
  assert.equal(pay.amount_da, 6000);
  assert.equal((await owner.post('/api/staff/billing/redeem').send({ code: created.body.code })).status, 409, 'code déjà utilisé');

  const overview = await admin.get('/api/admin/overview');
  assert.equal(overview.body.revenue_da, 6000);
  db.close();
});

test('facture : créée automatiquement après paiement, numérotée, PDF téléchargeable par le seul cabinet', async () => {
  const file = tempDbFile();
  const { db } = makeApp(file);
  seedPractice(db, { id: 'pF', slug: 'cabinet-f', name: 'Cabinet F' });
  seedPractice(db, { id: 'pG', slug: 'cabinet-g', name: 'Cabinet G' });
  await seedUser(db, 'pF', { email: 'owner@f.dz' });
  await seedUser(db, 'pG', { email: 'owner@g.dz' });
  const owner = makeApp(file).agent;
  await login(owner, 'owner@f.dz');
  const co = await owner.post('/api/staff/billing/checkout').send({ plan: 'semester', method: 'cib' });
  await owner.post(`/api/staff/billing/test/${co.body.payment_id}/paid`).send({});

  const inv = db.prepare("SELECT * FROM invoices WHERE practice_id = 'pF'").get();
  assert.match(inv.number, /^RV-\d{4}-0001$/);
  assert.equal(inv.amount_da, 6000);
  assert.equal(inv.buyer_email, 'owner@f.dz');
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(db.prepare('SELECT email_status FROM invoices WHERE id = ?').get(inv.id).email_status, 'simulated');

  const info = await owner.get('/api/staff/billing');
  assert.equal(info.body.payments[0].invoice_number, inv.number);
  const pdf = await owner.get(`/api/staff/billing/invoices/${inv.id}.pdf`).buffer(true).parse((res, cb) => {
    const c = [];
    res.on('data', (d) => c.push(d));
    res.on('end', () => cb(null, Buffer.concat(c)));
  });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');

  const other = makeApp(file).agent;
  await login(other, 'owner@g.dz');
  assert.equal((await other.get(`/api/staff/billing/invoices/${inv.id}.pdf`)).status, 404, 'un autre cabinet ne voit pas la facture');
  db.close();
});
