import crypto from 'node:crypto';
import { formatZonedRange, nowIso, toIso } from './time.js';

/**
 * Adaptateurs de notification.
 *
 * Règle de base : AUCUN envoi réel n'est possible sans identifiants fournis
 * dans l'environnement. Tant que ce n'est pas le cas, `isConfigured()` renvoie
 * false et le message est enregistré avec le statut « simulated » : rien n'est
 * envoyé, et l'interface l'indique explicitement.
 *
 * Pour brancher un fournisseur : implémenter `send()` avec le SDK officiel et
 * ajouter les variables d'environnement dans .env.example.
 */

function envConfigured(names) {
  return names.every((n) => {
    const v = process.env[n];
    return typeof v === 'string' && v.trim().length > 0;
  });
}

/** E-mail via SMTP (ex. Gmail avec « mot de passe d'application », OVH, Brevo…). */
export const emailAdapter = {
  id: 'email',
  isConfigured: () => envConfigured(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD']),
  async send({ to, subject, body }) {
    const nodemailer = (await import('nodemailer')).default;
    const port = Number(process.env.SMTP_PORT || 587);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
    await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text: body });
  },
};

/** Numéro algérien → format international sans « + » (ex. 213551234567). */
const intl = (phone) => String(phone || '').replace(/\D/g, '').replace(/^0/, '213');

/** SMS via Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, SMS_SENDER). */
export const smsAdapter = {
  id: 'sms',
  isConfigured: () => envConfigured(['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'SMS_SENDER']),
  async send({ to, body }) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: '+' + intl(to), From: process.env.SMS_SENDER, Body: body }),
    });
    if (!res.ok) throw new Error(`SMS_HTTP_${res.status}`);
  },
};

/**
 * WhatsApp Business (API Cloud de Meta). Hors conversation ouverte, Meta exige
 * un modèle approuvé : indiquer son nom dans WHATSAPP_TEMPLATE (un seul
 * paramètre {{1}} = le texte du message). Sans modèle, envoi en texte simple.
 */
export const whatsappAdapter = {
  id: 'whatsapp',
  isConfigured: () => envConfigured(['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID']),
  async send({ to, body, lang }) {
    const tpl = process.env.WHATSAPP_TEMPLATE;
    const payload = tpl
      ? {
          messaging_product: 'whatsapp',
          to: intl(to),
          type: 'template',
          template: { name: tpl, language: { code: lang === 'ar' ? 'ar' : 'fr' }, components: [{ type: 'body', parameters: [{ type: 'text', text: body }] }] },
        }
      : { messaging_product: 'whatsapp', to: intl(to), type: 'text', text: { body } };
    const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`WHATSAPP_HTTP_${res.status}`);
  },
};

export const adapters = { email: emailAdapter, sms: smsAdapter, whatsapp: whatsappAdapter };

const TEMPLATES = {
  booking_confirmation: {
    fr: (d) => `Bonjour ${d.firstName}, votre rendez-vous chez ${d.practiceName} est ${d.confirmed ? 'confirmé' : 'en attente de confirmation'} le ${d.date} à ${d.time}. Référence : ${d.ref}.${d.link ? ` Gérer : ${d.link}` : ''}`,
    ar: (d) => `مرحبًا ${d.firstName}، موعدك عند ${d.practiceName} ${d.confirmed ? 'مؤكد' : 'في انتظار التأكيد'} يوم ${d.date} على الساعة ${d.time}. رقم الحجز: ${d.ref}.${d.link ? ` الإدارة: ${d.link}` : ''}`,
    subject: { fr: 'Votre rendez-vous dentaire', ar: 'موعدك عند طبيب الأسنان' },
  },
  reminder: {
    fr: (d) => `Rappel : rendez-vous chez ${d.practiceName} le ${d.date} à ${d.time}. Référence : ${d.ref}.`,
    ar: (d) => `تذكير: موعدك عند ${d.practiceName} يوم ${d.date} على الساعة ${d.time}. رقم الحجز: ${d.ref}.`,
    subject: { fr: 'Rappel de rendez-vous', ar: 'تذكير بالموعد' },
  },
  cancellation: {
    fr: (d) => `Votre rendez-vous du ${d.date} à ${d.time} chez ${d.practiceName} a été annulé. Référence : ${d.ref}.`,
    ar: (d) => `تم إلغاء موعدك يوم ${d.date} على الساعة ${d.time} عند ${d.practiceName}. رقم الحجز: ${d.ref}.`,
    subject: { fr: 'Rendez-vous annulé', ar: 'تم إلغاء الموعد' },
  },
  reschedule: {
    fr: (d) => `Votre rendez-vous chez ${d.practiceName} a été déplacé au ${d.date} à ${d.time}. Référence : ${d.ref}.`,
    ar: (d) => `تم تغيير موعدك عند ${d.practiceName} إلى يوم ${d.date} على الساعة ${d.time}. رقم الحجز: ${d.ref}.`,
    subject: { fr: 'Rendez-vous déplacé', ar: 'تم تغيير الموعد' },
  },
};

/**
 * Construit le message. Aucun motif de visite, aucun texte libre, aucune
 * donnée médicale n'est inclus dans un message sortant (minimisation).
 */
export function buildMessage(template, lang, data) {
  const t = TEMPLATES[template];
  if (!t) throw new Error(`UNKNOWN_TEMPLATE:${template}`);
  const l = lang === 'ar' ? 'ar' : 'fr';
  return { subject: t.subject[l], body: t[l](data) };
}

/**
 * Enregistre la notification et tente l'envoi si un adaptateur est configuré.
 * @returns {object} ligne notifications créée
 */
export async function dispatchNotification(db, { practiceId, appointmentId, channel, template, recipient, lang, data, scheduledFor = null }) {
  const adapter = adapters[channel] || emailAdapter;
  const message = buildMessage(template, lang, data);
  const id = crypto.randomUUID();
  const createdAt = nowIso();

  let status = 'simulated';
  let detail = 'Mode démonstration : aucun envoi réel (aucun identifiant fournisseur configuré).';
  let provider = 'demo';
  let sentAt = null;

  if (adapter.isConfigured()) {
    try {
      await adapter.send({ to: recipient, lang, ...message });
      status = 'sent';
      provider = channel;
      sentAt = nowIso();
      detail = 'Envoyé par le fournisseur configuré.';
    } catch (err) {
      status = 'failed';
      provider = channel;
      detail = `Échec de l’envoi : ${err.code || err.message}`;
    }
  }

  db.prepare(
    `INSERT INTO notifications (id, practice_id, appointment_id, channel, template, recipient, status, provider, detail, scheduled_for, created_at, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, practiceId, appointmentId, channel, template, recipient, status, provider, detail, scheduledFor, createdAt, sentAt);

  return { id, status, detail, channel, template, subject: message.subject, body: message.body };
}

/**
 * Canaux utilisés pour prévenir le patient :
 * - e-mail s'il en a donné un ;
 * - sur son téléphone : WhatsApp ou SMS (réglage du cabinet ; sinon le canal configuré).
 */
export function patientChannels(practice, { email, phone }) {
  const out = [];
  if (email) out.push({ channel: 'email', recipient: email });
  if (phone) {
    let ch = practice.notify_channel === 'email' ? null : practice.notify_channel;
    if (!ch) ch = whatsappAdapter.isConfigured() ? 'whatsapp' : smsAdapter.isConfigured() ? 'sms' : null;
    if (ch) out.push({ channel: ch, recipient: phone });
    else if (!out.length) out.push({ channel: 'sms', recipient: phone }); // simulé en démo
  }
  return out;
}

/** Envoie la notification sur tous les canaux du patient (jamais bloquant). */
export function notifyPatient(db, { practice, appointmentId, contact, consent, template, lang, data }) {
  if (!consent) return;
  for (const c of patientChannels(practice, contact)) {
    dispatchNotification(db, { practiceId: practice.id, appointmentId, channel: c.channel, template, recipient: c.recipient, lang, data }).catch(() => {});
  }
}

/**
 * Rappels : crée les notifications dues.
 * Idempotent : on ne crée un rappel que s'il n'existe pas déjà pour ce RDV.
 */
export async function sweepReminders(db, now = new Date()) {
  const practices = db.prepare('SELECT * FROM practices WHERE reminder_enabled = 1').all();
  const pending = [];
  for (const p of practices) {
    const windowEnd = new Date(now.getTime() + (p.reminder_hours_before || 24) * 3_600_000);
    const due = db
      .prepare(
        `SELECT a.* FROM appointments a
         WHERE a.practice_id = ? AND a.notify_consent = 1
           AND a.status IN ('requested','confirmed')
           AND a.starts_at > ? AND a.starts_at <= ?
           AND NOT EXISTS (
             SELECT 1 FROM notifications n
             WHERE n.appointment_id = a.id AND n.template = 'reminder'
           )`,
      )
      .all(p.id, toIso(now), toIso(windowEnd));
    for (const a of due) {
      const when = formatZonedRange(a.starts_at, a.ends_at, p.timezone);
      for (const c of patientChannels(p, { email: a.patient_email, phone: a.patient_phone })) {
        pending.push(
          dispatchNotification(db, {
            practiceId: p.id,
            appointmentId: a.id,
            channel: c.channel,
            template: 'reminder',
            recipient: c.recipient,
            lang: a.patient_language,
            data: { firstName: a.patient_first_name, practiceName: p.name_fr, date: when.date, time: when.start, ref: a.public_ref },
          }).catch(() => null),
        );
      }
    }
  }
  await Promise.all(pending);
  return pending.length;
}

export function channelStatus() {
  return Object.values(adapters).map((a) => ({
    id: a.id,
    configured: a.isConfigured(),
  }));
}
