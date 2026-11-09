import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { LogoMark } from './LogoMark';

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Proposer d'installer Rendez-Vite sur l'écran d'accueil (Android, PC, Mac : bouton ; iPhone : explication). */
export function InstallApp() {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true);
  const ios = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as PromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (standalone || installed || (!prompt && !ios)) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <LogoMark size={40} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-900">{t('installTitle')}</p>
        <p className="text-xs text-ink-500">{prompt ? t('installHint') : t('installIos')}</p>
      </div>
      {prompt ? (
        <button
          type="button"
          className="btn-primary btn-sm"
          onClick={async () => {
            await prompt.prompt();
            setPrompt(null);
          }}
        >
          {t('installButton')}
        </button>
      ) : null}
    </div>
  );
}
