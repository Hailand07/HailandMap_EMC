import React, { useMemo, useState } from 'react';
import type { Building } from '../../types';
import { declarationPoint, type Declaration } from '../../lib/attachment';
import { calculateDistance } from '../../map/geometry';
import { fmtDate, natureOf, typeLabel } from '../common/status';
import { adminNamesById } from '../../lib/administrativeAddressingService';

interface Props {
  declarations: Declaration[];
  buildings: Building[];
  error: string | null;
  onOpenPoint: (lng: number, lat: number) => void;
  onLink: (declarationId: string, buildingId: string | null) => void | Promise<void>;
  /** Lance la procédure de certification de cette demande (parcours distinct, pré-rempli, rattachement garanti). */
  onCertify: (declarationId: string) => void;
  /** Refus motivé d'une demande : le résident voit le motif dans NavigationX. */
  onRefuse: (declarationId: string, note: string) => void | Promise<void>;
}

type Filter = 'todo' | 'refused' | 'linked';

const isCertified = (b: Building) => b.status === 'actif' && b.is_validated === true;
const pretty = (id?: string | null) => (id ? id.replace(/^(qtr|com)-(osm-)?/, '').replace(/-/g, ' ') : '—');
const placeOf = (d: Declaration) => {
  const n = adminNamesById(d.quartier_id, d.commune_id);
  return [n.quartier || (d.quartier_id ? pretty(d.quartier_id) : 'quartier non identifié'), n.commune || pretty(d.commune_id)].join(', ');
};

/**
 * Onglet « Demandes » de la Revue (§16 de ECOSYSTEME_HAILAND.md) : les déclarations envoyées par NavigationX.
 * - Non rattachée : simple indice (niveau 1 ou 2), non compté ; l'agent peut créer le bâtiment (rattachement automatique) ou rattacher à un bâtiment certifié proche.
 * - Rattachée à un bâtiment certifié : rattachement officiel ; le résident choisit son emplacement dans NavigationX.
 */
export const DemandesPanel: React.FC<Props> = ({ declarations, buildings, error, onOpenPoint, onLink, onCertify, onRefuse }) => {
  const [refusing, setRefusing] = useState(false);
  const [refuseNote, setRefuseNote] = useState('');
  const [filter, setFilter] = useState<Filter>('todo');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const byId = useMemo(() => new Map(buildings.map((b) => [b.id, b])), [buildings]);
  const groups = useMemo(() => {
    const todo = declarations
      .filter((d) => !d.certified_building_id && d.certification_status !== 'refusee')
      .sort((a, b) => Number(!!b.certification_requested_at) - Number(!!a.certification_requested_at) || b.created_at.localeCompare(a.created_at));
    const refused = declarations.filter((d) => !d.certified_building_id && d.certification_status === 'refusee');
    const linked = declarations.filter((d) => d.certified_building_id);
    return { todo, refused, linked };
  }, [declarations]);
  const list = groups[filter];
  const selected = list.find((d) => d.id === selectedId) ?? list[0] ?? null;
  const point = selected ? declarationPoint(selected) : null;

  // Bâtiments certifiés les plus proches (300 m) : candidats au rattachement manuel.
  const candidates = useMemo(() => {
    if (!point) return [];
    return buildings
      .filter((b) => isCertified(b) && b.centroid?.coordinates)
      .map((b) => ({ b, dist: calculateDistance(point[1], point[0], b.centroid!.coordinates[1], b.centroid!.coordinates[0]) }))
      .filter((x) => x.dist <= 300)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 6);
  }, [buildings, point?.[0], point?.[1]]);

  const link = async (buildingId: string | null) => {
    if (!selected) return;
    setBusy(true);
    await onLink(selected.id, buildingId);
    setBusy(false);
  };

  const linkedBuilding = selected?.certified_building_id ? byId.get(selected.certified_building_id) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-1 max-md:flex-col">
      <section aria-label="Déclarations des résidents" className="flex w-[340px] shrink-0 flex-col border-r border-hx-line bg-hx-panel max-md:max-h-[40%] max-md:w-full max-md:border-b max-md:border-r-0">
        <div className="flex gap-1 border-b border-hx-line px-3.5 py-2.5">
          {(['todo', 'refused', 'linked'] as Filter[]).map((f) => (
            <button key={f} type="button" onClick={() => { setFilter(f); setSelectedId(null); }} className={`h-[28px] rounded-md px-2.5 text-[12px] transition ${filter === f ? 'bg-hx-hover font-semibold text-hx-text' : 'text-hx-dim hover:bg-hx-hover/40'}`}>
              {f === 'todo' ? `Indices · ${groups.todo.length}` : f === 'refused' ? `Refusées · ${groups.refused.length}` : `Rattachés · ${groups.linked.length}`}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error && <div className="px-4 py-3 text-[12.5px] text-hx-bad">Déclarations illisibles : {error}</div>}
          {!error && list.length === 0 && <div className="px-4 py-8 text-[13px] text-hx-faint">{filter === 'todo' ? 'Aucune déclaration en attente.' : filter === 'refused' ? 'Aucune demande refusée.' : 'Aucun rattachement officiel pour l’instant.'}</div>}
          {list.map((d) => (
            <button key={d.id} type="button" onClick={() => setSelectedId(d.id)} className={`flex w-full flex-col gap-1 border-b border-hx-line px-3.5 py-3 text-left transition hover:bg-hx-hover/30 ${selected?.id === d.id ? 'border-l-2 border-l-hx-accent bg-hx-accent-soft' : ''}`}>
              <div className="flex justify-between text-[11.5px]">
                <span className={`font-semibold ${d.certified_building_id ? 'text-hx-ok' : d.certification_requested_at ? 'text-hx-warn' : 'text-hx-dim'}`}>
                  {d.certified_building_id ? 'NIVEAU 3 · OFFICIEL' : d.certification_status === 'refusee' ? `NIVEAU ${d.detected_level} · DEMANDE REFUSÉE` : `NIVEAU ${d.detected_level}${d.certification_requested_at ? ' · VÉRIFICATION DEMANDÉE' : ''}`}
                </span>
                <span className="text-hx-faint">{fmtDate(d.created_at)}</span>
              </div>
              <div className="text-[14px]">{d.declared_label || d.declared_landmark || placeOf(d)}</div>
              <div className="font-mono text-[12px] text-hx-dim">{d.hailand_code}</div>
            </button>
          ))}
        </div>
      </section>

      {selected ? (
        <aside aria-label="Détail de la déclaration" className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-hx-panel p-[18px]">
          <div className="max-w-[560px]">
            <div className="text-[11px] tracking-[0.08em] text-hx-faint">{selected.certified_building_id ? 'RATTACHEMENT OFFICIEL' : selected.detected_level === 2 ? 'INDICE · POLYGONE OSM (NIVEAU 2)' : 'INDICE · POINT GPS (NIVEAU 1)'}</div>
            <div className="mt-1 text-[18px] font-semibold">{selected.declared_label || selected.declared_landmark || placeOf(selected)}</div>
            <div className="mt-1 font-mono text-[12.5px] text-hx-accent-text">{selected.hailand_code}</div>

            <dl className="m-0 mt-4 grid grid-cols-[150px_1fr] gap-y-2 text-[13px]">
              <dt className="text-hx-dim">Adresse</dt><dd className="m-0">{placeOf(selected)}</dd>
              <dt className="text-hx-dim">Déclaré le</dt><dd className="m-0">{fmtDate(selected.created_at)}</dd>
              {selected.declared_building_type && (<><dt className="text-hx-dim">Type indiqué</dt><dd className="m-0">{typeLabel[selected.declared_building_type] ?? selected.declared_building_type}</dd></>)}
              {selected.declared_floor_count != null && (<><dt className="text-hx-dim">Niveaux indiqués</dt><dd className="m-0">{selected.declared_floor_count === 0 ? 'RDC' : `R+${selected.declared_floor_count}`}</dd></>)}
              {selected.declared_units_per_floor != null && (<><dt className="text-hx-dim">Unités par niveau</dt><dd className="m-0">{selected.declared_units_per_floor}</dd></>)}
              {(selected.location_floor || selected.location_door) && (<><dt className="text-hx-dim">Emplacement indiqué</dt><dd className="m-0">{[selected.location_floor, selected.location_door].filter(Boolean).join(' · ')}</dd></>)}
              {selected.declared_landmark && (<><dt className="text-hx-dim">Repère</dt><dd className="m-0">{selected.declared_landmark}</dd></>)}
              {selected.declared_note && (<><dt className="text-hx-dim">Note</dt><dd className="m-0">{selected.declared_note}</dd></>)}
              {selected.certification_requested_at && (<><dt className="text-hx-dim">Vérification</dt><dd className="m-0 text-hx-warn">demandée le {fmtDate(selected.certification_requested_at)}</dd></>)}
            </dl>

            <div className="mt-4 flex gap-2">
              {!selected.certified_building_id && point && (
                <button type="button" onClick={() => onCertify(selected.id)} className="h-[34px] rounded-lg bg-hx-accent px-3.5 text-[13px] font-semibold text-white transition hover:brightness-110">
                  Certifier ce bâtiment (niveau 3)
                </button>
              )}
              {!selected.certified_building_id && selected.certification_status !== 'refusee' && (
                <button type="button" onClick={() => setRefusing((v) => !v)} className="h-[34px] rounded-lg border border-hx-bad/50 px-3.5 text-[13px] text-hx-bad transition hover:bg-hx-bad/10">
                  Refuser la demande…
                </button>
              )}
              {point && (
                <button type="button" onClick={() => onOpenPoint(point[0], point[1])} className="h-[34px] rounded-lg border border-hx-line2 px-3.5 text-[13px] transition hover:bg-hx-hover/40">
                  Voir sur la carte
                </button>
              )}
            </div>

            {selected.certification_status === 'refusee' && !selected.certified_building_id && (
              <div className="mt-4 rounded-lg border border-hx-bad/40 bg-hx-bad/5 p-3.5 text-[13px]">
                <div className="font-semibold text-hx-bad">Demande refusée le {fmtDate(selected.certification_decided_at)}</div>
                <p className="m-0 mt-1">{selected.certification_note}</p>
                <p className="m-0 mt-1.5 text-hx-dim">Le résident voit ce motif dans NavigationX et peut redemander la vérification.</p>
              </div>
            )}
            {refusing && !selected.certified_building_id && (
              <div className="mt-4 flex flex-col gap-2 rounded-lg border border-hx-line p-3.5">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold">Motif du refus <span className="font-normal text-hx-faint">(vu par le résident, 10 caractères au moins)</span></span>
                  <textarea rows={3} value={refuseNote} onChange={(e) => setRefuseNote(e.target.value)} placeholder="Ex. le bâtiment n’est pas identifiable : indiquez un repère ou refaites la localisation devant la porte." className="resize-none rounded-lg border border-hx-line2 bg-hx-base/60 px-3 py-2 text-[13px] outline-none focus:border-hx-accent" />
                </label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setRefusing(false); setRefuseNote(''); }} className="h-9 rounded-lg border border-hx-line2 px-3.5 text-[13px]">Annuler</button>
                  <button type="button" disabled={busy || refuseNote.trim().length < 10} onClick={async () => { setBusy(true); await onRefuse(selected.id, refuseNote.trim()); setBusy(false); setRefusing(false); setRefuseNote(''); }} className="h-9 flex-1 rounded-lg bg-hx-bad text-[13px] font-semibold text-white disabled:opacity-40">Confirmer le refus</button>
                </div>
              </div>
            )}
            {linkedBuilding || selected.certified_building_id ? (
              <div className="mt-5 rounded-lg border border-hx-ok/40 bg-hx-ok/5 p-3.5 text-[13px]">
                <div className="font-semibold text-hx-ok">Rattachée au bâtiment certifié</div>
                <div className="mt-1">{linkedBuilding ? `${natureOf(linkedBuilding)} · ${linkedBuilding.landmark_note || typeLabel[linkedBuilding.building_type] || ''}` : selected.certified_building_id}</div>
                <div className="mt-0.5 font-mono text-[12px] text-hx-dim">{linkedBuilding?.admin_code || '—'} <span className="text-hx-faint">(interne : {linkedBuilding?.hailand_code || '—'})</span></div>
                <div className="mt-1.5 text-hx-dim">
                  {selected.unit_id ? 'Emplacement choisi par le résident.' : 'Emplacement à choisir par le résident dans NavigationX.'}
                  {selected.link_method && ` · ${{ gps_auto: 'rattachement automatique (GPS)', retroactif: 'rattaché à la certification', agent: 'rattaché par un agent', resident: 'précisé par le résident' }[selected.link_method]}`}
                </div>
                <button type="button" disabled={busy} onClick={() => link(null)} className="mt-3 h-[32px] rounded-lg border border-hx-bad/50 px-3 text-[12.5px] text-hx-bad transition hover:bg-hx-bad/10 disabled:opacity-40">
                  Détacher
                </button>
              </div>
            ) : selected.certification_status === 'refusee' ? null : (
              <div className="mt-5 flex flex-col gap-2.5">
                <div className="rounded-lg border border-hx-line px-3.5 py-3 text-[12.5px] text-hx-dim">
                  Indice non officiel et non compté : on sait seulement que la personne se trouve {selected.detected_level === 2 ? 'dans ce bâtiment OSM' : 'à cet endroit'}.
                  « Certifier ce bâtiment » ouvre l’atelier sur sa position avec la demande affichée et pré-remplie : à l’enregistrement, la personne est rattachée officiellement, avec le même code.
                </div>
                <div className="text-[13px] font-semibold">Bâtiments certifiés à moins de 300 m</div>
                {candidates.length === 0 && <div className="text-[12.5px] text-hx-faint">Aucun : le bâtiment reste à créer.</div>}
                {candidates.map(({ b, dist }) => (
                  <div key={b.id} className="flex items-center justify-between gap-3 rounded-lg border border-hx-line px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13px]">{natureOf(b)} · {b.landmark_note || typeLabel[b.building_type] || b.building_type}</div>
                      <div className="font-mono text-[11.5px] text-hx-dim">{b.admin_code || b.hailand_code} · {Math.round(dist)} m</div>
                    </div>
                    <button type="button" disabled={busy} onClick={() => link(b.id)} className="h-[30px] shrink-0 rounded-md bg-hx-accent px-3 text-[12.5px] font-semibold text-white disabled:opacity-40">
                      Rattacher
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      ) : (
        <div className="flex flex-1 items-center justify-center text-[14px] text-hx-faint">Aucune déclaration.</div>
      )}
    </div>
  );
};
