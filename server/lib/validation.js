import { z } from 'zod';
import { REASON_CODES } from '../../shared/constants.js';

/** Normalise un numéro algérien vers +213XXXXXXXXX ; null si invalide. */
export function normalizePhone(raw) {
  const cleaned = String(raw || '').replace(/[\s().-]/g, '');
  let m = /^(?:\+213|00213)([5-7]\d{8})$/.exec(cleaned);
  if (m) return `+213${m[1]}`;
  m = /^0([5-7]\d{8})$/.exec(cleaned);
  if (m) return `+213${m[1]}`;
  return null;
}

export const phoneSchema = z
  .string()
  .trim()
  .min(8, 'Numéro de téléphone requis.')
  .transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Numéro algérien invalide (ex. 0551 23 45 67).' });
      return z.NEVER;
    }
    return n;
  });

export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Au moins 2 caractères.')
  .max(60, '60 caractères maximum.')
  .regex(/^[\p{L}\p{M}\s'’.-]+$/u, 'Lettres, espaces, apostrophes et tirets uniquement.');

const isoDateTime = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Date ou heure invalide.')
  .transform((v) => new Date(v).toISOString().replace(/\.\d{3}Z$/, 'Z'));

export const bookingSchema = z.object({
  starts_at: isoDateTime,
  first_name: nameSchema,
  last_name: nameSchema,
  phone: phoneSchema,
  email: z.string().trim().email('Adresse e-mail invalide.').max(120).optional().or(z.literal('')).transform((v) => v || undefined),
  reason_code: z.enum(REASON_CODES),
  free_text: z
    .string()
    .trim()
    .max(300, '300 caractères maximum.')
    .optional()
    .or(z.literal(''))
    .transform((v) => v || undefined),
  patient_language: z.enum(['fr', 'ar']).default('fr'),
  notify_consent: z.boolean().default(false),
  privacy_consent: z.literal(true, { errorMap: () => ({ message: 'Le consentement à la politique de confidentialité est requis.' }) }),
  website: z.string().max(0).optional(), // honeypot anti-robot
});

export const manageTokenSchema = z.object({ token: z.string().min(10).max(200) });

/** Correction des coordonnées par le patient (erreur de frappe). */
export const contactUpdateSchema = z.object({
  token: z.string().min(10).max(200),
  first_name: nameSchema,
  last_name: nameSchema,
  phone: phoneSchema,
  email: z.string().trim().email('Adresse e-mail invalide.').max(120).optional().or(z.literal('')).transform((v) => v || null),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide.'),
  password: z.string().min(8, 'Mot de passe trop court.').max(200),
});

export const registerSchema = z.object({
  full_name: z.string().trim().min(3, 'Nom trop court.').max(80),
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide.').max(120),
  password: z.string().min(8, '8 caractères minimum.').max(200),
  phone: phoneSchema,
  // Soit on reprend un cabinet de l'annuaire, soit on crée un nouveau cabinet.
  claim_slug: z.string().trim().max(120).optional().or(z.literal('')),
  practice_name: z.string().trim().max(80).optional().or(z.literal('')),
  wilaya_code: z.number().int().min(1).max(58).nullable().optional(),
  city: z.string().trim().max(80).optional().or(z.literal('')),
  address: z.string().trim().max(160).optional().or(z.literal('')),
  // Déclaration sur l'honneur : obligatoire.
  honor_declaration: z.literal(true, { errorMap: () => ({ message: 'Vous devez cocher la déclaration sur l’honneur.' }) }),
}).refine((v) => v.claim_slug || (v.practice_name && v.practice_name.length >= 2), {
  message: 'Nom du cabinet obligatoire.',
  path: ['practice_name'],
});

export const appointmentUpdateSchema = z.object({
  status: z.enum(['requested', 'confirmed', 'arrived', 'completed', 'cancelled', 'no_show']).optional(),
  starts_at: isoDateTime.optional(),
  note: z.string().max(300).optional(),
});

export const staffAppointmentSchema = z.object({
  first_name: nameSchema,
  last_name: nameSchema,
  phone: phoneSchema,
  email: z.string().trim().email().optional().or(z.literal('')).transform((v) => v || undefined),
  reason_code: z.enum(REASON_CODES),
  free_text: z.string().trim().max(300).optional().or(z.literal('')),
  starts_at: isoDateTime,
  duration_min: z.number().int().min(10).max(240).optional(),
  status: z.enum(['requested', 'confirmed']).optional(),
  notify_consent: z.boolean().default(false),
  patient_language: z.enum(['fr', 'ar']).default('fr'),
});

export const hoursSchema = z.object({
  hours: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        is_open: z.boolean(),
        open_minute: z.number().int().min(0).max(1439),
        close_minute: z.number().int().min(1).max(1440),
        break_start: z.number().int().min(0).max(1439).nullable().optional(),
        break_end: z.number().int().min(0).max(1440).nullable().optional(),
      }),
    )
    .length(7),
});

export const exceptionSchema = z
  .object({
    kind: z.enum(['absence', 'closure', 'emergency', 'lateness']),
    starts_at: isoDateTime,
    ends_at: isoDateTime,
    note: z.string().trim().max(200).optional().or(z.literal('')),
  })
  .refine((v) => Date.parse(v.ends_at) > Date.parse(v.starts_at), {
    message: 'La fin doit être postérieure au début.',
    path: ['ends_at'],
  });

export const profileSchema = z.object({
  name_fr: z.string().trim().min(2).max(80),
  name_ar: z.string().trim().max(80).optional().or(z.literal('')),
  specialty_fr: z.string().trim().min(2).max(80),
  specialty_ar: z.string().trim().max(80).optional().or(z.literal('')),
  address_fr: z.string().trim().max(160).optional().or(z.literal('')),
  address_ar: z.string().trim().max(160).optional().or(z.literal('')),
  city_fr: z.string().trim().max(80).optional().or(z.literal('')),
  city_ar: z.string().trim().max(80).optional().or(z.literal('')),
  wilaya_code: z.number().int().min(1).max(58).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  phone: z.string().trim().max(30).optional().or(z.literal('')).transform((v) => (v ? normalizePhone(v) || v : '')),
  languages: z.array(z.enum(['fr', 'ar'])).min(1),
  slot_duration_min: z.number().int().min(10).max(120),
  min_lead_hours: z.number().int().min(0).max(720),
  horizon_days: z.number().int().min(1).max(365),
  auto_confirm: z.boolean(),
  is_listed: z.boolean(),
});

export const notifySettingsSchema = z.object({
  reminder_enabled: z.boolean(),
  reminder_hours_before: z.number().int().min(1).max(240),
  notify_channel: z.enum(['email', 'sms', 'whatsapp']),
  retention_days: z.number().int().min(30).max(3650),
});

export const dataRequestSchema = z.object({
  kind: z.enum(['export', 'deletion']),
  reference: z.string().trim().min(4).max(20),
  token: z.string().min(10),
});
