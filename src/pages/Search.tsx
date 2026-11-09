import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { api, ApiError, type Practice } from '../lib/api';
import { Card, EmptyState, ErrorState, Field, Select, SkeletonRows, TextInput } from '../components/ui';
import { IconCalendar, IconChevronRight, IconClock, IconPhone, IconPin, IconSearch } from '../components/icons';
import { Form, SubmitButton } from '../components/form';
import { BEJAIA_CENTER, NearbyMap } from '../components/NearbyMap';

type Wilaya = { code: number; fr: string; ar: string };

export function Search() {
  const { t, lang, bil, formatDate, apiError } = useI18n();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [wilaya, setWilaya] = useState(params.get('wilaya') || '');
  const [wilayas, setWilayas] = useState<Wilaya[]>([]);
  const [results, setResults] = useState<Practice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const near = params.get('near') === '1';
  // Position du patient (null = en cours / pas encore demandée).
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);
  const [geoReady, setGeoReady] = useState(!near);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!near) {
      setGeoReady(true);
      return;
    }
    setGeoReady(false);
    setGeoDenied(false);
    const fallback = () => {
      setGeoDenied(true);
      setUserPos(null);
      setGeoReady(true);
    };
    if (!navigator.geolocation) return fallback();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos([pos.coords.latitude, pos.coords.longitude]);
        setGeoReady(true);
      },
      fallback,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, [near]);

  const query = useMemo(() => {
    const qp = new URLSearchParams(params);
    qp.delete('near');
    if (near) {
      const [la, lo] = userPos || BEJAIA_CENTER;
      qp.set('lat', String(la));
      qp.set('lng', String(lo));
    }
    return qp.toString();
  }, [params, near, userPos]);

  useEffect(() => {
    api<{ wilayas: Wilaya[] }>('/api/public/wilayas').then((d) => setWilayas(d.wilayas)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!geoReady) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<{ results: Practice[] }>(`/api/public/practices?${query}`)
      .then((d) => {
        if (!cancelled) setResults(d.results);
      })
      .catch((err: ApiError) => {
        if (!cancelled) setError(apiError(err.code));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query, t, geoReady]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams();
    if (q.trim()) next.set('q', q.trim());
    if (wilaya) next.set('wilaya', wilaya);
    if (near) next.set('near', '1');
    setParams(next);
  };

  return (
    <div className={`space-y-4 ${near ? '' : 'mx-auto max-w-3xl'}`}>
      <div>
        <h1 className="text-xl font-bold text-ink-900">{near ? t('nearMeTitle') : t('searchResults')}</h1>
        <p className="text-xs text-ink-500">{near ? t('nearMeHint') : t('searchTitle')}</p>
      </div>

      {!near ? (
        <button type="button" className="btn-secondary btn-sm" onClick={() => setParams(new URLSearchParams({ near: '1' }))}>
          <IconPin size={15} /> {t('nearMe')}
        </button>
      ) : null}

      {near && !geoReady ? <p className="text-sm text-ink-700">{t('locating')}</p> : null}
      {near && geoReady && geoDenied ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{t('locationDenied')}</p> : null}

      <Card className="p-3">
        <Form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1.4fr_1fr_auto]">
          <Field label={t('searchTitle')} htmlFor="search-q">
            <TextInput id="search-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPlaceholder')} maxLength={60} />
          </Field>
          <Field label={t('searchByCity')} htmlFor="search-wilaya">
            <Select id="search-wilaya" value={wilaya} onChange={(e) => setWilaya(e.target.value)}>
              <option value="">{t('allWilayas')}</option>
              {wilayas.map((w) => (
                <option key={w.code} value={w.code}>
                  {String(w.code).padStart(2, '0')} — {lang === 'ar' ? w.ar : w.fr}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <SubmitButton className="btn-primary w-full sm:w-auto" onClick={submit}>
              <IconSearch size={17} /> {t('search')}
            </SubmitButton>
          </div>
        </Form>
      </Card>

      {near && geoReady ? (
        <div className="grid gap-3 lg:grid-cols-[380px_1fr]">
          {/* Liste façon Maps */}
          <div className="order-2 overflow-hidden rounded-2xl border border-slate-200 bg-white lg:order-1">
            <p className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-ink-900">
              {loading ? t('loading') : `${(results || []).length} ${t('resultsCount')}`}
            </p>
            <ul className="divide-y divide-slate-100 lg:h-[560px] lg:overflow-y-auto">
              {(results || []).map((p) => (
                <li
                  key={p.slug}
                  id={`item-${p.slug}`}
                  className={`cursor-pointer px-4 py-3 transition-colors hover:bg-slate-50 ${selected === p.slug ? 'bg-brand-50' : ''}`}
                  onClick={() => setSelected(p.slug)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-[15px] font-semibold leading-snug text-ink-900">
                        {bil(p.name_fr, p.name_ar)}
                        {p.test_booking ? <span className="ms-2 rounded bg-amber-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-amber-800">{t('testMode')}</span> : null}
                      </h2>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {p.distance_km != null ? <span className="font-semibold text-brand-700">{p.distance_km} {t('km')} · </span> : null}
                        {bil(p.specialty_fr, p.specialty_ar)}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-700">
                        {[bil(p.address_fr, p.address_ar), bil(p.city_fr, p.city_ar)].filter(Boolean).join(', ')}
                      </p>
                      {p.phone ? <p className="mt-0.5 text-xs text-ink-700" dir="ltr">{p.phone}</p> : null}
                      {p.online_booking === false ? (
                        <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-ink-700">{t('notOnMawid')}</span>
                      ) : (
                        <p className="mt-1 text-xs font-medium text-brand-800">
                          {p.next_availability
                            ? `${t('nextAvailability')} : ${formatDate(p.next_availability.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${p.next_availability.time}`
                            : t('noAvailabilitySoon')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                    {p.online_booking !== false ? (
                      <Link to={`/d/${p.slug}`} className="btn-primary btn-sm">
                        <IconCalendar size={15} /> {t('book')}
                      </Link>
                    ) : null}
                    {p.latitude != null && p.longitude != null ? (
                      <a
                        className="btn-secondary btn-sm"
                        href={`https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <IconPin size={15} /> {t('directions')}
                      </a>
                    ) : null}
                    {p.phone ? (
                      <a className="btn-secondary btn-sm" href={`tel:${p.phone}`}>
                        <IconPhone size={15} /> {t('call')}
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
              {!loading && results && results.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-ink-500">{t('searchNoResults')}</li>
              ) : null}
            </ul>
            <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-ink-500">{t('osmCredit')}</p>
          </div>
          <div className="order-1 lg:order-2">
            <NearbyMap
              practices={results || []}
              user={userPos}
              name={(p) => bil(p.name_fr, p.name_ar)}
              labels={{ you: t('youAreHere'), book: t('book'), km: t('km'), notOnMawid: t('notOnMawid'), view: t('viewProfile') }}
              selected={selected}
              onSelect={(slug) => {
                setSelected(slug);
                document.getElementById(`item-${slug}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              }}
              className="h-72 w-full overflow-hidden rounded-2xl border border-slate-200 sm:h-96 lg:h-[600px]"
            />
          </div>
        </div>
      ) : null}

      {!near && loading ? <SkeletonRows rows={4} /> : null}

      {error ? <ErrorState message={error} onRetry={() => setParams(new URLSearchParams(params))} /> : null}

      {!near && !loading && !error && results && results.length === 0 ? (
        <EmptyState
          icon={<IconSearch size={26} />}
          title={t('searchNoResults')}
          description={t('searchNoResultsHint')}
          action={
            <Link to="/" className="btn-secondary btn-sm">
              {t('navHome')}
            </Link>
          }
        />
      ) : null}

      {!near && !loading && results && results.length > 0 ? (
        <>
          <p className="text-xs text-ink-500">
            {results.length} {t('resultsCount')}
          </p>
          <ul className="space-y-3">
            {results.map((p) => (
              <li key={p.slug}>
                <Card className="p-4 transition-shadow hover:shadow-lg">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-ink-900">{bil(p.name_fr, p.name_ar)}</h2>
                      {p.distance_km != null ? (
                        <p className="mt-0.5 text-xs font-semibold text-brand-700">
                          {p.distance_km} {t('km')}
                        </p>
                      ) : null}
                      <p className="text-xs text-ink-500">{bil(p.specialty_fr, p.specialty_ar)}</p>
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-700">
                        <IconPin size={14} className="mt-0.5 shrink-0 text-brand-600" />
                        <span>
                          {[bil(p.address_fr, p.address_ar), bil(p.city_fr, p.city_ar)].filter(Boolean).join(' — ')}
                          {p.wilaya ? ` (${lang === 'ar' ? p.wilaya.ar : p.wilaya.fr})` : ''}
                        </span>
                      </p>
                      {p.online_booking === false ? (
                        <p className="mt-2 inline-block rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-ink-700">{t('notOnMawid')}</p>
                      ) : (
                        <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2 py-1 text-xs font-medium text-brand-800">
                          <IconClock size={13} />
                          {p.next_availability
                            ? `${t('nextAvailability')} : ${formatDate(p.next_availability.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${p.next_availability.time}`
                            : t('noAvailabilitySoon')}
                        </p>
                      )}
                    </div>
                    {p.online_booking !== false ? (
                      <Link to={`/d/${p.slug}`} className="btn-primary btn-sm shrink-0">
                        <IconCalendar size={15} /> {t('book')}
                      </Link>
                    ) : p.phone ? (
                      <a href={`tel:${p.phone}`} className="btn-secondary btn-sm shrink-0">
                        <IconPhone size={15} /> {t('call')}
                      </a>
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
                    <span className="text-[11px] text-ink-500">
                      {p.languages.map((l) => (l === 'ar' ? 'العربية' : 'Français')).join(' · ')}
                    </span>
                    <Link to={`/d/${p.slug}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700">
                      {t('viewProfile')} <IconChevronRight size={14} className="flip-x" />
                    </Link>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
