import React from 'react';

/** Logo Rendez-Vite : un R dont la jambe devient une coche de validation. */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 240 240" aria-hidden="true" className="shrink-0">
      <circle cx="120" cy="120" r="120" fill="#0E3B3D" />
      <path d="M78 176 V64 H124 A33 33 0 0 1 124 130 H78" fill="none" stroke="#F6F4EF" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M112 130 L140 164 L190 84" fill="none" stroke="#7FD1C4" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
