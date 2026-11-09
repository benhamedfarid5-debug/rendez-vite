import React, { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Alert, Card, EmptyState, ErrorState, Field, SectionTitle, Select, SkeletonRows, Switch, TextInput } from '../../components/ui';
import { IconBell, IconCheck, IconRefresh, IconUsers } from '../../components/icons';
import { CHANNELS } from '../../../shared/constants';
import { Form, SubmitButton } from '../../components/form';

type NotifRow = {
  id: string;
  channel: string;
  template: string;
  recipient: string;
  status: string;
  provider?: string | null;
  detail?: string | null;
  created_at: string;
  public_ref?: string | null;
};

type Channels = { id: string; configured: boolean }[];
type Member = { id: string; email: string; full_name: string; role: string; is_active: number; last_login_at?: string | null };
type AuditEntry = { id: string; action: string; actor_label: string; entity_type: string; created_at: string; metadata?: string | null };
type DataRequest = { id: string; kind: string; status: string; created_at: string };

/** Libellés lisibles pour les actions du journal et les modèles de notification. */
const ACTION_LABELS: Record<string, { fr: string; ar: string }> = {
  'auth.login': { fr: 'Connexion', ar: 'تسجيل دخول' },
  'appointment.create_online': { fr: 'Réservation en ligne', ar: 'حجز عبر الإنترنت' },
  'appointment.create_staff': { fr: 'Rendez-vous créé au cabinet', ar: 'موعد أُنشئ في العيادة' },
  'appointment.status': { fr: 'Changement de statut', ar: 'تغيير الحالة' },
  'appointment.cancel': { fr: 'Annulation de rendez-vous', ar: 'إلغاء موعد' },
  'appointment.reschedule': { fr: 'Déplacement de rendez-vous', ar: 'تغيير موعد' },
  'exception.create': { fr: 'Blocage / absence créé', ar: 'إنشاء حظر / غياب' },
  'exception.delete': { fr: 'Blocage supprimé', ar: 'حذف حظر' },
  'hours.update': { fr: 'Horaires modifiés', ar: 'تعديل التوقيت' },
  'profile.update': { fr: 'Profil public modifié', ar: 'تعديل الملف العام' },
  'notifications.settings': { fr: 'Réglages de notifications', ar: 'إعدادات الإشعارات' },
  'team.create': { fr: 'Membre ajouté', ar: 'إضافة عضو' },
  'team.update': { fr: 'Membre modifié', ar: 'تعديل عضو' },
  'data.export_requested': { fr: 'Demande d’export de données', ar: 'طلب تصدير البيانات' },
  'data.deletion_requested': { fr: 'Demande de suppression', ar: 'طلب حذف البيانات' },
};

const TEMPLATE_LABELS: Record<string, { fr: string; ar: string }> = {
  booking_confirmation: { fr: 'Confirmation de réservation', ar: 'تأكيد الحجز' },
  reminder: { fr: 'Rappel', ar: 'تذكير' },
  cancellation: { fr: 'Annulation', ar: 'إلغاء' },
  reschedule: { fr: 'Déplacement', ar: 'تغيير موعد' },
};

function labelize(map: Record<string, { fr: string; ar: string }>, key: string, lang: 'fr' | 'ar') {
  const entry = map[key];
  if (entry) return lang === 'ar' ? entry.ar : entry.fr;
  return key;
}

export function Settings() {
  const { t, lang, apiError, formatDateTime } = useI18n();
  const { permissions, user } = useAuth();
  const owner = !!permissions?.manageNotifications;

  const [notif, setNotif] = useState<{ notifications: NotifRow[]; channels: Channels; reminder_enabled: boolean; reminder_hours_before: number; notify_channel: string; retention_days: number } | null>(null);
  const [team, setTeam] = useState<Member[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [dataRequests, setDataRequests] = useState<DataRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'secretary' | 'owner'>('secretary');
  const [teamError, setTeamError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [n, a, d] = await Promise.all([
        api<any>('/api/staff/notifications'),
        api<{ entries: AuditEntry[] }>('/api/staff/audit'),
        owner ? api<{ requests: DataRequest[] }>('/api/staff/data-requests') : Promise.resolve({ requests: [] }),
      ]);
      setNotif(n);
      setAudit(a.entries);
      setDataRequests(d.requests);
      if (owner) {
        const tm = await api<{ members: Member[] }>('/api/staff/team');
        setTeam(tm.members);
      }
    } catch (err) {
      setError(apiError((err as ApiError).code));
    } finally {
      setLoading(false);
    }
  }, [apiError, owner]);

  useEffect(() => {
    load();
  }, [load]);

  const saveNotif = async () => {
    if (!notif) return;
    setBusy(true);
    try {
      await api('/api/staff/notifications/settings', {
        method: 'PUT',
        body: {
          reminder_enabled: !!notif.reminder_enabled,
          reminder_hours_before: Number(notif.reminder_hours_before),
          notify_channel: notif.notify_channel,
          retention_days: Number(notif.retention_days),
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      load();
    } catch (err) {
      setError(apiError((err as ApiError).code));
    } finally {
      setBusy(false);
    }
  };

  const sweep = async () => {
    setBusy(true);
    try {
      await api('/api/staff/notifications/sweep', { method: 'POST' });
      await load();
    } catch (err) {
      setError(apiError((err as ApiError).code));
    } finally {
      setBusy(false);
    }
  };

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setTeamError(null);
    setBusy(true);
    try {
      await api('/api/staff/team', { method: 'POST', body: { full_name: newName, email: newEmail, password: newPassword, role: newRole } });
      setNewName(''); setNewEmail(''); setNewPassword('');
      await load();
    } catch (err) {
      setTeamError(apiError((err as ApiError).code, (err as ApiError).message));
    } finally {
      setBusy(false);
    }
  };

  const toggleMember = async (m: Member) => {
    try {
      await api(`/api/staff/team/${m.id}`, { method: 'PATCH', body: { is_active: !m.is_active } });
      await load();
    } catch (err) {
      setTeamError(apiError((err as ApiError).code, (err as ApiError).message));
    }
  };

  if (loading) return <SkeletonRows rows={6} />;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-ink-900">{t('settingsTitle')}</h1>
        <p className="text-xs text-ink-500">
          {notif?.channels.some((c) => c.configured) ? t('configuredNotice') : t('simulatedNotice')}
        </p>
      </header>

      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {saved ? <Alert tone="success">{t('savedOk')}</Alert> : null}

      {/* Notifications */}
      {notif ? (
        <Card className="p-4">
          <SectionTitle
            hint={t('channelsSummary', {
              list: notif.channels
                .map((c) => `${CHANNELS.find((x) => x.code === c.id)?.[lang === 'ar' ? 'ar' : 'fr']}${c.configured ? ' ✓' : ''}`)
                .join(' · '),
            })}
            action={
              <button type="button" className="btn-secondary btn-sm" onClick={sweep} disabled={busy}>
                <IconRefresh size={15} /> {t('runReminderSweep')}
              </button>
            }
          >
            <span className="inline-flex items-center gap-2"><IconBell size={16} /> {t('notificationsTitle')}</span>
          </SectionTitle>

          <div className="mb-3 flex flex-wrap gap-1.5">
            {notif.channels.map((c) => (
              <span key={c.id} className={`chip ${c.configured ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-ink-700'}`}>
                {c.configured ? '✓' : '—'} {CHANNELS.find((x) => x.code === c.id)?.[lang === 'ar' ? 'ar' : 'fr']} : {c.configured ? t('configuredNotice') : t('notConfigured')}
              </span>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('channel')} htmlFor="s-channel">
              <Select id="s-channel" value={notif.notify_channel} onChange={(e) => setNotif({ ...notif, notify_channel: e.target.value })} disabled={!owner}>
                {CHANNELS.map((c) => (
                  <option key={c.code} value={c.code}>{lang === 'ar' ? c.ar : c.fr}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('reminderHours')} htmlFor="s-reminder-hours">
              <Select id="s-reminder-hours" value={notif.reminder_hours_before} onChange={(e) => setNotif({ ...notif, reminder_hours_before: Number(e.target.value) })} disabled={!owner}>
                {[2, 4, 12, 24, 48, 72].map((h) => <option key={h} value={h}>{h}</option>)}
              </Select>
            </Field>
            <Field label={t('retentionDays')} htmlFor="s-retention" hint={t('retentionHint')}>
              <Select id="s-retention" value={notif.retention_days} onChange={(e) => setNotif({ ...notif, retention_days: Number(e.target.value) })} disabled={!owner}>
                {[90, 180, 365, 730, 1095].map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
            </Field>
          </div>
          <div className="mt-3 space-y-3">
            <Switch
              checked={!!notif.reminder_enabled}
              onChange={(v) => setNotif({ ...notif, reminder_enabled: v })}
              label={t('reminderEnabled')}
              disabled={!owner}
            />
          </div>
          {owner ? (
            <div className="mt-3 flex justify-end">
              <button type="button" className="btn-primary btn-sm" onClick={saveNotif} disabled={busy}>
                <IconCheck size={15} /> {busy ? t('saving') : t('save')}
              </button>
            </div>
          ) : null}

          <div className="mt-4">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">{t('notificationsBox')}</p>
            {notif.notifications.length === 0 ? (
              <EmptyState title={t('noNotifications')} />
            ) : (
              <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                {notif.notifications.map((n) => (
                  <li key={n.id} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ink-900">
                        {labelize(TEMPLATE_LABELS, n.template, lang)} ·{' '}
                        {CHANNELS.find((x) => x.code === n.channel)?.[lang === 'ar' ? 'ar' : 'fr'] || n.channel}
                        {n.public_ref ? <span className="tnum ms-1 text-ink-500" dir="ltr">({n.public_ref})</span> : null}
                      </span>
                      <span className={`chip ${n.status === 'sent' ? 'bg-emerald-100 text-emerald-900' : n.status === 'simulated' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-ink-700'}`}>
                        {n.status === 'simulated' ? t('notifSimulated') : n.status === 'sent' ? t('notifSent') : n.status === 'failed' ? t('notifFailed') : n.status}
                      </span>
                    </div>
                    <p className="text-ink-500" dir="ltr">{n.recipient} · {formatDateTime(n.created_at)}</p>
                    {n.detail ? <p className="text-[11px] text-ink-500">{n.detail}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      ) : null}

      {/* Équipe */}
      {owner ? (
        <Card className="p-4">
          <SectionTitle hint={t('demoAccountsHint')}>
            <span className="inline-flex items-center gap-2"><IconUsers size={16} /> {t('teamTitle')}</span>
          </SectionTitle>
          {teamError ? <div className="mb-2"><Alert tone="error">{teamError}</Alert></div> : null}
          <ul className="divide-y divide-slate-100">
            {team.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">{m.full_name}</p>
                  <p className="truncate text-xs text-ink-500" dir="ltr">{m.email}</p>
                  <p className="text-[11px] text-ink-500">
                    {m.role === 'owner' ? t('owner') : t('secretary')} · {m.is_active ? t('active') : t('inactive')}
                    {m.last_login_at ? ` · ${formatDateTime(m.last_login_at)}` : ''}
                  </p>
                </div>
                {m.id !== user?.id ? (
                  <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => toggleMember(m)}>
                    {m.is_active ? t('deactivate') : t('reactivate')}
                  </button>
                ) : (
                  <span className="chip bg-brand-50 text-brand-800">{t('youLabel')}</span>
                )}
              </li>
            ))}
          </ul>

          <Form onSubmit={addMember} className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
            <Field label={t('memberName')} htmlFor="t-name" required>
              <TextInput id="t-name" value={newName} onChange={(e) => setNewName(e.target.value)} required maxLength={60} />
            </Field>
            <Field label={t('memberEmail')} htmlFor="t-email" required>
              <TextInput id="t-email" type="email" dir="ltr" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
            </Field>
            <Field label={t('tempPassword')} htmlFor="t-pass" required hint="10 caractères minimum">
              <TextInput id="t-pass" type="text" dir="ltr" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={10} />
            </Field>
            <Field label={t('role')} htmlFor="t-role">
              <Select id="t-role" value={newRole} onChange={(e) => setNewRole(e.target.value as any)}>
                <option value="secretary">{t('roleSecretary')}</option>
                <option value="owner">{t('roleOwner')}</option>
              </Select>
            </Field>
            <div className="sm:col-span-2 flex justify-end">
              <SubmitButton className="btn-primary btn-sm" disabled={busy} onClick={addMember}>{t('addMember')}</SubmitButton>
            </div>
          </Form>
        </Card>
      ) : null}

      {/* Journal d'audit */}
      <Card className="p-4">
        <SectionTitle hint={t('auditHint')}>{t('auditTitle')}</SectionTitle>
        {audit.length === 0 ? (
          <EmptyState title={t('noData')} />
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto text-xs">
            {audit.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 py-1">
                <span className="font-medium text-ink-900">{labelize(ACTION_LABELS, e.action, lang)}</span>
                <span className="text-ink-500">{e.actor_label}</span>
                <span className="text-ink-500">{formatDateTime(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Demandes de données */}
      {owner ? (
        <Card className="p-4">
          <SectionTitle hint={`${t('retentionDays')} : ${notif?.retention_days ?? '—'}`}>{t('dataRequestsTitle')}</SectionTitle>
          {dataRequests.length === 0 ? (
            <EmptyState title={t('noDataRequests')} />
          ) : (
            <ul className="space-y-1 text-xs">
              {dataRequests.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-1.5">
                  <span className="font-medium text-ink-900">{d.kind === 'export' ? t('exportData') : t('deleteData')}</span>
                  <span className="chip bg-slate-100 text-ink-700">{d.status === 'done' ? t('done') : t('pending')}</span>
                  <span className="text-ink-500">{formatDateTime(d.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  );
}
