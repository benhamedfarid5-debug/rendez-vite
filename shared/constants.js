/**
 * Constantes partagées entre le serveur et le client.
 * Les libellés sont traduits FR/AR ici pour éviter toute divergence.
 */

export const REASONS = [
  { code: 'checkup', fr: 'Contrôle', ar: 'فحص دوري' },
  { code: 'pain', fr: 'Douleur / gêne', ar: 'ألم / انزعاج' },
  { code: 'cleaning', fr: 'Détartrage', ar: 'إزالة الجير' },
  { code: 'consultation', fr: 'Consultation', ar: 'استشارة' },
  { code: 'other', fr: 'Autre', ar: 'أخرى' },
];

export const REASON_CODES = REASONS.map((r) => r.code);

export const STATUSES = [
  { code: 'requested', fr: 'Demandé', ar: 'مطلوب', tone: 'amber' },
  { code: 'confirmed', fr: 'Confirmé', ar: 'مؤكد', tone: 'green' },
  { code: 'arrived', fr: 'Arrivé', ar: 'حاضر', tone: 'blue' },
  { code: 'completed', fr: 'Terminé', ar: 'منتهٍ', tone: 'slate' },
  { code: 'cancelled', fr: 'Annulé', ar: 'ملغى', tone: 'red' },
  { code: 'no_show', fr: 'Absent', ar: 'لم يحضر', tone: 'orange' },
];

export const ACTIVE_STATUS_LIST = ['requested', 'confirmed', 'arrived', 'completed'];

export const EXCEPTION_KINDS = [
  { code: 'absence', fr: 'Absence', ar: 'غياب' },
  { code: 'closure', fr: 'Fermeture', ar: 'إغلاق' },
  { code: 'emergency', fr: 'Urgence (blocage)', ar: 'حالة طارئة (حظر)' },
  { code: 'lateness', fr: 'Retard / indisponibilité', ar: 'تأخر / عدم توفر' },
];

export const WEEKDAYS = [
  { code: 0, fr: 'Dimanche', ar: 'الأحد', short_fr: 'Dim', short_ar: 'أحد' },
  { code: 1, fr: 'Lundi', ar: 'الاثنين', short_fr: 'Lun', short_ar: 'اثنين' },
  { code: 2, fr: 'Mardi', ar: 'الثلاثاء', short_fr: 'Mar', short_ar: 'ثلاثاء' },
  { code: 3, fr: 'Mercredi', ar: 'الأربعاء', short_fr: 'Mer', short_ar: 'أربعاء' },
  { code: 4, fr: 'Jeudi', ar: 'الخميس', short_fr: 'Jeu', short_ar: 'خميس' },
  { code: 5, fr: 'Vendredi', ar: 'الجمعة', short_fr: 'Ven', short_ar: 'جمعة' },
  { code: 6, fr: 'Samedi', ar: 'السبت', short_fr: 'Sam', short_ar: 'سبت' },
];

export const CHANNELS = [
  { code: 'email', fr: 'E-mail', ar: 'البريد الإلكتروني' },
  { code: 'sms', fr: 'SMS', ar: 'رسالة نصية' },
  { code: 'whatsapp', fr: 'WhatsApp', ar: 'واتساب' },
];

export const DEFAULT_LANGUAGES = ['fr', 'ar'];
