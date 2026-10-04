import React, { useEffect, useMemo, useState } from 'react';
import type { Building, Profile } from '../../types';
import { generateHailandCode } from '../../lib/supabase';
import { MiniMap } from '../common/MiniMap';
import { fmtDate, levelsOf, natureOf, StatusDot, typeLabel } from '../common/status';

interface Props {
  buildings: Building[];
  profiles: Profile[];
  onOpenOnMap: (b: Building) => void;
  onApprove: (b: Building, code: string) => void | Promise<void>;
  onReject: (b: Building, comment: string) => void | Promise<void>;
  onRequestVisit: (b: Building, note: string) => void | Promise<void>;
}

type Tab = 'todo' | 'contested' | 'done';

const CHECKS = [
  'Le point GPS tombe dans le contour',
  'Aucun doublon au registre',
  'Contour cohérent avec l’image satellite',
  'Visite terrain faite ou non nécessaire',
];

/** Module Revue (maquette) : file des demandes, plan du bâtiment, liste de contrôle et décision. */
export const RevueView: React.FC<Props> = ({ buildings, profiles, onOpenOnMap, onApprove, onReject, onRequestVisit }) => {
  const [tab, setTab] = useState<Tab>('todo');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean[]>>({});
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => {
    const sortRecent = (a: Building, b: Building) => (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at);
    return {
      todo: buildings.filter((b) => b.status === 'en_attente').sort(sortRecent),
      contested: buildings.filter((b) => b.status === 'conteste').sort(sortRecent),
      done: buildings.filter((b) => b.status === 'actif' || b.status === 'inactif').sort(sortRecent).slice(0, 60),
    };
  }, [buildings]);
  const list = groups[tab];
  const selected = list.find((b) => b.id === selectedId) ?? list[0] ?? null;

  useEffect(() => {
    setRejecting(false);
    setNote('');
  }, [selected?.id, tab]);

  const author = (b: Building) => profiles.find((p) => p.id === b.submitted_by)?.full_name || b.submitted_by || 'agent inconnu';
  const ck = selected ? (checks[selected.id] ?? [false, false, false, false]) : [];
  const allChecked = ck.length > 0 && ck.every(Boolean);

  const approve = async () => {
    if (!selected) return;
    setBusy(true);
    let code = selected.hailand_code;
    if (!code && selected.zone_code && selected.building_type) {
      code = generateHailandCode('CKY', selected.commune, selected.zone_code, selected.building_type, Math.floor(Math.random() * 900) + 100, selected.floor_level || undefined, selected.unit_code || undefined);
    }
    if (code) await onApprove(selected, code);
    setBusy(false);
  };
  const reject = async () => {
    if (!selected || !note.trim()) return;
    setBusy(true);
    await onReject(selected, note.trim());
    setBusy(false);
    setRejecting(false);
    setNote('');
  };
  const visit = async () => {
    if (!selected) return;
    setBusy(true);
    await onRequestVisit(selected, note.trim() || 'Visite terrain demandée');
    setBusy(false);
    setNote('');
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const i = selected ? list.findIndex((b) => b.id === selected.id) : -1;
      if (e.key === 'j') setSelectedId(list[Math.min(list.length - 1, i + 1)]?.id ?? null);
      else if (e.key === 'k') setSelectedId(list[Math.max(0, i - 1)]?.id ?? null);
      else if (e.key === 'a' && tab !== 'done' && allChecked && !busy) approve();
      else if (e.key === 'r' && tab !== 'done') setRejecting(true);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const tabBtn = (id: Tab, label: string, n: number) => (
    <button key={id} type="button" onClick={() => { setTab(id); setSelectedId(null); }} className={`h-[30px] rounded-md px-3 text-[12.5px] transition ${tab === id ? 'bg-hx-hover font-semibold text-hx-text' : 'text-hx-dim hover:bg-hx-hover/40'}`}>
      {label}{id !== 'done' ? ` · ${n}` : ''}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 bg-hx-base text-hx-text max-md:flex-col max-md:overflow-y-auto">
      <section aria-label="File de revue" className="flex w-[340px] shrink-0 flex-col border-r border-hx-line bg-hx-panel max-md:max-h-[38%] max-md:w-full max-md:border-b max-md:border-r-0">
        <div className="flex gap-1 border-b border-hx-line p-3.5">
          {tabBtn('todo', 'À traiter', groups.todo.length)}
          {tabBtn('contested', 'Contestés', groups.contested.length)}
          {tabBtn('done', 'Traités', 0)}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.length === 0 && <div className="px-4 py-8 text-[13px] text-hx-faint">Rien à traiter dans cette liste.</div>}
          {list.map((b) => (
            <button key={b.id} type="button" onClick={() => setSelectedId(b.id)} className={`flex w-full flex-col gap-1 border-b border-hx-line px-3.5 py-3 text-left transition hover:bg-hx-hover/30 ${selected?.id === b.id ? 'border-l-2 border-l-hx-accent bg-hx-accent-soft' : ''}`}>
              <div className="flex justify-between text-[11.5px]">
                <span className={`font-semibold ${b.status === 'conteste' ? 'text-hx-bad' : 'text-hx-warn'}`}>{b.status === 'conteste' ? 'CONTESTATION' : "RELEVÉ D'AGENT"}</span>
                <span className="text-hx-faint">{fmtDate(b.created_at)}</span>
              </div>
              <div className="text-[14px]">{b.landmark_note || `${natureOf(b)} · ${b.quartier || b.commune}`}</div>
              <div className="font-mono text-[12px] text-hx-dim">{b.hailand_code} · {author(b)}</div>
            </button>
          ))}
        </div>
      </section>

      {selected ? (
        <>
          <main className="relative min-w-0 flex-1 overflow-hidden bg-hx-map max-md:hidden">
            <MiniMap focus={selected} all={buildings} className="h-full" />
            <div className="absolute bottom-3.5 left-3.5 flex flex-col gap-1.5 rounded-lg border border-hx-line2 bg-hx-panel/95 px-3 py-2.5 text-[12px]">
              <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-hx-accent-text" />Contour du bâtiment</span>
              <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-hx-accent-text" />Entrée</span>
              <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-hx-ok" />Déjà au registre</span>
            </div>
            <button type="button" onClick={() => onOpenOnMap(selected)} className="absolute right-3.5 top-3.5 h-[30px] rounded-md border border-hx-line2 bg-hx-panel px-3 text-[12.5px] transition hover:bg-hx-hover">
              Ouvrir dans l’Atelier
            </button>
          </main>

          <aside aria-label="Décision" className="flex w-[380px] shrink-0 flex-col border-l border-hx-line bg-hx-panel max-md:min-h-0 max-md:w-full max-md:flex-1 max-md:border-l-0">
            <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto p-[18px]">
              <div>
                <div className="text-[11px] tracking-[0.08em] text-hx-faint">{natureOf(selected).toUpperCase()}</div>
                <div className="mt-1 text-[18px] font-semibold">{selected.landmark_note || `${typeLabel[selected.building_type] ?? selected.building_type} · ${selected.quartier || selected.commune}`}</div>
                <div className="mt-1 font-mono text-[12.5px] text-hx-accent-text">{selected.hailand_code}</div>
              </div>
              <dl className="m-0 grid grid-cols-[120px_1fr] gap-y-2 text-[13px]">
                <dt className="text-hx-dim">Statut</dt><dd className="m-0"><StatusDot status={selected.status} /></dd>
                <dt className="text-hx-dim">Soumis par</dt><dd className="m-0">{author(selected)}</dd>
                <dt className="text-hx-dim">Type</dt><dd className="m-0">{typeLabel[selected.building_type] ?? selected.building_type} · {levelsOf(selected)}</dd>
                <dt className="text-hx-dim">Unités</dt><dd className="m-0">{selected.unit_count}</dd>
                <dt className="text-hx-dim">Adresse</dt><dd className="m-0">{[selected.quartier, selected.commune].filter(Boolean).join(', ') || '—'}</dd>
                {selected.rejection_reason && (<><dt className="text-hx-dim">Motif</dt><dd className="m-0">{selected.rejection_reason}</dd></>)}
                {selected.modification_request && (<><dt className="text-hx-dim">Demande</dt><dd className="m-0">{selected.modification_request}</dd></>)}
              </dl>
              {tab !== 'done' && (
                <>
                  <fieldset className="m-0 flex flex-col gap-2.5 rounded-lg border border-hx-line px-3.5 py-3">
                    <legend className="px-1.5 text-[13px] font-semibold">Liste de contrôle</legend>
                    {CHECKS.map((label, i) => (
                      <label key={label} className="flex gap-2.5 text-[13px]">
                        <input type="checkbox" checked={!!ck[i]} onChange={(e) => setChecks((c) => { const next = [...(c[selected.id] ?? [false, false, false, false])]; next[i] = e.target.checked; return { ...c, [selected.id]: next }; })} className="accent-[#3f6fc4]" />
                        {label}
                      </label>
                    ))}
                  </fieldset>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-semibold">{rejecting ? 'Motif du rejet' : 'Note interne'} <span className="font-normal text-hx-faint">{rejecting ? '(obligatoire)' : '(facultatif)'}</span></span>
                    <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={rejecting ? 'Expliquez pourquoi ce relevé est refusé' : 'Visible par l’équipe seulement'} className="resize-none rounded-lg border border-hx-line2 bg-hx-base/60 px-3 py-2 text-[13px] text-hx-text outline-none placeholder:text-hx-faint focus:border-hx-accent" />
                  </label>
                </>
              )}
            </div>
            {tab !== 'done' && (
              <div className="flex flex-col gap-2 border-t border-hx-line px-[18px] py-3.5">
                {rejecting ? (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setRejecting(false)} className="h-10 rounded-lg border border-hx-line2 bg-hx-hover px-4 text-[13px]">Annuler</button>
                    <button type="button" disabled={!note.trim() || busy} onClick={reject} className="h-10 flex-1 rounded-lg bg-hx-bad text-[13.5px] font-semibold text-white disabled:opacity-40">Confirmer le rejet</button>
                  </div>
                ) : (
                  <>
                    <button type="button" disabled={!allChecked || busy} onClick={approve} title={allChecked ? '' : 'Cochez la liste de contrôle'} className="flex h-[42px] items-center justify-center gap-2.5 rounded-lg bg-hx-ok text-[14px] font-semibold text-hx-base transition disabled:opacity-40">
                      Certifier <span className="font-mono text-[11.5px] opacity-70">A</span>
                    </button>
                    <div className="flex gap-2">
                      <button type="button" disabled={busy} onClick={visit} className="h-[38px] flex-1 rounded-lg border border-hx-line2 text-[13px] transition hover:bg-hx-hover/40 disabled:opacity-40">Demander une visite</button>
                      <button type="button" onClick={() => setRejecting(true)} className="h-[38px] flex-1 rounded-lg border border-hx-bad/50 text-[13px] text-hx-bad transition hover:bg-hx-bad/10">Rejeter… <span className="font-mono text-[11px] opacity-70">R</span></button>
                    </div>
                    {!allChecked && <div className="text-[12px] text-hx-faint">Cochez la liste de contrôle pour certifier.</div>}
                  </>
                )}
              </div>
            )}
          </aside>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-[14px] text-hx-faint">Aucun relevé à examiner.</div>
      )}
    </div>
  );
};
