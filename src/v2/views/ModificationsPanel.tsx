import React, { useEffect, useState } from 'react';
import type { Building, Profile } from '../../types';
import { getActor } from '../../lib/actor';
import { decideRevision, FIELD_LABELS, fmtValue, loadPendingRevisions, revisionErrorMessage, type Revision } from '../../lib/revisions';
import { fmtDate, natureOf } from '../common/status';

interface Props {
  buildings: Building[];
  profiles: Profile[];
  onOpenOnMap: (b: Building) => void;
  /** Appelé après une modification appliquée (pour relire le registre). */
  onApplied: () => void;
  onCount?: (n: number) => void;
}

/**
 * Onglet « Modifications » de la Revue : propositions de modification faites par des agents sur des bâtiments enregistrés.
 * Un administrateur les applique ou les refuse (motif obligatoire), comme on valide ou refuse un commit.
 */
export const ModificationsPanel: React.FC<Props> = ({ buildings, profiles, onOpenOnMap, onApplied, onCount }) => {
  const [list, setList] = useState<Revision[] | null>(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const isAdmin = getActor()?.role === 'admin';

  const reload = () =>
    loadPendingRevisions()
      .then((r) => {
        setList(r);
        setError('');
        onCount?.(r.length);
      })
      .catch((e) => setError(revisionErrorMessage(e)));
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = list?.find((r) => r.id === selectedId) ?? list?.[0] ?? null;
  const building = selected ? buildings.find((b) => b.id === selected.building_id) : undefined;
  const nameOf = (id: string | null) => (id ? profiles.find((p) => p.id === id)?.full_name || `${id.slice(0, 8)}…` : '—');

  const decide = async (approve: boolean) => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await decideRevision(selected.id, approve, note.trim() || undefined);
      setNote('');
      setSelectedId(null);
      await reload();
      if (approve) onApplied();
    } catch (e) {
      setError(revisionErrorMessage(e));
    }
    setBusy(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 max-md:flex-col">
      <section aria-label="Propositions de modification" className="flex w-[340px] shrink-0 flex-col border-r border-hx-line bg-hx-panel max-md:max-h-[40%] max-md:w-full max-md:border-b max-md:border-r-0">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error && <div className="px-4 py-3 text-[12.5px] text-hx-bad">{error}</div>}
          {list && list.length === 0 && <div className="px-4 py-8 text-[13px] text-hx-faint">Aucune modification en attente.</div>}
          {list?.map((r) => {
            const b = buildings.find((x) => x.id === r.building_id);
            return (
              <button key={r.id} type="button" onClick={() => setSelectedId(r.id)} className={`flex w-full flex-col gap-1 border-b border-hx-line px-3.5 py-3 text-left transition hover:bg-hx-hover/30 ${selected?.id === r.id ? 'border-l-2 border-l-hx-accent bg-hx-accent-soft' : ''}`}>
                <div className="flex justify-between text-[11.5px]">
                  <span className="font-semibold text-hx-warn">PROPOSITION · {Object.keys(r.changes).length} champ{Object.keys(r.changes).length > 1 ? 's' : ''}</span>
                  <span className="text-hx-faint">{fmtDate(r.created_at)}</span>
                </div>
                <div className="text-[14px]">{b?.landmark_note || b?.admin_code || r.building_id}</div>
                <div className="text-[12px] text-hx-dim">{nameOf(r.author)}</div>
              </button>
            );
          })}
        </div>
      </section>
      {selected ? (
        <aside className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-hx-panel p-[18px]">
          <div className="max-w-[600px]">
            <div className="text-[11px] tracking-[0.08em] text-hx-faint">{building ? natureOf(building).toUpperCase() : 'BÂTIMENT'} · RÉVISION ACTUELLE {building?.revision ?? 1}</div>
            <div className="mt-1 text-[18px] font-semibold">{building?.landmark_note || selected.building_id}</div>
            <div className="mt-1 font-mono text-[12.5px] text-hx-accent-text">{building?.admin_code || building?.hailand_code || ''}</div>
            <div className="mt-4 text-[13px] font-semibold">Justification de {nameOf(selected.author)}</div>
            <p className="mt-1 text-[13px]">{selected.reason}</p>
            <div className="mt-4 text-[13px] font-semibold">Changements proposés</div>
            <table className="mt-1.5 w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="text-left text-hx-faint"><th className="py-1 font-normal">Champ</th><th className="py-1 font-normal">Avant</th><th className="py-1 font-normal">Après</th></tr>
              </thead>
              <tbody>
                {(Object.entries(selected.changes) as [string, { old: unknown; new: unknown }][]).map(([k, v]) => (
                  <tr key={k} className="border-t border-hx-line">
                    <td className="py-1.5 text-hx-dim">{FIELD_LABELS[k] || k}</td>
                    <td className="py-1.5 font-mono text-hx-bad">{fmtValue(k, v.old)}</td>
                    <td className="py-1.5 font-mono text-hx-ok">{fmtValue(k, v.new)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {building && (
              <button type="button" onClick={() => onOpenOnMap(building)} className="mt-4 h-[34px] rounded-lg border border-hx-line2 px-3.5 text-[13px] transition hover:bg-hx-hover/40">Voir sur la carte</button>
            )}
            {isAdmin ? (
              <div className="mt-5 flex flex-col gap-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold">Note de décision <span className="font-normal text-hx-faint">(obligatoire pour refuser)</span></span>
                  <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="resize-none rounded-lg border border-hx-line2 bg-hx-base/60 px-3 py-2 text-[13px] outline-none focus:border-hx-accent" />
                </label>
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={() => decide(true)} className="h-10 flex-1 rounded-lg bg-hx-ok text-[13.5px] font-semibold text-hx-base disabled:opacity-40">Appliquer</button>
                  <button type="button" disabled={busy || note.trim().length < 5} onClick={() => decide(false)} className="h-10 flex-1 rounded-lg border border-hx-bad/50 text-[13px] text-hx-bad disabled:opacity-40">Refuser</button>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-lg border border-hx-line px-3 py-2 text-[12.5px] text-hx-dim">Seul un administrateur peut appliquer ou refuser une proposition.</div>
            )}
          </div>
        </aside>
      ) : (
        <div className="flex flex-1 items-center justify-center text-[14px] text-hx-faint">{list ? 'Aucune modification à examiner.' : 'Chargement…'}</div>
      )}
    </div>
  );
};
