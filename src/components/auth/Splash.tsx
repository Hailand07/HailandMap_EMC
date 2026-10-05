import React from 'react';
import { ArrowRight } from 'lucide-react';
import { BrandMark } from './AuthLayout';

interface Props {
  /** Progression affichée (0 à 100). */
  progress: number;
  /** Une fois le chargement terminé : permet d'entrer sans attendre. */
  onEnter?: () => void;
}

/** Écran d'ouverture : marque, progression du chargement, accès direct. */
export const Splash: React.FC<Props> = ({ progress, onEnter }) => (
  <div role="status" aria-live="polite" className="relative flex min-h-screen w-screen items-center justify-center overflow-hidden bg-hx-base font-sans text-hx-text">
    <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className="absolute inset-0 h-full w-full">
      <g stroke="#2A2A2A">
        <path d="M0 150H1440M0 300H1440M0 450H1440M0 600H1440M0 750H1440" />
        <path d="M180 0V900M360 0V900M540 0V900M720 0V900M900 0V900M1080 0V900M1260 0V900" />
      </g>
      <g fill="none" stroke="#2F2F2F" strokeWidth="1.5">
        <path d="M-20 700 C 200 640, 420 760, 700 690 S 1200 600, 1460 680" />
        <path d="M-20 740 C 200 680, 420 800, 700 730 S 1200 640, 1460 720" />
        <path d="M-20 780 C 200 720, 420 840, 700 770 S 1200 680, 1460 760" />
        <path d="M-20 180 C 240 130, 480 230, 760 170 S 1220 120, 1460 190" />
        <path d="M-20 220 C 240 170, 480 270, 760 210 S 1220 160, 1460 230" />
      </g>
      <g fill="#242424" stroke="#303030">
        <rect x="150" y="320" width="80" height="54" transform="rotate(-5 190 347)" />
        <rect x="260" y="360" width="60" height="48" transform="rotate(-5 290 384)" />
        <rect x="1120" y="300" width="90" height="60" transform="rotate(6 1165 330)" />
        <rect x="1230" y="360" width="62" height="50" transform="rotate(6 1261 385)" />
        <rect x="1060" y="520" width="70" height="50" transform="rotate(-4 1095 545)" />
        <rect x="210" y="520" width="76" height="52" transform="rotate(4 248 546)" />
      </g>
      <polygon points="1100,420 1260,432 1250,520 1090,508" fill="rgba(63,111,196,0.10)" stroke="#3F6FC4" strokeWidth="1.5" strokeDasharray="6 5" />
      <circle cx="1176" cy="474" r="5" fill="#3F6FC4" />
    </svg>
    <div className="relative flex flex-col items-center gap-[22px] text-center">
      <div className="shadow-[0_18px_50px_rgba(63,111,196,0.35)]" style={{ borderRadius: 22 }}>
        <BrandMark size={84} />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[46px] font-semibold tracking-tight max-md:text-4xl">HailandMap</h1>
        <p className="m-0 text-base text-hx-dim">L’atelier cadastral de l’adressage en Guinée</p>
      </div>
      <div className="mt-4 flex w-[280px] flex-col items-center gap-2.5">
        <div className="h-1 w-full overflow-hidden rounded-sm bg-hx-card">
          <div className="h-full bg-hx-accent transition-[width] duration-500 ease-out" style={{ width: `${Math.min(100, Math.max(4, progress))}%` }} />
        </div>
        <span className="font-mono text-xs text-hx-faint">{progress >= 100 ? 'Prêt' : 'Chargement du registre…'}</span>
      </div>
      {onEnter && (
        <button type="button" onClick={onEnter} className="mt-3 inline-flex h-11 items-center gap-2.5 rounded-[10px] border border-hx-line2 bg-hx-panel px-6 text-[14.5px] font-semibold transition hover:bg-hx-hover">
          Entrer <ArrowRight size={16} strokeWidth={2.2} />
        </button>
      )}
    </div>
    <div className="absolute inset-x-0 bottom-7 flex justify-center gap-[18px] font-mono text-[11.5px] text-hx-faint/70 max-md:px-4 max-md:text-center">
      <span>Hailand · Infrastructure d’adressage souveraine d’Afrique</span>
      <span>v6.0</span>
    </div>
  </div>
);
