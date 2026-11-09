import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Alert, Card, CopyButton, Field, SectionTitle, Select, SkeletonRows, TextInput } from '../components/ui';
import { LogoMark } from '../components/LogoMark';
import { DemoBanner } from '../components/PatientLayout';

/** Espace administrateur (Farid) : codes d'activation et suivi des cabinets. En français. */

type Sub = { state: string; until: string | null; days_left: number | null; plan: string | null };
type Overview = {
  practices: { id: string; name: string; city: string | null; phone: string | null; owner_name: string; owner_email: string; created_at: string; subscription: Sub }[];
  revenue_da: number;
};
type Invoice = { id: string; number: string; issued_at: string; plan: string; method: string; amount_da: number; buyer_name: string | null; buyer_practice: string | null; buyer_email: string | null; email_status: string | null };
type Code = { code: string; plan: string; note: string | null; created_at: string; used_at: string | null; practice_name: string | null };

const PLAN_LABEL: Record<string, string> = { trial: 'Essai gratuit', month: '1 mois — 2 000 DA', semester: '6 mois — 6 000 DA', year: '1 an — 10 000 DA' };
const STATE: Record<string, { label: string; cls: string }> = {
  trial: { label: 'Essai', cls: 'bg-amber-50 text-amber-900' },
  active: { label: 'Actif', cls: 'bg-emerald-50 text-emerald-800' },
  expired: { label: 'Terminé', cls: 'bg-red-50 text-red-800' },
  unlimited: { label: 'Sans limite', cls: 'bg-slate-100 text-ink-700' },
};
const fmt = (iso: string | null) => (iso ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) : '—');
const da = (n: number) => `${new Intl.NumberFormat('fr-FR').format(n)} DA`;

export function Admin() {
  const [me, setMe] = useState<{ admin: boolean; demo: string | null } | null>(null);
  const check = useCallback(() => api<{ admin: boolean; demo: string | null }>('/api/admin/me').then(setMe).catch(() => setMe({ admin: false, demo: null })), []);
  useEffect(() => {
    void check();
  }, [check]);

  return (
    <div className="min-h-dvh bg-sand-50" lang="fr" dir="ltr">
      <DemoBanner />
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        <div className="flex items-center gap-2">
          <LogoMark size={36} />
          <div>
            <p className="text-lg font-bold text-ink-900">Rendez-Vite — Administration</p>
            <p className="text-xs text-ink-500">Réservé au propriétaire de l’application</p>
          </div>
        </div>
        {!me ? <SkeletonRows rows={3} /> : me.admin ? <Dashboard onLogout={check} /> : <AdminLogin demo={me.demo} onDone={check} />}
      </div>
    </div>
  );
}

function AdminLogin({ demo, onDone }: { demo: string | null; onDone: () => void }) {
  const [email, setEmail] = useState(demo || '');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      await api('/api/admin/login', { method: 'POST', body: { email, password } });
      onDone();
    } catch (e2) {
      setErr((e2 as ApiError).message);
    }
  };
  return (
    <Card className="mx-auto max-w-sm p-5">
      <form onSubmit={submit} className="space-y-3">
        <h1 className="text-base font-semibold">Connexion administrateur</h1>
        {err ? <Alert tone="error">{err}</Alert> : null}
        <Field label="E-mail" htmlFor="a-email">
          <TextInput id="a-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </Field>
        <Field label="Mot de passe" htmlFor="a-pass">
          <TextInput id="a-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        <button type="submit" className="btn-primary w-full">Se connecter</button>
        {demo ? <p className="text-xs text-ink-500">Démonstration : {demo} · mot de passe Admin2026!rv</p> : null}
      </form>
    </Card>
  );
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [codes, setCodes] = useState<Code[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [plan, setPlan] = useState('year');
  const [note, setNote] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, c, i] = await Promise.all([
        api<Overview>('/api/admin/overview'),
        api<{ codes: Code[] }>('/api/admin/codes'),
        api<{ invoices: Invoice[] }>('/api/admin/invoices'),
      ]);
      setData(o);
      setCodes(c.codes);
      setInvoices(i.invoices);
    } catch (e) {
      setErr((e as ApiError).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setErr(null);
    try {
      const r = await api<{ code: string }>('/api/admin/codes', { method: 'POST', body: { plan, note } });
      setFresh(r.code);
      setNote('');
      await load();
    } catch (e) {
      setErr((e as ApiError).message);
    }
  };
  const logout = async () => {
    await api('/api/admin/logout', { method: 'POST', body: {} }).catch(() => {});
    onLogout();
  };

  if (!data) return err ? <Alert tone="error">{err}</Alert> : <SkeletonRows rows={4} />;
  const count = (s: string) => data.practices.filter((p) => p.subscription.state === s).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['Cabinets inscrits', String(data.practices.length)],
          ['En essai', String(count('trial'))],
          ['Abonnés actifs', String(count('active'))],
          ['Encaissé', da(data.revenue_da)],
        ].map(([k, v]) => (
          <Card key={k} className="p-4">
            <p className="text-xs text-ink-500">{k}</p>
            <p className="mt-1 text-2xl font-bold text-ink-900">{v}</p>
          </Card>
        ))}
      </div>

      <section>
        <SectionTitle hint="Après avoir reçu le paiement par téléphone, créez un code et donnez-le au médecin. Il le saisit dans « Abonnement › Autre moyen de paiement ». Un code ne sert qu’une fois.">
          Créer un code d’activation
        </SectionTitle>
        <Card className="space-y-3 p-4">
          {err ? <Alert tone="error">{err}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Formule payée" htmlFor="c-plan">
              <Select id="c-plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
                <option value="month">{PLAN_LABEL.month}</option>
                <option value="semester">{PLAN_LABEL.semester}</option>
                <option value="year">{PLAN_LABEL.year}</option>
              </Select>
            </Field>
            <Field label="Note (nom du médecin)" htmlFor="c-note">
              <TextInput id="c-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="Dr …" />
            </Field>
            <button type="button" className="btn-primary" onClick={create}>Créer le code</button>
          </div>
          {fresh ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-50 p-4">
              <p className="font-mono text-2xl font-bold tracking-wider text-brand-900" dir="ltr">{fresh}</p>
              <CopyButton value={fresh} label="Copier le code" />
            </div>
          ) : null}
        </Card>
      </section>

      <section>
        <SectionTitle>Codes créés</SectionTitle>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-ink-500">
              <tr><th className="px-3 py-2">Code</th><th className="px-3 py-2">Formule</th><th className="px-3 py-2">Note</th><th className="px-3 py-2">Créé</th><th className="px-3 py-2">Utilisé par</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {codes.length ? (
                codes.map((c) => (
                  <tr key={c.code}>
                    <td className="px-3 py-2 font-mono" dir="ltr">{c.code}</td>
                    <td className="px-3 py-2">{PLAN_LABEL[c.plan]}</td>
                    <td className="px-3 py-2">{c.note || '—'}</td>
                    <td className="px-3 py-2">{fmt(c.created_at)}</td>
                    <td className="px-3 py-2">{c.used_at ? `${c.practice_name || '—'} · ${fmt(c.used_at)}` : <span className="text-amber-800">Pas encore utilisé</span>}</td>
                  </tr>
                ))
              ) : (
                <tr><td className="px-3 py-4 text-ink-500" colSpan={5}>Aucun code pour l’instant.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </section>

      <section>
        <SectionTitle hint="Chaque facture est envoyée automatiquement par e-mail au médecin après son paiement.">Factures</SectionTitle>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-ink-500">
              <tr><th className="px-3 py-2">N°</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Client</th><th className="px-3 py-2">Formule</th><th className="px-3 py-2">Montant</th><th className="px-3 py-2">E-mail</th><th className="px-3 py-2">PDF</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.length ? (
                invoices.map((f) => (
                  <tr key={f.id}>
                    <td className="px-3 py-2 font-mono" dir="ltr">{f.number}</td>
                    <td className="px-3 py-2">{fmt(f.issued_at)}</td>
                    <td className="px-3 py-2">{f.buyer_practice}<span className="block text-xs text-ink-500">{f.buyer_name}</span></td>
                    <td className="px-3 py-2">{PLAN_LABEL[f.plan]}</td>
                    <td className="px-3 py-2">{da(f.amount_da)}</td>
                    <td className="px-3 py-2 text-xs">{f.email_status === 'sent' ? 'Envoyée' : f.email_status === 'simulated' ? 'Simulée (e-mail non configuré)' : f.email_status === 'failed' ? 'Échec' : '—'}</td>
                    <td className="px-3 py-2"><a className="text-brand-700 underline" href={`/api/admin/invoices/${f.id}.pdf`}>Télécharger</a></td>
                  </tr>
                ))
              ) : (
                <tr><td className="px-3 py-4 text-ink-500" colSpan={7}>Aucune facture pour l’instant.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </section>

      <section>
        <SectionTitle>Cabinets</SectionTitle>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-ink-500">
              <tr><th className="px-3 py-2">Cabinet</th><th className="px-3 py-2">Médecin</th><th className="px-3 py-2">Contact</th><th className="px-3 py-2">Abonnement</th><th className="px-3 py-2">Fin</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.practices.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2">{p.name}{p.city ? <span className="block text-xs text-ink-500">{p.city}</span> : null}</td>
                  <td className="px-3 py-2">{p.owner_name}</td>
                  <td className="px-3 py-2" dir="ltr">{p.owner_email}{p.phone ? <span className="block text-xs text-ink-500">{p.phone}</span> : null}</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATE[p.subscription.state]?.cls}`}>{STATE[p.subscription.state]?.label}</span>{p.subscription.plan && p.subscription.plan !== 'trial' ? <span className="block text-xs text-ink-500">{PLAN_LABEL[p.subscription.plan]}</span> : null}</td>
                  <td className="px-3 py-2">{fmt(p.subscription.until)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <button type="button" className="btn-secondary btn-sm" onClick={logout}>Se déconnecter</button>
    </div>
  );
}
