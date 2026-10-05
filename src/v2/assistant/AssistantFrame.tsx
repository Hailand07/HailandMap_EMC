import React, { useEffect } from 'react';
import { GhostButton, PrimaryButton } from '../atoms';

export type AssistantStage = 'structure' | 'attributs' | 'acces' | 'verification';

const STAGE_LIST: { id: 'emprise' | AssistantStage; label: string }[] = [
  { id: 'emprise', label: 'Emprise' },
  { id: 'structure', label: 'Structure' },
  { id: 'attributs', label: 'Attributs' },
  { id: 'acces', label: 'Accès' },
  { id: 'verification', label: 'Vérification' },
];

interface FrameProps {
  stage: AssistantStage;
  onStage: (s: AssistantStage) => void;
  title: string;
  /** Code en préparation (métrique + administratif). */
  code: { main: string; sub?: string | null; place?: string | null };
  children: React.ReactNode;
  back: { label: string; onClick: () => void; disabled?: boolean };
  next: { label: string; onClick: () => void; disabled?: boolean; hint?: string; busy?: boolean };
  /** Lien de sortie de l'assistant. */
  onQuit: () => void;
  note?: React.ReactNode;
}

/** Cadre de l'assistant de création (maquette « Création ») : barre des 5 étapes, code en préparation, corps défilant, actions. */
export const AssistantFrame: React.FC<FrameProps> = ({ stage, onStage, title, code, children, back, next, onQuit, note }) => {
  const current = STAGE_LIST.findIndex((s) => s.id === stage);
  // Ctrl + Entrée enregistre à l'étape de vérification.
  useEffect(() => {
    if (stage !== 'verification') return;
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !next.disabled && !next.busy) {
        e.preventDefault();
        next.onClick();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-3.5 border-b border-hx-line px-[18px] py-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px] font-semibold text-hx-text">{title}</span>
          <button type="button" onClick={onQuit} className="rounded-md px-2 py-1 text-[12.5px] text-hx-faint transition hover:bg-hx-hover hover:text-hx-text">
            Quitter
          </button>
        </div>
        <ol aria-label="Étapes" className="m-0 flex list-none gap-1 p-0">
          {STAGE_LIST.map((s, i) => {
            const done = i < current;
            const can = done && s.id !== 'emprise';
            return (
              <li key={s.id} aria-current={i === current ? 'step' : undefined} className="flex flex-1 flex-col gap-1.5">
                <button
                  type="button"
                  disabled={!can}
                  onClick={() => can && onStage(s.id as AssistantStage)}
                  aria-label={`Étape ${i + 1} : ${s.label}`}
                  className="flex flex-col gap-1.5 text-left disabled:cursor-default"
                >
                  <span className={`h-1 w-full rounded-sm ${i <= current ? 'bg-hx-accent' : 'bg-hx-line2'}`} />
                  <span className={`text-[11.5px] ${i === current ? 'font-semibold text-hx-text' : done ? 'text-hx-dim' : 'text-hx-faint'}`}>{s.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-col gap-1 rounded-lg border border-hx-line bg-hx-card px-3 py-2.5">
          <div className="flex justify-between text-[11.5px] text-hx-faint">
            <span>Code en préparation</span>
            <span>attribué à l’enregistrement</span>
          </div>
          <div className="font-mono text-[15px] text-hx-accent-text">{code.main}</div>
          {(code.sub || code.place) && (
            <div className="font-mono text-[12px] text-hx-dim">
              {code.sub}
              {code.sub && code.place ? ' · ' : ''}
              {code.place}
            </div>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto p-[18px]">{children}</div>

      <div className="flex flex-col gap-2 border-t border-hx-line px-[18px] py-3.5">
        {note}
        <div className="flex gap-2.5">
          <GhostButton type="button" onClick={back.onClick} disabled={back.disabled}>
            {back.label}
          </GhostButton>
          <PrimaryButton type="button" onClick={next.onClick} disabled={next.disabled || next.busy} hint={next.hint}>
            {next.busy ? 'Enregistrement…' : next.label}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
};
