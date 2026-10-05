import React from 'react';
import { Home } from 'lucide-react';

/** Marque : carré bleu et maison, repris de la barre du haut de l'Atelier. */
export const BrandMark: React.FC<{ size?: number }> = ({ size = 34 }) => (
  <div className="flex items-center justify-center rounded-[9px] bg-hx-accent text-white" style={{ width: size, height: size }}>
    <Home size={Math.round(size * 0.58)} strokeWidth={2.3} />
  </div>
);

/** Fond cartographique décoratif : quadrillage, routes, bâtiments et une concession en cours de relevé. */
const BrandMap: React.FC<{ detail?: boolean }> = ({ detail = true }) => (
  <svg viewBox="0 0 760 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className="absolute inset-0 h-full w-full">
    <rect width="760" height="900" fill="#262626" />
    <g stroke="#303030">
      <path d="M0 120H760M0 240H760M0 360H760M0 480H760M0 600H760M0 720H760M0 840H760" />
      <path d="M95 0V900M190 0V900M285 0V900M380 0V900M475 0V900M570 0V900M665 0V900" />
    </g>
    <path d="M-20 660 C 160 600, 360 700, 780 600" stroke="#2F2F2F" strokeWidth="34" fill="none" />
    <path d="M250 -20 L 290 920" stroke="#2F2F2F" strokeWidth="20" fill="none" />
    <g fill="#303030" stroke="#3A3A3A">
      <rect x="60" y="150" width="110" height="70" transform="rotate(-4 115 185)" />
      <rect x="560" y="140" width="120" height="76" transform="rotate(5 620 178)" />
      <rect x="580" y="760" width="110" height="70" transform="rotate(-5 635 795)" />
      <rect x="90" y="740" width="110" height="74" transform="rotate(4 145 777)" />
      {detail && <rect x="60" y="300" width="100" height="80" transform="rotate(-4 110 340)" />}
    </g>
    <polygon points="330,300 640,320 626,560 320,540" fill="rgba(63,111,196,0.07)" stroke="#3F6FC4" strokeWidth="2" strokeDasharray="9 6" />
    {detail && (
      <>
        <polygon points="360,340 520,350 512,450 352,440" fill="rgba(79,127,209,0.28)" stroke="#3F6FC4" strokeWidth="2.5" />
        <polygon points="548,360 612,364 608,450 544,446" fill="rgba(79,127,209,0.14)" stroke="#7FA6E6" strokeWidth="2" />
        <circle cx="450" cy="560" r="8" fill="#3F6FC4" stroke="#262626" strokeWidth="3" />
      </>
    )}
  </svg>
);

interface Props {
  children: React.ReactNode;
  /** Affiche l'étiquette « Code Hailand » sur la colonne de marque (écran de connexion). */
  showCode?: boolean;
}

/** Page à deux colonnes de l'entrée : marque et carte à gauche, formulaire à droite (sur téléphone, bandeau puis formulaire). */
export const AuthLayout: React.FC<Props> = ({ children, showCode }) => (
  <div className="flex min-h-screen w-screen flex-wrap bg-hx-base font-sans text-hx-text max-md:flex-col">
    <section aria-label="HailandMap" className="relative min-h-[420px] min-w-0 flex-[1_1_560px] overflow-hidden border-r border-hx-line bg-[#262626] max-md:min-h-[230px] max-md:flex-none">
      <BrandMap />
      <div className="absolute left-12 top-10 flex items-center gap-3 max-md:left-5 max-md:top-5">
        <BrandMark />
        <span className="text-[17px] font-semibold">HailandMap</span>
      </div>
      <div className="absolute inset-x-12 bottom-14 flex max-w-[520px] flex-col gap-4 max-md:inset-x-5 max-md:bottom-5">
        {showCode && (
          <div className="flex flex-col gap-0.5 self-start rounded-[10px] border border-hx-line2 bg-hx-panel px-3.5 py-2.5 shadow-[0_12px_30px_rgba(0,0,0,0.35)] max-md:hidden">
            <span className="text-[11px] text-hx-faint">Code Hailand</span>
            <span className="font-mono text-[15px] text-hx-accent-text">GN-Z14528-CR003-RA</span>
          </div>
        )}
        <h2 className="m-0 text-[34px] font-semibold leading-tight max-md:text-2xl">Chaque porte a une adresse.</h2>
        <p className="m-0 text-[15px] leading-relaxed text-hx-dim max-md:hidden">
          Relevez, vérifiez et publiez les adresses de Guinée, bâtiment par bâtiment, directement sur la carte.
        </p>
      </div>
    </section>
    <section className="relative flex min-w-0 flex-[1_1_480px] flex-col items-center justify-center px-8 py-12 max-md:flex-1 max-md:justify-start max-md:px-5 max-md:py-6">
      <div className="flex w-full max-w-[400px] flex-col gap-6">{children}</div>
      <div className="absolute inset-x-0 bottom-6 text-center font-mono text-[11.5px] text-hx-faint/70 max-md:static max-md:mt-8">© Hailand 2026 · v6.0</div>
    </section>
  </div>
);
