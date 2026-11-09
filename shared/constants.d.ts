/** Déclarations de types pour les constantes partagées serveur/client. */

export type ReasonCode = 'checkup' | 'pain' | 'cleaning' | 'consultation' | 'other';
export type StatusCode = 'requested' | 'confirmed' | 'arrived' | 'completed' | 'cancelled' | 'no_show';
export type ExceptionKindCode = 'absence' | 'closure' | 'emergency' | 'lateness';
export type ChannelCode = 'email' | 'sms' | 'whatsapp';

export interface BilingualLabel<T extends string> {
  code: T;
  fr: string;
  ar: string;
}

export interface WeekdayLabel extends BilingualLabel<string> {
  code: number;
  short_fr: string;
  short_ar: string;
}

export interface StatusLabel extends BilingualLabel<StatusCode> {
  tone: 'amber' | 'green' | 'blue' | 'slate' | 'red' | 'orange';
}

export const REASONS: BilingualLabel<ReasonCode>[];
export const REASON_CODES: ReasonCode[];
export const STATUSES: StatusLabel[];
export const ACTIVE_STATUS_LIST: StatusCode[];
export const EXCEPTION_KINDS: BilingualLabel<ExceptionKindCode>[];
export const WEEKDAYS: WeekdayLabel[];
export const CHANNELS: BilingualLabel<ChannelCode>[];
export const DEFAULT_LANGUAGES: string[];
