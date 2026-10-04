import React from 'react';

export interface ActivityEntry {
  id: number;
  at: number;
  tone: 'success' | 'warning' | 'info';
  title: string;
  message: string;
}

/** Boîte « Activité » ouverte par la cloche : historique des opérations, à la place des messages flottants. */
export const ActivityPanel: React.FC<{ entries: ActivityEntry[]; onClear: () => void; onClose: () => void }> = ({ entries, onClear, onClose }) => (
  <div role="dialog" aria-label="Activité" className="absolute right-3 top-[52px] z-[110] w-[340px] overflow-hidden rounded-xl border border-hx-line2 bg-hx-bar shadow-2xl">
    <div className="flex items-center justify-between border-b border-hx-line px-3.5 py-2.5">
      <span className="text-[13px] font-semibold">Activité</span>
      <span className="flex gap-3 text-[12px] text-hx-faint">
        <button type="button" onClick={onClear} className="hover:text-hx-text">Effacer</button>
        <button type="button" onClick={onClose} className="hover:text-hx-text">Fermer</button>
      </span>
    </div>
    <ul className="m-0 max-h-[360px] list-none overflow-y-auto p-0">
      {entries.length === 0 && <li className="px-3.5 py-5 text-[13px] text-hx-faint">Rien de nouveau pour l’instant.</li>}
      {entries.map((e) => (
        <li key={e.id} className="flex gap-2.5 border-b border-hx-line px-3.5 py-2.5 last:border-0">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${e.tone === 'success' ? 'bg-hx-ok' : e.tone === 'warning' ? 'bg-hx-warn' : 'bg-hx-accent-text'}`} />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold">{e.title}</div>
            <div className="text-[12.5px] leading-snug text-hx-dim">{e.message}</div>
            <div className="mt-0.5 font-mono text-[11px] text-hx-faint">{new Date(e.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </li>
      ))}
    </ul>
  </div>
);
