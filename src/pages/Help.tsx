import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { Card } from '../components/ui';
import { IconCamera, IconQr, IconStethoscope, IconUser } from '../components/icons';

export function Help() {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-ink-900">{t('helpTitle')}</h1>
      </header>

      <Card className="p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <IconUser size={17} className="text-brand-600" /> {t('helpPatientTitle')}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{t('helpPatientSteps')}</p>
        <Link to="/" className="btn-secondary btn-sm mt-3">{t('navHome')}</Link>
      </Card>

      <Card className="p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <IconStethoscope size={17} className="text-brand-600" /> {t('helpStaffTitle')}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{t('helpStaffSteps')}</p>
        <Link to="/staff" className="btn-secondary btn-sm mt-3">{t('login')}</Link>
      </Card>

      <Card className="p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <IconCamera size={17} className="text-brand-600" /> {t('helpScanTitle')}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{t('helpScanText')}</p>
      </Card>

      <Card className="p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <IconQr size={17} className="text-brand-600" /> {t('faqTitle')}
        </h2>
        <dl className="mt-2 space-y-3 text-sm">
          {[
            [t('faqPendingQ'), t('faqPendingA')],
            [t('faqCancelQ'), t('faqCancelA')],
            [t('faqDataQ'), t('faqDataA')],
          ].map(([q, a]) => (
            <div key={q}>
              <dt className="font-medium text-ink-900">{q}</dt>
              <dd className="mt-0.5 text-ink-700">{a}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <p className="text-center text-xs text-ink-500">
        <Link to="/confidentialite" className="link">{t('navPrivacy')}</Link>
      </p>
    </div>
  );
}
