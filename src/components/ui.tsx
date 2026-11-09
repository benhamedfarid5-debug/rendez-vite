import React, { useEffect, useId, useRef } from 'react';
import { useI18n } from '../i18n';
import { REASONS, STATUSES } from '../../shared/constants';
import { IconAlert, IconCheck, IconInfo, IconRefresh, IconX } from './icons';

/* --------------------------------------------------------------- primitives */

export function Spinner({ size = 18, label }: { size?: number; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-500">
      <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.2" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>
      {label ? <span>{label}</span> : <span className="sr-only">{label || '…'}</span>}
    </span>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
  onDismiss,
}: {
  tone?: 'info' | 'success' | 'warning' | 'error';
  title?: React.ReactNode;
  children?: React.ReactNode;
  onDismiss?: () => void;
}) {
  const map = {
    info: { cls: 'bg-brand-50 text-brand-900 ring-brand-200', Icon: IconInfo },
    success: { cls: 'bg-emerald-50 text-emerald-900 ring-emerald-200', Icon: IconCheck },
    warning: { cls: 'bg-amber-50 text-amber-900 ring-amber-200', Icon: IconAlert },
    error: { cls: 'bg-red-50 text-red-900 ring-red-200', Icon: IconAlert },
  } as const;
  const { cls, Icon } = map[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-xl px-3.5 py-3 text-sm ring-1 ${cls}`}
    >
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? 'mt-1' : ''}>{children}</div> : null}
      </div>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} className="rounded-md p-1 hover:bg-black/5" aria-label="Fermer">
          <IconX size={16} />
        </button>
      ) : null}
    </div>
  );
}

export function Card({ children, className = '', as: Tag = 'div' }: { children: React.ReactNode; className?: string; as?: any }) {
  return <Tag className={`card ${className}`}>{children}</Tag>;
}

export function SectionTitle({ children, hint, action }: { children: React.ReactNode; hint?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-base font-semibold text-ink-900">{children}</h2>
        {hint ? <p className="mt-0.5 text-xs text-ink-500">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ champs */

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className = '',
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-red-600" aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {error ? (
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-700" role="alert">
          <IconAlert size={14} /> {error}
        </p>
      ) : hint ? (
        <p className="hint">{hint}</p>
      ) : null}
    </div>
  );
}

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function TextInput({ className = '', invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        {...props}
        aria-invalid={invalid || undefined}
        className={`input ${invalid ? 'border-red-400 focus:border-red-500 focus:ring-red-500/30' : ''} ${className}`}
      />
    );
  },
);

export const TextArea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function TextArea({ className = '', invalid, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        {...props}
        aria-invalid={invalid || undefined}
        className={`input min-h-[84px] ${invalid ? 'border-red-400' : ''} ${className}`}
      />
    );
  },
);

export function Select({ className = '', children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`input appearance-none bg-white pe-8 ${className}`}>
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  description,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode; description?: React.ReactNode; error?: string }) {
  const id = useId();
  return (
    <div>
      <div className="flex items-start gap-3">
        <input
          id={props.id || id}
          type="checkbox"
          {...props}
          aria-invalid={error ? true : undefined}
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        <label htmlFor={props.id || id} className="text-sm text-ink-700">
          {label}
          {description ? <span className="mt-0.5 block text-xs text-ink-500">{description}</span> : null}
        </label>
      </div>
      {error ? (
        <p className="mt-1 text-xs font-medium text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; description?: React.ReactNode; disabled?: boolean }) {
  return (
    <label className={`flex items-start justify-between gap-4 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <span className="text-sm text-ink-700">
        {label}
        {description ? <span className="mt-0.5 block text-xs text-ink-500">{description}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === 'string' ? label : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-brand-600' : 'bg-slate-300'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'start-[22px]' : 'start-0.5'}`}
        />
      </button>
    </label>
  );
}

/* ------------------------------------------------------------------ statuts */

const TONES: Record<string, { chip: string; dot: string }> = {
  amber: { chip: 'bg-amber-100 text-amber-900 ring-1 ring-amber-200', dot: 'bg-amber-500' },
  green: { chip: 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200', dot: 'bg-emerald-500' },
  blue: { chip: 'bg-sky-100 text-sky-900 ring-1 ring-sky-200', dot: 'bg-sky-500' },
  slate: { chip: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200', dot: 'bg-slate-400' },
  red: { chip: 'bg-red-100 text-red-900 ring-1 ring-red-200', dot: 'bg-red-500' },
  orange: { chip: 'bg-orange-100 text-orange-900 ring-1 ring-orange-200', dot: 'bg-orange-500' },
};

const STATUS_ICON: Record<string, string> = {
  requested: '?',
  confirmed: '✓',
  arrived: '→',
  completed: '■',
  cancelled: '×',
  no_show: '!',
};

/** Le statut n'est jamais signalé par la couleur seule : icône + libellé. */
export function StatusBadge({ status, className = '' }: { status: string; className?: string }) {
  const { t, lang } = useI18n();
  const def = STATUSES.find((s) => s.code === status);
  const tone = TONES[def?.tone || 'slate'];
  const label = lang === 'ar' ? def?.ar : def?.fr;
  return (
    <span className={`chip ${tone.chip} ${className}`}>
      <span aria-hidden="true" className="font-bold leading-none">{STATUS_ICON[status] || '•'}</span>
      <span>{label || status}</span>
      <span className="sr-only">{t('status')}</span>
    </span>
  );
}

export function ReasonLabel({ code }: { code?: string }) {
  const { lang } = useI18n();
  const r = REASONS.find((x) => x.code === code);
  if (!r) return <span className="text-ink-500">—</span>;
  return <span>{lang === 'ar' ? r.ar : r.fr}</span>;
}

/* ---------------------------------------------------------------- états vides */

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-10 text-center">
      {icon ? <div className="text-brand-500">{icon}</div> : null}
      <p className="font-medium text-ink-900">{title}</p>
      {description ? <p className="max-w-sm text-sm text-ink-500">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-900 ring-1 ring-red-200" role="alert">
      <div className="flex items-start gap-2">
        <IconAlert size={18} className="mt-0.5 shrink-0" />
        <div className="flex-1">
          <p>{message}</p>
          {onRetry ? (
            <button type="button" onClick={onRetry} className="btn-secondary btn-sm mt-3">
              <IconRefresh size={15} /> {t('retry')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-14 w-full" />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- modale */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const nodes = ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      const focusable = ref.current?.querySelector<HTMLElement>('input, select, textarea, button');
      focusable?.focus();
    }, 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
          <h2 id={titleId} className="text-base font-semibold text-ink-900">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-ink-500 hover:bg-slate-100" aria-label="Fermer">
            <IconX size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? <div className="sticky bottom-0 border-t border-slate-200 bg-white px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ divers */

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Étapes">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} className="flex flex-1 items-center gap-1.5">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                done ? 'bg-brand-600 text-white' : active ? 'bg-brand-100 text-brand-800 ring-2 ring-brand-500' : 'bg-slate-100 text-slate-500'
              }`}
              aria-current={active ? 'step' : undefined}
            >
              {done ? '✓' : i + 1}
            </span>
            <span className={`hidden truncate text-xs sm:block ${active ? 'font-semibold text-ink-900' : 'text-ink-500'}`}>{s}</span>
            {i < steps.length - 1 ? <span className="h-px flex-1 bg-slate-200" aria-hidden="true" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const { t } = useI18n();
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      className="btn-secondary btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          window.prompt(t('copy'), value);
        }
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }}
    >
      {done ? <IconCheck size={15} /> : null}
      {done ? t('copied') : label || t('copy')}
    </button>
  );
}
