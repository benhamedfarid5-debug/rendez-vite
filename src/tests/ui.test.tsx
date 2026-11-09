import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '../i18n';
import { StatusBadge, Stepper, EmptyState } from '../components/ui';

const wrap = (ui: React.ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

describe('composants de statut et d’état', () => {
  it('affiche un statut avec un libellé ET un symbole (pas seulement une couleur)', () => {
    wrap(<StatusBadge status="requested" />);
    const chip = screen.getByText('Demandé').closest('.chip')!;
    expect(chip.textContent).toContain('?');
    expect(chip.textContent).toContain('Demandé');
  });

  it('traduit le statut en arabe', () => {
    wrap(
      <>
        <StatusBadge status="confirmed" />
      </>,
    );
    expect(screen.getByText('Confirmé')).toBeInTheDocument();
  });

  it('expose l’étape courante du parcours de réservation', () => {
    wrap(<Stepper steps={['Motif', 'Date', 'Coordonnées', 'Confirmation']} current={1} />);
    const current = screen.getByText('2').closest('span')!;
    expect(current).toHaveAttribute('aria-current', 'step');
  });

  it('affiche un état vide explicite', () => {
    wrap(<EmptyState title="Aucun rendez-vous" description="Rien à afficher" />);
    expect(screen.getByText('Aucun rendez-vous')).toBeInTheDocument();
    expect(screen.getByText('Rien à afficher')).toBeInTheDocument();
  });
});
