import React from 'react';
import { useI18n } from '../i18n';
import { Card } from '../components/ui';
import { IconShield } from '../components/icons';

export function Privacy() {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
          <IconShield size={22} />
        </span>
        <div>
          <h1 className="text-xl font-bold text-ink-900">{t('privacyTitle')}</h1>
          <p className="text-xs text-ink-500">{t('privacyIntro')}</p>
        </div>
      </header>

      <Card className="space-y-4 p-4 text-sm leading-relaxed text-ink-700">
        <section>
          <h2 className="font-semibold text-ink-900">{t('privacyDataTitle')}</h2>
          <p className="mt-1">{t('privacyDataList')}</p>
        </section>
        <section>
          <h2 className="font-semibold text-ink-900">{t('privacyNotCollectedTitle')}</h2>
          <p className="mt-1">{t('privacyNotCollectedList')}</p>
        </section>
        <section>
          <h2 className="font-semibold text-ink-900">{t('privacyPurposeTitle')}</h2>
          <p className="mt-1">{t('privacyPurposeList')}</p>
        </section>
        <section>
          <h2 className="font-semibold text-ink-900">{t('privacyAccessTitle')}</h2>
          <p className="mt-1">{t('privacyAccessList')}</p>
        </section>
        <section>
          <h2 className="font-semibold text-ink-900">{t('privacyRightsTitle')}</h2>
          <p className="mt-1">{t('privacyRightsList')}</p>
        </section>
        <section className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
          <h2 className="font-semibold text-amber-900">{t('privacyLegalTitle')}</h2>
          <p className="mt-1 text-amber-900">{t('privacyLegalText')}</p>
        </section>
      </Card>
    </div>
  );
}
