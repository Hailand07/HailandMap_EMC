import React, { useEffect, useMemo, useState } from 'react';
import type { Building, Profile } from '../../types';
import * as turf from '@turf/turf';
import { getActor } from '../../lib/actor';
import { loadUnits } from '../../lib/attachment';
import { buildUnits, levelIds, type UnitInput } from '../../registration/units';
import { footprintOf } from '../../map/registered';
import {
  EDITABLE_FIELDS,
  FIELD_LABELS,
  REASON_MIN,
  computeChanges,
  fmtValue,
  loadRevisions,
  proposeChange,
  revisionErrorMessage,
  type ChangeSet,
  type Draft,
  type EditableField,
  type Revision,
} from '../../lib/revisions';
import { fmtDate, natureOf, StatusDot, typeLabel } from '../common/status';

interface Props {
  building: Building;
  residents: number;
  profiles: Profile[];
  onClose: () => void;
  onOpenRegistre: () => void;
  /** Appelé après une modification appliquée (pour relire le registre). */
  onChanged: () => void;
  /** Contour retracé sur la carte, en attente de justification (null = aucun). */
  pendingContour: GeoJSON.Polygon | null;
  /** Lance le retraçage du contour sur la carte (la fiche se referme jusqu'à la fin du tracé). */
  onStartContour: () => void;
  onClearContour: () => void;
  /** Onglet à ouvrir (ex. « modifier » au retour du retraçage). */
  initialTab?: 'fiche' | 'historique' | 'modifier';
}

const ORIGIN: Record<string, string> = {
  nouveau: 'Nouveau tracé (terrain vide)',
  osm: 'Repris d’un bâtiment OSM',
  certification: 'Certification demandée par un résident',
};

const FIELD_INPUT: Record<EditableField, 'text' | 'number' | 'type' | 'status'> = {
  landmark_note: 'text',
  building_type: 'type',
  floor_count: 'number',
  unit_count: 'number',
  physical_position: 'text',
  entry_point_note: 'text',
  internal_directions: 'text',
  door_color: 'text',
  intercom_code: 'text',
  access_note: 'text',
  status: 'status',
};

/**
 * Fiche d'un bâtiment ENREGISTRÉ (jamais d'un bâtiment OSM) : identité, codes, origine, occupation, historique des révisions,
 * et modification contrôlée — justification obligatoire ; un administrateur applique, un agent propose (décision d'un administrateur).
 */
export const BuildingSheet: React.FC<Props> = ({ building: b, residents, profiles, onClose, onOpenRegistre, onChanged, pendingContour, onStartContour, onClearContour, initialTab }) => {
  const [tab, setTab] = useState<'fiche' | 'historique' | 'modifier'>(initialTab ?? 'fiche');
  const [unitsDraft, setUnitsDraft] = useState<UnitInput[] | null>(null);
  const [unitsBase, setUnitsBase] = useState<UnitInput[] | null>(null);
  const [perFloor, setPerFloor] = useState(2);
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [revError, setRevError] = useState('');
  const [draft, setDraft] = useState<Draft>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const isAdmin = getActor()?.role === 'admin';
  const certified = b.status === 'actif' && b.is_validated;

  const reload = () => {
    setRevisions(null);
    loadRevisions(b.id)
      .then((r) => {
        setRevisions(r);
        setRevError('');
      })
      .catch((e) => setRevError(revisionErrorMessage(e)));
  };
  // Unités actuelles du bâtiment (hors cour) : base de comparaison de l'éditeur.
  useEffect(() => {
    setUnitsDraft(null);
    setUnitsBase(null);
    if (b.has_courtyard) return;
    loadUnits(b.id)
      .then((u) => {
        const list = u.map((x, i) => ({ code: x.code, floor_label: x.floor_label, door: x.door, kind: x.kind as UnitInput['kind'], sort: i }));
        setUnitsBase(list);
        setUnitsDraft(list);
      })
      .catch(() => {});
  }, [b.id, b.revision]);

  useEffect(() => {
    setTab(initialTab ?? 'fiche');
    setDraft({});
    setReason('');
    setMessage(null);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.id]);

  const unitsChanged = useMemo(() => {
    if (!unitsDraft || !unitsBase) return false;
    const n = (l: UnitInput[]) => JSON.stringify(l.map((u) => [u.code, u.floor_label, u.door, u.kind]));
    return n(unitsDraft) !== n(unitsBase);
  }, [unitsDraft, unitsBase]);
  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab, pendingContour]);
  const changes = useMemo<ChangeSet>(() => {
    const c: ChangeSet = { ...computeChanges(b, draft) };
    if (pendingContour) {
      if (b.has_courtyard) c.courtyard_geom = pendingContour;
      c.geom = pendingContour;
    }
    if (unitsChanged && unitsDraft) c.units = unitsDraft.map((u, i) => ({ ...u, sort: i }));
    return c;
  }, [b, draft, pendingContour, unitsChanged, unitsDraft]);
  const oldArea = useMemo(() => { try { const f = footprintOf(b); return f ? turf.area({ type: 'Feature', properties: {}, geometry: f } as any) : 0; } catch { return 0; } }, [b]);
  const newArea = useMemo(() => (pendingContour ? turf.area({ type: 'Feature', properties: {}, geometry: pendingContour } as any) : 0), [pendingContour]);
  const nChanges = Object.keys(changes).length;
  const canSubmit = nChanges > 0 && reason.trim().length >= REASON_MIN && !busy;
  const pending = (revisions ?? []).filter((r) => r.status === 'proposee');
  const nameOf = (id: string | null) => (id ? profiles.find((p) => p.id === id)?.full_name || (id.length > 12 ? `${id.slice(0, 8)}…` : id) : '—');

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await proposeChange(b.id, changes, reason.trim());
      setMessage({ tone: 'ok', text: r.status === 'appliquee' ? `Modification appliquée (révision ${r.revision}).` : 'Proposition envoyée : un administrateur doit la valider.' });
      setDraft({});
      setReason('');
      onClearContour();
      setTab('historique');
      reload();
      if (r.status === 'appliquee') onChanged();
    } catch (e) {
      setMessage({ tone: 'bad', text: revisionErrorMessage(e) });
    }
    setBusy(false);
  };

  const value = (k: EditableField) => (k in draft ? draft[k] : (b as any)[k]) ?? '';
  const set = (k: EditableField, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const tabBtn = (id: typeof tab, label: string) => (
    <button type="button" onClick={() => setTab(id)} className={`h-[30px] rounded-md px-3 text-[12.5px] transition ${tab === id ? 'bg-hx-hover font-semibold text-hx-text' : 'text-hx-dim hover:bg-hx-hover/40'}`}>
      {label}
    </button>
  );

  return (
    <aside role="dialog" aria-label="Fiche du bâtiment" className="absolute right-3.5 top-3.5 bottom-3.5 z-40 flex w-[420px] max-w-[calc(100vw-28px)] flex-col overflow-hidden rounded-xl border border-hx-line2 bg-hx-panel text-hx-text shadow-2xl max-md:inset-x-2 max-md:w-auto">
      <div className="flex items-start justify-between gap-3 border-b border-hx-line px-4 py-3.5">
        <div className="min-w-0">
          <div className="text-[11px] tracking-[0.08em] text-hx-faint">{natureOf(b).toUpperCase()} · RÉVISION {b.revision ?? 1}</div>
          <div className="mt-0.5 truncate text-[17px] font-semibold">{b.landmark_note || `${typeLabel[b.building_type] ?? b.building_type}`}</div>
          <div className="mt-1 font-mono text-[12.5px] text-hx-accent-text">{b.admin_code || 'Code public attribué à la certification'}</div>
          <div className="font-mono text-[11.5px] text-hx-faint">interne · {b.hailand_code || '—'}</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer la fiche" className="rounded-md px-2 py-1 text-[13px] text-hx-faint hover:bg-hx-hover hover:text-hx-text">✕</button>
      </div>
      <div className="flex gap-1 border-b border-hx-line px-3 py-2">
        {tabBtn('fiche', 'Fiche')}
        {tabBtn('historique', `Historique${revisions ? ` · ${revisions.length}` : ''}`)}
        {tabBtn('modifier', isAdmin ? 'Modifier' : 'Proposer une modification')}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5 text-[13px]">
        {message && <div role="status" className={`mb-3 rounded-lg px-3 py-2 ${message.tone === 'ok' ? 'bg-hx-ok/10 text-hx-ok' : 'bg-hx-bad/10 text-hx-bad'}`}>{message.text}</div>}
        {pending.length > 0 && tab !== 'modifier' && (
          <div className="mb-3 rounded-lg border border-hx-warn/40 bg-hx-warn/5 px-3 py-2 text-hx-warn">{pending.length} modification{pending.length > 1 ? 's' : ''} en attente de validation par un administrateur.</div>
        )}

        {tab === 'fiche' && (
          <dl className="m-0 grid grid-cols-[150px_1fr] gap-y-2">
            <dt className="text-hx-dim">Statut</dt><dd className="m-0"><StatusDot status={b.status} />{certified ? ' · certifié' : ''}</dd>
            <dt className="text-hx-dim">Origine</dt><dd className="m-0">{ORIGIN[b.registration_origin || ''] || 'Antérieure au suivi'}</dd>
            <dt className="text-hx-dim">Type</dt><dd className="m-0">{typeLabel[b.building_type] ?? b.building_type}</dd>
            <dt className="text-hx-dim">Niveaux</dt><dd className="m-0">{b.floor_count === 0 ? 'RDC' : `R+${b.floor_count}`}</dd>
            <dt className="text-hx-dim">Unités</dt><dd className="m-0">{b.unit_count}</dd>
            <dt className="text-hx-dim">Personnes rattachées</dt><dd className="m-0">{residents}</dd>
            <dt className="text-hx-dim">Adresse</dt><dd className="m-0">{[b.quartier, b.commune].filter(Boolean).join(', ') || '—'}</dd>
            {b.entry_point_note && (<><dt className="text-hx-dim">Entrée</dt><dd className="m-0">{b.entry_point_note}</dd></>)}
            {b.door_color && (<><dt className="text-hx-dim">Porte</dt><dd className="m-0">{b.door_color}</dd></>)}
            <dt className="text-hx-dim">Enregistré</dt><dd className="m-0">{fmtDate(b.created_at)} · {nameOf(b.submitted_by)}</dd>
          </dl>
        )}

        {tab === 'historique' && (
          <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
            {revError && <li className="text-hx-bad">{revError}</li>}
            {!revisions && !revError && <li className="text-hx-faint">Chargement…</li>}
            {revisions?.map((r) => (
              <li key={r.id} className="rounded-lg border border-hx-line px-3 py-2.5">
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className={`font-semibold ${r.status === 'appliquee' ? 'text-hx-ok' : r.status === 'proposee' ? 'text-hx-warn' : 'text-hx-bad'}`}>
                    {r.kind === 'creation' ? 'CRÉATION' : r.status === 'appliquee' ? `RÉVISION ${r.revision ?? ''}` : r.status === 'proposee' ? 'PROPOSÉE' : 'REFUSÉE'}
                  </span>
                  <span className="text-hx-faint">{fmtDate(r.created_at)} · {nameOf(r.author)}</span>
                </div>
                <div className="mt-1">{r.reason}</div>
                {Object.keys(r.changes).length > 0 && (
                  <ul className="m-0 mt-1.5 list-none p-0 font-mono text-[11.5px] text-hx-dim">
                    {(Object.entries(r.changes) as [string, { old: unknown; new: unknown }][]).map(([k, v]) => (
                      <li key={k}>{FIELD_LABELS[k] || k} : {r.kind === 'creation' ? fmtValue(k, v?.new) : `${fmtValue(k, v?.old)} → ${fmtValue(k, v?.new)}`}</li>
                    ))}
                  </ul>
                )}
                {r.decision_note && <div className="mt-1 text-[12px] text-hx-faint">Décision : {r.decision_note}</div>}
              </li>
            ))}
          </ol>
        )}

        {tab === 'modifier' && (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-hx-line px-3 py-2 text-[12.5px] text-hx-dim">
              {isAdmin
                ? 'Administrateur : la modification est appliquée immédiatement et enregistrée dans l’historique avec votre justification.'
                : 'Agent : votre modification est enregistrée comme proposition ; un administrateur la vérifie avant de l’appliquer.'}{' '}
              Le contour et les unités se corrigent plus bas.
            </div>
            {EDITABLE_FIELDS.map((k) => (
              <label key={k} className="flex flex-col gap-1">
                <span className="text-[12px] text-hx-dim">{FIELD_LABELS[k]}{k in changes && <span className="ml-1.5 text-hx-warn">· modifié</span>}</span>
                {FIELD_INPUT[k] === 'type' ? (
                  <select value={String(value(k))} onChange={(e) => set(k, e.target.value)} className="h-9 rounded-lg border border-hx-line2 bg-hx-base/60 px-2.5 text-[13px] outline-none focus:border-hx-accent">
                    {Object.entries(typeLabel).map(([t, l]) => <option key={t} value={t}>{l}</option>)}
                  </select>
                ) : FIELD_INPUT[k] === 'status' ? (
                  <select value={String(value(k))} onChange={(e) => set(k, e.target.value)} className="h-9 rounded-lg border border-hx-line2 bg-hx-base/60 px-2.5 text-[13px] outline-none focus:border-hx-accent">
                    <option value="actif">Actif</option>
                    <option value="conteste">Contesté</option>
                    <option value="inactif">Retiré (inactif)</option>
                  </select>
                ) : (
                  <input type={FIELD_INPUT[k] === 'number' ? 'number' : 'text'} min={0} value={String(value(k))} onChange={(e) => set(k, e.target.value)} className="h-9 rounded-lg border border-hx-line2 bg-hx-base/60 px-2.5 text-[13px] outline-none focus:border-hx-accent" />
                )}
              </label>
            ))}
            <div className="rounded-lg border border-hx-line px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold">Contour {pendingContour && <span className="ml-1 font-normal text-hx-warn">· modifié</span>}</span>
                <span className="flex gap-1.5">
                  {pendingContour && <button type="button" onClick={onClearContour} className="h-8 rounded-md border border-hx-line2 px-2.5 text-[12px]">Annuler le nouveau contour</button>}
                  <button type="button" onClick={onStartContour} className="h-8 rounded-md border border-hx-line2 px-2.5 text-[12px] transition hover:bg-hx-hover/40">{pendingContour ? 'Retracer' : 'Retracer le contour…'}</button>
                </span>
              </div>
              <div className="mt-1 text-[12px] text-hx-dim">
                {pendingContour ? `Nouveau contour : ${Math.round(newArea).toLocaleString('fr-FR')} m² (actuel : ${Math.round(oldArea).toLocaleString('fr-FR')} m²). Il doit recouvrir l’ancien.` : `Actuel : ${Math.round(oldArea).toLocaleString('fr-FR')} m². Un clic par angle, double-clic pour terminer.`}
              </div>
            </div>
            {!b.has_courtyard && unitsDraft && (
              <div className="rounded-lg border border-hx-line px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold">Unités ({unitsDraft.length}) {unitsChanged && <span className="ml-1 font-normal text-hx-warn">· modifiées</span>}</span>
                  <button type="button" onClick={() => setUnitsDraft((l) => [...(l ?? []), { code: `U${(l?.length ?? 0) + 1}`, floor_label: null, door: null, kind: 'logement', sort: l?.length ?? 0 }])} className="h-8 rounded-md border border-hx-line2 px-2.5 text-[12px] transition hover:bg-hx-hover/40">+ Ajouter</button>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[12px] text-hx-dim">
                  <span>Générer</span>
                  <input type="number" min={1} max={20} value={perFloor} onChange={(e) => setPerFloor(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} className="h-8 w-14 rounded-md border border-hx-line2 bg-hx-base/60 px-2 text-[12.5px]" />
                  <span>unités par niveau d’après les {b.floor_count + 1} niveau(x)</span>
                  <button type="button" onClick={() => { const lv = levelIds(b.floor_count); setUnitsDraft(buildUnits({ levels: lv, isSubdivided: true, unitsPerFloor: Object.fromEntries(lv.map((l) => [l, perFloor])), buildingType: b.building_type })); }} className="h-8 rounded-md border border-hx-line2 px-2.5 text-[12px] transition hover:bg-hx-hover/40">Générer</button>
                  <button type="button" onClick={() => setUnitsDraft([{ code: 'UNIQUE', floor_label: null, door: null, kind: b.building_type === 'R' ? 'maison' : 'autre', sort: 0 }])} className="h-8 rounded-md border border-hx-line2 px-2.5 text-[12px] transition hover:bg-hx-hover/40">Unité unique</button>
                </div>
                <ul className="m-0 mt-2 flex max-h-[180px] list-none flex-col gap-1.5 overflow-y-auto p-0">
                  {unitsDraft.map((u, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <input aria-label={`Code de l’unité ${i + 1}`} value={u.code} onChange={(e) => setUnitsDraft((l) => l!.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))} className="h-8 min-w-0 flex-1 rounded-md border border-hx-line2 bg-hx-base/60 px-2 font-mono text-[12px]" />
                      <select aria-label={`Nature de l’unité ${i + 1}`} value={u.kind} onChange={(e) => setUnitsDraft((l) => l!.map((x, j) => (j === i ? { ...x, kind: e.target.value as UnitInput['kind'] } : x)))} className="h-8 rounded-md border border-hx-line2 bg-hx-base/60 px-1.5 text-[12px]">
                        <option value="logement">Logement</option><option value="commerce">Commerce</option><option value="maison">Maison</option><option value="bureau">Bureau</option><option value="autre">Autre</option>
                      </select>
                      <button type="button" aria-label={`Retirer l’unité ${i + 1}`} onClick={() => setUnitsDraft((l) => l!.filter((_, j) => j !== i))} className="h-8 w-8 rounded-md text-hx-bad hover:bg-hx-bad/10">✕</button>
                    </li>
                  ))}
                </ul>
                <div className="mt-1.5 text-[11.5px] text-hx-faint">Une unité retirée est désactivée (l’historique reste) ; les résidents qui l’avaient choisie devront en choisir une autre.</div>
              </div>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-[12.5px] font-semibold">Justification <span className="font-normal text-hx-faint">(obligatoire, {REASON_MIN} caractères au moins)</span></span>
              <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. visite terrain du 6 octobre : le bâtiment a deux étages, pas un." className="resize-none rounded-lg border border-hx-line2 bg-hx-base/60 px-3 py-2 text-[13px] outline-none focus:border-hx-accent" />
            </label>
            {nChanges > 0 && (
              <div className="rounded-lg bg-hx-base/50 px-3 py-2 font-mono text-[11.5px] text-hx-dim">
                {Object.entries(changes).map(([k, v]) => (
                  <div key={k}>{FIELD_LABELS[k] ?? k} : {k === 'geom' || k === 'courtyard_geom' ? `${Math.round(oldArea)} m² → ${fmtValue(k, v)}` : k === 'units' ? fmtValue(k, v) : `${fmtValue(k, (b as any)[k])} → ${fmtValue(k, v)}`}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2 border-t border-hx-line px-4 py-3">
        {tab === 'modifier' ? (
          <>
            <button type="button" onClick={() => { setDraft({}); setReason(''); setTab('fiche'); }} className="h-10 rounded-lg border border-hx-line2 px-3.5 text-[13px]">Annuler</button>
            <button type="button" disabled={!canSubmit} onClick={submit} className="h-10 flex-1 rounded-lg bg-hx-accent text-[13.5px] font-semibold text-white disabled:opacity-40">
              {isAdmin ? `Appliquer${nChanges ? ` (${nChanges})` : ''}` : `Proposer${nChanges ? ` (${nChanges})` : ''}`}
            </button>
          </>
        ) : (
          <button type="button" onClick={onOpenRegistre} className="h-10 flex-1 rounded-lg border border-hx-line2 text-[13px] transition hover:bg-hx-hover/40">Ouvrir au registre</button>
        )}
      </div>
    </aside>
  );
};
