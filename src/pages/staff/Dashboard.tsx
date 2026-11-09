import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { api, ApiError, type Appointment, type CalendarBlock } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Alert, Card, EmptyState, ErrorState, SkeletonRows, StatusBadge, SectionTitle } from '../../components/ui';
import { AppointmentCard, AppointmentModal } from '../../components/AppointmentBits';
import { IconAlert, IconBell, IconCalendar, IconCheck, IconClock, IconRefresh, IconUsers } from '../../components/icons';
import { EXCEPTION_KINDS } from '../../../shared/constants';

type Overview = {
  date: string;
  appointments: Appointment[];
  pending: Appointment[];
  upcoming: Appointment[];
  cancelled: Appointment[];
  blocks: CalendarBlock[];
  stats: {
    total: number;
    confirmed: number;
    arrived: number;
    completed: number;
    cancelled: number;
    no_show: number;
    occupancy: number;
    freeSlots: number;
    pendingCount: number;
  };
};

type Stats = { days: { date: string; total: number; confirmed: number; cancelled: number; occupancy: number }[]; totals: any };

export function Dashboard() {
  const { t, lang, formatDate, apiError } = useI18n();
  const { user } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Appointment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, st] = await Promise.all([
        api<Overview>('/api/staff/overview'),
        api<Stats>('/api/staff/stats?days=7'),
      ]);
      setData(ov);
      setStats(st);
    } catch (err) {
      setError(apiError((err as ApiError).code));
    } finally {
      setLoading(false);
    }
  }, [apiError]);

  useEffect(() => {
    load();
  }, [load]);

  const quickStatus = async (a: Appointment, status: string) => {
    try {
      await api(`/api/staff/appointments/${a.id}`, { method: 'PATCH', body: { status } });
      load();
    } catch (err) {
      setError(apiError((err as ApiError).code));
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-ink-900">{t('dashboardTitle')}</h1>
          <p className="text-xs text-ink-500">
            {t('goodDay')}, {user?.full_name} · {formatDate(data?.date || new Date().toISOString().slice(0, 10))}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={load}>
            <IconRefresh size={15} /> {t('refresh')}
          </button>
          <Link to="/staff/agenda" className="btn-primary btn-sm">
            <IconCalendar size={15} /> {t('navAgenda')}
          </Link>
        </div>
      </header>

      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {loading ? <SkeletonRows rows={5} /> : null}

      {!loading && data ? (
        <>
          {/* Indicateurs */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label={t('todayAppointments')} value={data.stats.total} icon={<IconUsers size={16} />} />
            <StatCard label={t('statusConfirmed')} value={data.stats.confirmed} icon={<IconCheck size={16} />} />
            <StatCard label={t('pendingRequests')} value={data.stats.pendingCount} tone="amber" icon={<IconBell size={16} />} />
            <StatCard label={t('freeSlotsToday')} value={data.stats.freeSlots} tone="green" icon={<IconClock size={16} />} />
            <StatCard label={t('cancelledToday')} value={data.stats.cancelled} tone="red" icon={<IconAlert size={16} />} />
            <div className="card p-3">
              <p className="text-[11px] font-medium text-ink-500">{t('occupancyRate')}</p>
              <p className="tnum text-xl font-bold text-ink-900">{data.stats.occupancy}%</p>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200" role="img" aria-label={`${t('occupancyRate')} ${data.stats.occupancy}%`}>
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${data.stats.occupancy}%` }} />
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Demandes à confirmer */}
            <Card className="p-4">
              <SectionTitle
                hint={data.pending.length ? undefined : t('noPending')}
                action={data.pending.length ? <Link to="/staff/rendez-vous?status=requested" className="btn-ghost btn-sm">{t('open')}</Link> : null}
              >
                {t('pendingRequests')} {data.pending.length ? <span className="chip bg-amber-100 text-amber-900">{data.pending.length}</span> : null}
              </SectionTitle>
              {data.pending.length === 0 ? (
                <EmptyState title={t('noPending')} />
              ) : (
                <ul className="space-y-2">
                  {data.pending.slice(0, 4).map((a) => (
                    <li key={a.id} className="rounded-xl border border-slate-200 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <button type="button" className="min-w-0 text-start" onClick={() => setSelected(a)}>
                          <p className="truncate text-sm font-semibold text-ink-900">{a.patient_first_name} {a.patient_last_name}</p>
                          <p className="tnum text-xs text-ink-500" dir="ltr">
                            {formatDate(a.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {a.start}
                          </p>
                        </button>
                        <StatusBadge status={a.status} />
                      </div>
                      <div className="mt-2 flex gap-1.5">
                        <button type="button" className="btn-primary btn-sm flex-1" onClick={() => quickStatus(a, 'confirmed')}>
                          <IconCheck size={14} /> {t('confirmRequest')}
                        </button>
                        <button type="button" className="btn-secondary btn-sm" onClick={() => setSelected(a)}>
                          {t('details')}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Rendez-vous du jour */}
            <Card className="p-4">
              <SectionTitle
                hint={data.appointments.length ? undefined : t('noAppointmentsToday')}
                action={<Link to={`/staff/agenda?date=${data.date}`} className="btn-ghost btn-sm">{t('viewDay')}</Link>}
              >
                {t('todayAppointments')}
              </SectionTitle>
              {data.appointments.length === 0 ? (
                <EmptyState title={t('noAppointmentsToday')} description={t('clickSlotToBook')} />
              ) : (
                <ul className="space-y-1.5">
                  {data.appointments.map((a) => (
                    <li key={a.id}>
                      <AppointmentCard appointment={a} onOpen={setSelected} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Prochaines visites */}
            <Card className="p-4">
              <SectionTitle hint={data.upcoming.length ? undefined : t('noUpcoming')}>{t('upcomingVisits')}</SectionTitle>
              {data.upcoming.length === 0 ? (
                <EmptyState title={t('noUpcoming')} />
              ) : (
                <ul className="space-y-1.5">
                  {data.upcoming.map((a) => (
                    <li key={a.id}>
                      <AppointmentCard appointment={a} onOpen={setSelected} showDate />
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Annulations + blocages + stats */}
            <div className="space-y-4">
              <Card className="p-4">
                <SectionTitle hint={data.cancelled.length ? undefined : t('noCancelled')}>{t('cancelledToday')}</SectionTitle>
                {data.cancelled.length === 0 ? (
                  <EmptyState title={t('noCancelled')} />
                ) : (
                  <ul className="space-y-1.5">
                    {data.cancelled.map((a) => (
                      <li key={a.id}>
                        <AppointmentCard appointment={a} onOpen={setSelected} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {data.blocks.length ? (
                <Card className="p-4">
                  <SectionTitle>{t('upcomingBlocks')}</SectionTitle>
                  <ul className="space-y-1.5">
                    {data.blocks.map((b) => (
                      <li key={b.id} className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
                        <p className="font-semibold">
                          {EXCEPTION_KINDS.find((k) => k.code === b.kind)?.[lang === 'ar' ? 'ar' : 'fr']}
                        </p>
                        <p className="tnum" dir="ltr">
                          {b.time_start} – {b.time_end}
                        </p>
                        {b.note ? <p className="opacity-80">{b.note}</p> : null}
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}

              <Card className="p-4">
                <SectionTitle hint={t('statsNote')}>{t('statsWeek')}</SectionTitle>
                {stats ? <MiniChart days={stats.days} t={t} /> : <SkeletonRows rows={1} />}
                <p className="mt-2 text-[11px] text-ink-500">
                  {stats?.totals.appointments ?? 0} {t('appointmentsCount')} · {stats?.totals.cancelled ?? 0} {t('statusCancelled')} · {stats?.totals.occupancy ?? 0}% {t('occupancyRate')}
                </p>
              </Card>
            </div>
          </div>
        </>
      ) : null}

      <AppointmentModal appointment={selected} onClose={() => setSelected(null)} onChanged={load} />
    </div>
  );
}

function StatCard({ label, value, icon, tone = 'default' }: { label: string; value: number; icon: React.ReactNode; tone?: 'default' | 'amber' | 'green' | 'red' }) {
  const toneCls =
    tone === 'amber' ? 'text-amber-700 bg-amber-50' : tone === 'green' ? 'text-emerald-700 bg-emerald-50' : tone === 'red' ? 'text-red-700 bg-red-50' : 'text-brand-700 bg-brand-50';
  return (
    <div className="card p-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium text-ink-500">{label}</p>
        <span className={`flex h-6 w-6 items-center justify-center rounded-md ${toneCls}`}>{icon}</span>
      </div>
      <p className="tnum mt-0.5 text-xl font-bold text-ink-900">{value}</p>
    </div>
  );
}

/** Histogramme simple (aucune bibliothèque graphique). */
function MiniChart({ days, t }: { days: Stats['days']; t: (k: any) => string }) {
  const max = Math.max(1, ...days.map((d) => d.total));
  return (
    <div className="flex items-end gap-1.5" role="img" aria-label={t('statsWeek')}>
      {days.map((d) => (
        <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.date} : ${d.total}`}>
          <span className="tnum text-[10px] text-ink-500">{d.total}</span>
          <div className="flex h-16 w-full items-end rounded bg-slate-100">
            <div className="w-full rounded bg-brand-500" style={{ height: `${Math.round((d.total / max) * 100)}%` }} />
          </div>
          <span className="text-[10px] text-ink-500">{d.date.slice(8, 10)}</span>
        </div>
      ))}
    </div>
  );
}
