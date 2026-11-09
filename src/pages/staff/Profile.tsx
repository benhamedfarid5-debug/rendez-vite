import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Alert, Card, Checkbox, CopyButton, ErrorState, Field, SectionTitle, Select, SkeletonRows, Switch, TextInput } from '../../components/ui';
import { IconCheck, IconDownload, IconPin, IconQr, IconShare } from '../../components/icons';
import { Form, SubmitButton } from '../../components/form';

type Profile = {
  name_fr: string;
  name_ar: string | null;
  specialty_fr: string;
  specialty_ar: string | null;
  address_fr: string | null;
  address_ar: string | null;
  city_fr: string | null;
  city_ar: string | null;
  wilaya_code: number | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  languages: string[];
  slot_duration_min: number;
  min_lead_hours: number;
  horizon_days: number;
  auto_confirm: number;
  is_listed: number;
  slug: string;
  public_url: string;
};

export function ProfilePage() {
  const { t, lang, apiError } = useI18n();
  const { permissions } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [wilayas, setWilayas] = useState<{ code: number; fr: string; ar: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const readOnly = !permissions?.manageProfile;

  const load = () => {
    setLoading(true);
    Promise.all([
      api<{ profile: Profile }>('/api/staff/profile'),
      api<{ wilayas: any[] }>('/api/public/wilayas'),
    ])
      .then(([p, w]) => {
        setProfile({ ...p.profile, languages: p.profile.languages || ['fr'] });
        setWilayas(w.wilayas);
      })
      .catch((err: ApiError) => setError(apiError(err.code)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const update = (patch: Partial<Profile>) => setProfile((p) => (p ? { ...p, ...patch } : p));
  const [gpsError, setGpsError] = useState<string | null>(null);
  const useGps = () => {
    setGpsError(null);
    if (!navigator.geolocation) return setGpsError(t('locationDenied'));
    navigator.geolocation.getCurrentPosition(
      (pos) => update({ latitude: Math.round(pos.coords.latitude * 1e6) / 1e6, longitude: Math.round(pos.coords.longitude * 1e6) / 1e6 }),
      () => setGpsError(t('locationDenied')),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  const num = (v: string) => (v.trim() === '' || Number.isNaN(Number(v.replace(',', '.'))) ? null : Number(v.replace(',', '.')));
  // Texte brut des champs GPS (permet de taper « 36. » sans être corrigé).
  const [latStr, setLatStr] = useState('');
  const [lngStr, setLngStr] = useState('');
  useEffect(() => {
    if (!profile) return;
    if (num(latStr) !== (profile.latitude ?? null)) setLatStr(profile.latitude == null ? '' : String(profile.latitude));
    if (num(lngStr) !== (profile.longitude ?? null)) setLngStr(profile.longitude == null ? '' : String(profile.longitude));
  }, [profile?.latitude, profile?.longitude]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    setFieldErrors({});
    try {
      await api('/api/staff/profile', {
        method: 'PUT',
        body: {
          name_fr: profile.name_fr,
          name_ar: profile.name_ar || '',
          specialty_fr: profile.specialty_fr,
          specialty_ar: profile.specialty_ar || '',
          address_fr: profile.address_fr || '',
          address_ar: profile.address_ar || '',
          city_fr: profile.city_fr || '',
          city_ar: profile.city_ar || '',
          wilaya_code: profile.wilaya_code,
          latitude: profile.latitude ?? null,
          longitude: profile.longitude ?? null,
          phone: profile.phone || '',
          languages: profile.languages,
          slot_duration_min: Number(profile.slot_duration_min),
          min_lead_hours: Number(profile.min_lead_hours),
          horizon_days: Number(profile.horizon_days),
          auto_confirm: !!profile.auto_confirm,
          is_listed: !!profile.is_listed,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      const e2 = err as ApiError;
      setError(apiError(e2.code, e2.message));
      if (e2.fields) setFieldErrors(e2.fields);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <SkeletonRows rows={6} />;
  if (!profile) return <ErrorState message={error || t('errorLoad')} onRetry={load} />;

  const publicUrl = `${window.location.origin}${profile.public_url}`;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-ink-900">{t('profileTitle')}</h1>
        <p className="text-xs text-ink-500">{t('profileHint')}</p>
      </header>

      {readOnly ? <Alert tone="info">{t('onlyOwner')}</Alert> : null}
      {saved ? <Alert tone="success">{t('profileSaved')}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Card className="p-4">
        <SectionTitle>{t('shareProfile')}</SectionTitle>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex-1 space-y-2">
            <p className="text-xs font-medium text-ink-500">{t('publicUrl')}</p>
            <p className="break-all rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-ink-900 ring-1 ring-slate-200" dir="ltr">{publicUrl}</p>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={publicUrl} label={t('shareProfile')} />
              <a href={publicUrl} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
                <IconShare size={15} /> {t('previewAsPatient')}
              </a>
              <a href={`/api/public/practices/${profile.slug}/qr.png`} download={`qr-${profile.slug}.png`} className="btn-secondary btn-sm">
                <IconDownload size={15} /> {t('downloadQr')}
              </a>
            </div>
            <p className="text-[11px] text-ink-500">{t('qrHint')}</p>
          </div>
          <div className="shrink-0 text-center">
            <img
              src={`/api/public/practices/${profile.slug}/qr.png`}
              alt={t('qrCode')}
              className="mx-auto h-36 w-36 rounded-xl ring-1 ring-slate-200"
              width={144}
              height={144}
            />
            <p className="mt-1 text-[11px] text-ink-500">
              <IconQr size={12} className="me-0.5 inline" /> {t('qrCode')}
            </p>
          </div>
        </div>
      </Card>

      <Form onSubmit={submit} className="space-y-4">
        <Card className="p-4">
          <SectionTitle hint={t('profileHint')}>{t('doctor')}</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('nameFr')} htmlFor="p-name-fr" required error={fieldErrors.name_fr}>
              <TextInput id="p-name-fr" value={profile.name_fr} onChange={(e) => update({ name_fr: e.target.value })} disabled={readOnly} required maxLength={80} />
            </Field>
            <Field label={t('nameAr')} htmlFor="p-name-ar">
              <TextInput id="p-name-ar" value={profile.name_ar || ''} onChange={(e) => update({ name_ar: e.target.value })} disabled={readOnly} dir="rtl" maxLength={80} />
            </Field>
            <Field label={t('specialtyFr')} htmlFor="p-spec-fr" required>
              <TextInput id="p-spec-fr" value={profile.specialty_fr} onChange={(e) => update({ specialty_fr: e.target.value })} disabled={readOnly} required maxLength={80} />
            </Field>
            <Field label={t('specialtyAr')} htmlFor="p-spec-ar">
              <TextInput id="p-spec-ar" value={profile.specialty_ar || ''} onChange={(e) => update({ specialty_ar: e.target.value })} disabled={readOnly} dir="rtl" maxLength={80} />
            </Field>
            <Field label={t('addressFr')} htmlFor="p-addr-fr">
              <TextInput id="p-addr-fr" value={profile.address_fr || ''} onChange={(e) => update({ address_fr: e.target.value })} disabled={readOnly} maxLength={160} />
            </Field>
            <Field label={t('addressAr')} htmlFor="p-addr-ar">
              <TextInput id="p-addr-ar" value={profile.address_ar || ''} onChange={(e) => update({ address_ar: e.target.value })} disabled={readOnly} dir="rtl" maxLength={160} />
            </Field>
            <Field label={t('cityFr')} htmlFor="p-city-fr">
              <TextInput id="p-city-fr" value={profile.city_fr || ''} onChange={(e) => update({ city_fr: e.target.value })} disabled={readOnly} maxLength={80} />
            </Field>
            <Field label={t('cityAr')} htmlFor="p-city-ar">
              <TextInput id="p-city-ar" value={profile.city_ar || ''} onChange={(e) => update({ city_ar: e.target.value })} disabled={readOnly} dir="rtl" maxLength={80} />
            </Field>
            <Field label={t('wilaya')} htmlFor="p-wilaya">
              <Select
                id="p-wilaya"
                value={profile.wilaya_code ?? ''}
                onChange={(e) => update({ wilaya_code: e.target.value ? Number(e.target.value) : null })}
                disabled={readOnly}
              >
                <option value="">—</option>
                {wilayas.map((w) => (
                  <option key={w.code} value={w.code}>
                    {String(w.code).padStart(2, '0')} — {lang === 'ar' ? w.ar : w.fr}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('practicePhone')} htmlFor="p-phone" hint="+213 5xx xx xx xx">
              <TextInput id="p-phone" value={profile.phone || ''} onChange={(e) => update({ phone: e.target.value })} disabled={readOnly} dir="ltr" maxLength={30} />
            </Field>
          </div>
          <div className="mt-4 rounded-xl border border-slate-200 p-3">
            <p className="text-sm font-semibold text-ink-900">{t('gpsTitle')}</p>
            <p className="mb-2 text-xs text-ink-500">{t('gpsHint')}</p>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <Field label={t('latitude')} htmlFor="p-lat" error={fieldErrors.latitude}>
                <TextInput id="p-lat" inputMode="decimal" dir="ltr" value={latStr} onChange={(e) => { setLatStr(e.target.value); update({ latitude: num(e.target.value) }); }} disabled={readOnly} placeholder="36.7509" />
              </Field>
              <Field label={t('longitude')} htmlFor="p-lng" error={fieldErrors.longitude}>
                <TextInput id="p-lng" inputMode="decimal" dir="ltr" value={lngStr} onChange={(e) => { setLngStr(e.target.value); update({ longitude: num(e.target.value) }); }} disabled={readOnly} placeholder="5.0567" />
              </Field>
              <div className="flex items-end">
                <button type="button" className="btn-secondary w-full" onClick={useGps} disabled={readOnly}>
                  <IconPin size={16} /> {t('useMyPosition')}
                </button>
              </div>
            </div>
            {gpsError ? <p className="mt-2 text-xs text-red-700">{gpsError}</p> : null}
          </div>
          <div className="mt-3">
            <p className="label">{t('languages')}</p>
            <div className="flex gap-4">
              <Checkbox
                label="Français"
                checked={profile.languages.includes('fr')}
                disabled={readOnly}
                onChange={(e) => {
                  const next = e.target.checked ? [...new Set([...profile.languages, 'fr'])] : profile.languages.filter((l) => l !== 'fr');
                  update({ languages: next.length ? next : ['ar'] });
                }}
              />
              <Checkbox
                label="العربية"
                checked={profile.languages.includes('ar')}
                disabled={readOnly}
                onChange={(e) => {
                  const next = e.target.checked ? [...new Set([...profile.languages, 'ar'])] : profile.languages.filter((l) => l !== 'ar');
                  update({ languages: next.length ? next : ['fr'] });
                }}
              />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle hint={t('autoConfirmHint')}>{t('settingsTitle')}</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={`${t('slotDuration')} (${t('minutes')})`} htmlFor="p-duration">
              <Select id="p-duration" value={profile.slot_duration_min} onChange={(e) => update({ slot_duration_min: Number(e.target.value) })} disabled={readOnly}>
                {[15, 20, 30, 45, 60].map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
            </Field>
            <Field label={t('minLead')} htmlFor="p-lead">
              <Select id="p-lead" value={profile.min_lead_hours} onChange={(e) => update({ min_lead_hours: Number(e.target.value) })} disabled={readOnly}>
                {[0, 1, 2, 4, 8, 12, 24, 48].map((h) => <option key={h} value={h}>{h}</option>)}
              </Select>
            </Field>
            <Field label={t('horizon')} htmlFor="p-horizon">
              <Select id="p-horizon" value={profile.horizon_days} onChange={(e) => update({ horizon_days: Number(e.target.value) })} disabled={readOnly}>
                {[7, 14, 30, 45, 60, 90, 180].map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
            </Field>
          </div>
          <div className="mt-3 space-y-3">
            <Switch
              checked={!!profile.auto_confirm}
              onChange={(v) => update({ auto_confirm: v ? 1 : 0 })}
              disabled={readOnly}
              label={t('autoConfirm')}
              description={t('autoConfirmHint')}
            />
            <Switch
              checked={!!profile.is_listed}
              onChange={(v) => update({ is_listed: v ? 1 : 0 })}
              disabled={readOnly}
              label={t('listed')}
            />
          </div>
        </Card>

        {!readOnly ? (
          <div className="flex justify-end gap-2">
            <Link to="/staff" className="btn-secondary">{t('cancel')}</Link>
            <SubmitButton className="btn-primary" disabled={busy} onClick={submit}>
              <IconCheck size={16} /> {busy ? t('saving') : t('save')}
            </SubmitButton>
          </div>
        ) : null}
      </Form>
    </div>
  );
}
