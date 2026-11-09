import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from '../i18n';
import { PracticePublic } from '../pages/PracticePublic';

const practice = {
  slug: 'cabinet-test',
  public_id: 'abc',
  name_fr: 'Cabinet Test',
  name_ar: 'عيادة الاختبار',
  specialty_fr: 'Chirurgien-dentiste',
  specialty_ar: 'طبيب أسنان',
  address_fr: '1 rue du Test',
  address_ar: 'شارع الاختبار',
  city_fr: 'Alger',
  city_ar: 'الجزائر',
  wilaya: { fr: 'Alger', ar: 'الجزائر' },
  phone: '+213551000000',
  languages: ['fr', 'ar'],
  timezone: 'Africa/Algiers',
  slot_duration_min: 30,
  min_lead_hours: 2,
  horizon_days: 60,
  auto_confirm: true,
  hours: [
    { weekday: 0, is_open: 1, open_minute: 540, close_minute: 1020, break_start: 720, break_end: 780 },
  ],
};

const today = new Date().toISOString().slice(0, 10);

const availability = {
  practice,
  days: [
    { date: today, isOpen: true, slots: [{ start: `${today}T09:00:00Z`, end: `${today}T09:30:00Z`, time: '09:00' }] },
    { date: '2099-01-02', isOpen: false, slots: [] },
  ],
};

function mockFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('/availability')) return new Response(JSON.stringify(availability), { status: 200 });
      if (String(url).includes('/api/public/practices/')) {
        return new Response(JSON.stringify({ practice, next_availability: { date: today, time: '09:00', count: 1 } }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }),
  );
}

function renderPage() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/d/cabinet-test']}>
        <Routes>
          <Route path="/d/:slug" element={<PracticePublic />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('parcours de réservation (page publique)', () => {
  beforeEach(() => {
    mockFetch();
  });

  it('affiche les informations publiques et les motifs prédéfinis', async () => {
    renderPage();
    expect(await screen.findByText('Cabinet Test')).toBeInTheDocument();
    expect(screen.getByText('1 rue du Test, Alger — Alger')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Contrôle' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Détartrage' })).toBeInTheDocument();
    expect(screen.getByText(/ne pas écrire de détails médicaux sensibles/i)).toBeInTheDocument();
  });

  it('bloque l’étape suivante tant qu’aucun motif n’est choisi, puis propose les créneaux', async () => {
    renderPage();
    await screen.findByText('Cabinet Test');
    const next = screen.getByRole('button', { name: /Continuer/i });
    expect(next).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: 'Contrôle' }));
    expect(next).toBeEnabled();
    fireEvent.click(next);

    // Étape 2 : date + créneaux réellement libres
    await waitFor(() => expect(screen.getByText(/Choisissez une date/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('option', { name: new RegExp(`\\b${Number(today.slice(8, 10))}\\b`) }));
    expect(await screen.findByRole('button', { name: '09:00' })).toBeInTheDocument();
  });

  it('affiche la mention « en attente » si le cabinet ne confirme pas automatiquement', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/availability')) return new Response(JSON.stringify(availability), { status: 200 });
        return new Response(
          JSON.stringify({ practice: { ...practice, auto_confirm: false }, next_availability: null }),
          { status: 200 },
        );
      }),
    );
    renderPage();
    expect(await screen.findByText(/vérifie chaque demande/i)).toBeInTheDocument();
  });
});
