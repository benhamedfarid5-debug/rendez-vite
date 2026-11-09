import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { Alert } from './ui';
import { IconCamera } from './icons';

type Props = {
  onDetected: (text: string) => void;
};

/**
 * Scan QR via la caméra de l'appareil (getUserMedia + jsQR).
 * Repli explicite si l'API n'est pas disponible ou si l'accès est refusé.
 */
export function QrScanner({ onDetected }: Props) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [state, setState] = useState<'idle' | 'starting' | 'scanning' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const stop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setState('idle');
  };

  useEffect(() => stop, []);

  const start = async () => {
    setError(null);
    if (!supported) {
      setState('error');
      setError(t('cameraDenied'));
      return;
    }
    setState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setState('scanning');

      // jsQR est chargé à la demande : allège le bundle initial.
      const { default: jsQR } = await import('jsqr');

      const tick = () => {
        const v = videoRef.current;
        const canvas = canvasRef.current;
        if (!v || !canvas) return;
        if (v.readyState === v.HAVE_ENOUGH_DATA) {
          const w = (canvas.width = v.videoWidth);
          const h = (canvas.height = v.videoHeight);
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx && w && h) {
            ctx.drawImage(v, 0, 0, w, h);
            const image = ctx.getImageData(0, 0, w, h);
            const code = jsQR(image.data, w, h, { inversionAttempts: 'dontInvert' });
            if (code?.data) {
              stop();
              onDetected(code.data);
              return;
            }
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setState('error');
      setError(t('cameraDenied'));
    }
  };

  return (
    <div className="space-y-3">
      {state === 'idle' || state === 'error' ? (
        <button type="button" onClick={start} className="btn-primary w-full">
          <IconCamera size={18} /> {t('scanQr')}
        </button>
      ) : (
        <button type="button" onClick={stop} className="btn-secondary w-full">
          {t('stopScan')}
        </button>
      )}

      {state === 'scanning' || state === 'starting' ? (
        <div className="relative overflow-hidden rounded-2xl bg-ink-900">
          <video ref={videoRef} className="aspect-[4/3] w-full object-cover" playsInline muted aria-label={t('scanning')} />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-40 w-40 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(18,33,42,0.35)]" />
          </div>
          <p className="absolute inset-x-0 bottom-2 text-center text-xs text-white">{t('scanHint')}</p>
        </div>
      ) : null}

      <canvas ref={canvasRef} className="hidden" />

      {error ? <Alert tone="warning">{error}</Alert> : null}
      <p className="text-xs text-ink-500">{t('cameraFallback')}</p>
    </div>
  );
}
