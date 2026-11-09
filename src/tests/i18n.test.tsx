import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider, useI18n } from '../i18n';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

function Probe() {
  const { t, dir, lang } = useI18n();
  return (
    <div>
      <p data-testid="dir">{dir}</p>
      <p data-testid="lang">{lang}</p>
      <p data-testid="title">{t('heroTitle')}</p>
      <p data-testid="count">{t('resultsCount')}</p>
    </div>
  );
}

describe('internationalisation FR/AR', () => {
  it('démarre en français et bascule en arabe avec un vrai RTL', () => {
    render(
      <I18nProvider>
        <Probe />
        <LanguageSwitcher />
      </I18nProvider>,
    );

    expect(screen.getByTestId('lang')).toHaveTextContent('fr');
    expect(screen.getByTestId('dir')).toHaveTextContent('ltr');
    expect(screen.getByTestId('title')).toHaveTextContent('Prenez rendez-vous chez votre dentiste');

    fireEvent.click(screen.getByRole('button', { name: /العربية/i }));

    expect(screen.getByTestId('lang')).toHaveTextContent('ar');
    expect(screen.getByTestId('dir')).toHaveTextContent('rtl');
    // L'attribut dir de <html> est bien appliqué (mise en page RTL réelle).
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(document.documentElement.getAttribute('lang')).toBe('ar');
    expect(screen.getByTestId('title')).toHaveTextContent('احجز موعدك');
    // Le libellé est bien traduit (les chiffres restent en numération latine partout).
    expect(screen.getByTestId('count')).toHaveTextContent('عيادة/عيادات');
  });

  it('mémorise la préférence de langue', () => {
    render(
      <I18nProvider>
        <LanguageSwitcher />
        <Probe />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /العربية/i }));
    expect(localStorage.getItem('mawid.lang')).toBe('ar');
  });

  it('traduit les codes d’erreur de l’API dans la langue active', () => {
    function Err() {
      const { apiError } = useI18n();
      return <p data-testid="err">{apiError('SLOT_TAKEN')}</p>;
    }
    render(
      <I18nProvider>
        <LanguageSwitcher />
        <Err />
      </I18nProvider>,
    );
    expect(screen.getByTestId('err')).toHaveTextContent('Ce créneau vient d’être réservé');
    fireEvent.click(screen.getByRole('button', { name: /العربية/i }));
    expect(screen.getByTestId('err')).toHaveTextContent('تم حجز هذا الوقت للتو');
  });
});
