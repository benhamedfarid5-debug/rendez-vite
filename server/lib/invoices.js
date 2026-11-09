import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import { nowIso } from './time.js';
import { emailAdapter } from './notifications.js';

/**
 * Factures des abonnements.
 * Infos du vendeur dans .env (SELLER_*). Tant qu'elles ne sont pas remplies,
 * « XXXX » s'affiche : à compléter avec les informations officielles.
 */
export function seller() {
  const v = (k) => (process.env[k] || '').trim() || 'XXXX';
  return {
    name: v('SELLER_NAME'),
    address: v('SELLER_ADDRESS'),
    nif: v('SELLER_NIF'),
    nis: v('SELLER_NIS'),
    card: v('SELLER_AE_CARD'),
    email: v('SELLER_EMAIL'),
    mention: (process.env.SELLER_MENTION || '').trim(),
  };
}

const PLAN_FR = { month: 'Abonnement Rendez-Vite — 1 mois', semester: 'Abonnement Rendez-Vite — 6 mois', year: 'Abonnement Rendez-Vite — 1 an' };
const METHOD_FR = { cib: 'Carte CIB', edahabia: 'Carte Edahabia', phone: 'Paiement par téléphone (code d’activation)' };
const da = (n) => `${new Intl.NumberFormat('fr-FR').format(n).replace(/ | /g, ' ')} DA`;
const dateFr = (iso) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Algiers' }).format(new Date(iso));

/** Crée la facture d'un paiement validé (une seule par paiement). */
export function createInvoice(db, { paymentId, periodStart, periodEnd }) {
  const existing = db.prepare('SELECT * FROM invoices WHERE payment_id = ?').get(paymentId);
  if (existing) return existing;
  const pay = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  const p = db.prepare('SELECT * FROM practices WHERE id = ?').get(pay.practice_id);
  const owner = db.prepare("SELECT full_name, email FROM users WHERE practice_id = ? AND role = 'owner' ORDER BY created_at LIMIT 1").get(p.id);
  const ts = nowIso();
  const year = ts.slice(0, 4);
  const seq = db.prepare("SELECT COUNT(*) AS c FROM invoices WHERE number LIKE ?").get(`RV-${year}-%`).c + 1;
  const number = `RV-${year}-${String(seq).padStart(4, '0')}`;
  const address = [p.address_fr, p.city_fr, p.wilaya_fr].filter(Boolean).join(', ');
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO invoices (id, number, payment_id, practice_id, issued_at, plan, method, amount_da, period_start, period_end,
       buyer_name, buyer_practice, buyer_address, buyer_email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, number, pay.id, p.id, ts, pay.plan, pay.method, pay.amount_da, periodStart, periodEnd, owner?.full_name || null, p.name_fr, address || null, owner?.email || null);
  return db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
}

/** PDF de la facture (A4). */
export function invoicePdf(inv) {
  const s = seller();
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Facture ${inv.number}`, Author: s.name } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const teal = '#0E3B3D';
    const grey = '#4A5B5A';
    // En-tête
    doc.circle(68, 68, 18).fill(teal);
    doc.fillColor('#F6F4EF').font('Helvetica-Bold').fontSize(16).text('R', 62, 59);
    doc.fillColor(teal).font('Helvetica-Bold').fontSize(20).text('Rendez-Vite', 96, 56);
    doc.fillColor(grey).font('Helvetica').fontSize(9).text('Rendez-vous chez le médecin et le dentiste', 96, 79);
    doc.fillColor(teal).font('Helvetica-Bold').fontSize(22).text('FACTURE', 350, 52, { width: 195, align: 'right' });
    doc.fillColor(grey).font('Helvetica').fontSize(10).text(`N° ${inv.number}`, 350, 80, { width: 195, align: 'right' });
    doc.text(`Date : ${dateFr(inv.issued_at)}`, 350, 94, { width: 195, align: 'right' });

    // Vendeur / client
    const top = 140;
    doc.fillColor(teal).font('Helvetica-Bold').fontSize(10).text('VENDEUR', 50, top);
    doc.fillColor('#14302F').font('Helvetica').fontSize(10)
      .text(s.name, 50, top + 16)
      .text(s.address)
      .text(`NIF : ${s.nif}`)
      .text(`NIS : ${s.nis}`)
      .text(`Carte auto-entrepreneur : ${s.card}`)
      .text(`E-mail : ${s.email}`);
    doc.fillColor(teal).font('Helvetica-Bold').fontSize(10).text('CLIENT', 320, top);
    doc.fillColor('#14302F').font('Helvetica').fontSize(10)
      .text(inv.buyer_name || '—', 320, top + 16, { width: 225 })
      .text(inv.buyer_practice || '—', { width: 225 })
      .text(inv.buyer_address || '—', { width: 225 })
      .text(inv.buyer_email || '—', { width: 225 });

    // Tableau
    const y = 290;
    doc.rect(50, y, 495, 24).fill(teal);
    doc.fillColor('#F6F4EF').font('Helvetica-Bold').fontSize(10).text('Désignation', 60, y + 7).text('Période', 300, y + 7).text('Montant', 455, y + 7, { width: 80, align: 'right' });
    doc.fillColor('#14302F').font('Helvetica').fontSize(10)
      .text(PLAN_FR[inv.plan] || inv.plan, 60, y + 36, { width: 230 })
      .text(`${dateFr(inv.period_start)} au ${dateFr(inv.period_end)}`, 300, y + 36, { width: 150 })
      .text(da(inv.amount_da), 455, y + 36, { width: 80, align: 'right' });
    doc.moveTo(50, y + 70).lineTo(545, y + 70).strokeColor('#DCE3E0').stroke();
    doc.font('Helvetica-Bold').fontSize(12).fillColor(teal).text('Total payé', 300, y + 82).text(da(inv.amount_da), 435, y + 82, { width: 100, align: 'right' });
    doc.font('Helvetica').fontSize(10).fillColor(grey).text(`Mode de paiement : ${METHOD_FR[inv.method] || inv.method}`, 50, y + 120);
    doc.text('Facture acquittée.', 50, y + 136);
    if (s.mention) doc.text(s.mention, 50, y + 152, { width: 495 });

    doc.fontSize(8).fillColor(grey).text('Rendez-Vite — facture générée automatiquement.', 50, 780, { width: 495, align: 'center' });
    doc.end();
  });
}

/** Envoie la facture par e-mail au médecin (simulé tant que l'e-mail n'est pas configuré). */
export async function sendInvoiceEmail(db, inv) {
  if (!inv.buyer_email) return 'no_email';
  if (!emailAdapter.isConfigured()) {
    db.prepare("UPDATE invoices SET email_status = 'simulated', emailed_at = ? WHERE id = ?").run(nowIso(), inv.id);
    return 'simulated';
  }
  try {
    const nodemailer = (await import('nodemailer')).default;
    const port = Number(process.env.SMTP_PORT || 587);
    const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } });
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: inv.buyer_email,
      subject: `Votre facture Rendez-Vite ${inv.number}`,
      text: `Bonjour ${inv.buyer_name || ''},\n\nMerci pour votre paiement. Vous trouverez votre facture ${inv.number} en pièce jointe.\n\n${PLAN_FR[inv.plan] || ''} — ${da(inv.amount_da)}\nPériode : ${dateFr(inv.period_start)} au ${dateFr(inv.period_end)}\n\nL’équipe Rendez-Vite`,
      attachments: [{ filename: `Facture-${inv.number}.pdf`, content: await invoicePdf(inv) }],
    });
    db.prepare("UPDATE invoices SET email_status = 'sent', emailed_at = ? WHERE id = ?").run(nowIso(), inv.id);
    return 'sent';
  } catch {
    db.prepare("UPDATE invoices SET email_status = 'failed' WHERE id = ?").run(inv.id);
    return 'failed';
  }
}
