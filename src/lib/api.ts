export class ApiError extends Error {
  code: string;
  status: number;
  fields?: Record<string, string>;
  retryAfter?: number;

  constructor(code: string, message: string, status = 0, fields?: Record<string, string>, retryAfter?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.fields = fields;
    this.retryAfter = retryAfter;
  }
}

/**
 * Jeton de session conservé **en mémoire uniquement** (jamais dans
 * localStorage). Il sert de repli lorsque les cookies sont inutilisables
 * (aperçu dans une iframe isolée, navigateur bloquant les cookies tiers).
 * En navigation normale, le cookie HttpOnly fait le travail et ce jeton
 * n'est qu'un doublon côté client.
 */
let memoryToken: string | null = null;
export function setMemoryToken(token: string | null) {
  memoryToken = token;
}
export function getMemoryToken() {
  return memoryToken;
}

type Options = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
};

/** Appel API : cookies httpOnly inclus, erreurs normalisées. */
export async function api<T>(path: string, { method = 'GET', body, signal }: Options = {}): Promise<T> {
  let res: Response;
  try {
    const headers: Record<string, string> = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (memoryToken) headers.Authorization = `Bearer ${memoryToken}`;
    res = await fetch(path, {
      method,
      signal,
      credentials: 'same-origin',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError('NETWORK', 'Connexion impossible.');
  }

  if (res.status === 204) return undefined as T;

  let payload: any = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    const err = payload?.error || {};
    throw new ApiError(err.code || 'INTERNAL', err.message || 'Erreur', res.status, err.fields, err.retryAfter);
  }
  return payload as T;
}

export type Practice = {
  slug: string;
  public_id: string;
  name_fr: string;
  name_ar?: string | null;
  specialty_fr: string;
  specialty_ar?: string | null;
  address_fr?: string | null;
  address_ar?: string | null;
  city_fr?: string | null;
  city_ar?: string | null;
  wilaya_code?: number | null;
  wilaya?: { fr: string; ar: string } | null;
  phone?: string | null;
  online_booking?: boolean;
  test_booking?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  distance_km?: number | null;
  languages: string[];
  timezone: string;
  slot_duration_min: number;
  min_lead_hours: number;
  horizon_days: number;
  auto_confirm: boolean;
  hours?: WorkingHour[];
  next_availability?: { date: string; time: string } | null;
};

export type WorkingHour = {
  weekday: number;
  is_open: number | boolean;
  open_minute: number;
  close_minute: number;
  break_start: number | null;
  break_end: number | null;
};

export type Slot = { start: string; end: string; time: string };
export type DayAvailability = { date: string; isOpen: boolean; slots: Slot[]; blockReason?: string | null };

export type Appointment = {
  id: string;
  reference: string;
  starts_at: string;
  ends_at: string;
  date: string;
  start: string;
  end: string;
  status: string;
  patient_first_name: string;
  patient_last_name: string;
  patient_phone: string;
  patient_email?: string | null;
  patient_language: 'fr' | 'ar';
  notify_consent: boolean;
  source: 'online' | 'staff';
  reason_code?: string;
  free_text?: string | null;
  free_text_lang?: 'fr' | 'ar' | null;
  created_at: string;
  updated_at: string;
  cancelled_by?: string | null;
};

export type CalendarBlock = {
  id: string;
  kind: 'absence' | 'closure' | 'emergency' | 'lateness';
  starts_at: string;
  ends_at: string;
  date_start: string;
  time_start: string;
  date_end: string;
  time_end: string;
  note?: string | null;
  created_by_name?: string | null;
};
