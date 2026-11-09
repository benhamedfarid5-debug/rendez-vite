import React from 'react';
import { useI18n } from '../i18n';

/**
 * Champ d'heure en 24 h, chiffres latins dans les deux langues.
 * Un <input type="time"> natif suit la locale du navigateur (12 h + AM/PM en
 * anglais) : on préfère un champ texte contrôlé pour garantir la cohérence
 * FR/AR et l'alignement avec les horaires du cabinet.
 */
export function TimeInput({
  id,
  value,
  onChange,
  disabled,
  invalid,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  ariaLabel?: string;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);

  const commit = (raw: string) => {
    const cleaned = raw.replace(/[^\d:]/g, '').slice(0, 5);
    setDraft(cleaned);
    const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(cleaned.length === 4 ? `${cleaned.slice(0, 2)}:${cleaned.slice(2)}` : cleaned);
    if (match) onChange(`${match[1].padStart(2, '0')}:${match[2]}`);
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      dir="ltr"
      className={`input tnum ${invalid ? 'border-red-400' : ''}`}
      value={draft}
      placeholder="HH:MM"
      maxLength={5}
      disabled={disabled}
      aria-label={ariaLabel || t('time')}
      aria-invalid={invalid || undefined}
      onChange={(e) => commit(e.target.value)}
      onBlur={() => {
        // À la sortie du champ, on normalise "9:5" ou "0900" en "09:05" / "09:00".
        const digits = draft.replace(/[^\d]/g, '');
        if (digits.length === 3) commit(`0${digits.slice(0, 1)}:${digits.slice(1)}`);
        else if (digits.length === 4) commit(`${digits.slice(0, 2)}:${digits.slice(2)}`);
        else if (!draft) setDraft('');
        else setDraft(value);
      }}
    />
  );
}
