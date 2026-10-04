import React, { useMemo, useState } from 'react';
import type { Building, Profile } from '../../types';
import { backfillAdministrativeAddresses } from '../../lib/administrativeAddressingService';
import { reassignBuildingsToCommunes } from '../../lib/spatialReassignment';
import { exportAttestation, exportRegistryCSV, exportRegistryGeoJSON } from '../../lib/registryExports';
import { MiniMap } from '../common/MiniMap';
import { fmtDate, levelsOf, natureOf, StatusDot, typeLabel } from '../common/status';

interface Props {
  buildings: Building[];
  profiles: Profile[];
  onOpenOnMap: (b: Building) => void;
  onRefresh: () => Promise<void>;
  onNotify: (title: string, message: string, tone?: 'success' | 'warning' | 'info') => void;
}

type Row = { b: Building; depth: number };

/** Module Registre (maquette) : tableau dense avec l'arbre concession → bâtiments, filtres et fiche 360°. */
export const RegistreView: React.FC<Props> = ({ buildings, profiles, onOpenOnMap, onRefresh, onNotify }) => {
  const [q, setQ] = useState('');
  const [commune, setCommune] = useState('');
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState<'table' | 'tree'>('table');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menu, setMenu] = useState<'export' | 'maintenance' | null>(null);
  const [working, setWorking] = useState(false);

  const communes = useMemo(() => [...new Set(buildings.map((b) => b.commune).filter(Boolean))].sort(), [buildings]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return buildings.filter((b) => {
      if (commune && b.commune !== commune) return false;
      if (status && b.status !== status) return false;
      if (!needle) return true;
      return [b.hailand_code, b.admin_address_code, b.landmark_note, b.quartier, b.commune, b.formatted_address].some((v) => (v ?? '').toLowerCase().includes(needle));
    });
  }, [buildings, q, commune, status]);

  const rows = useMemo<Row[]>(() => {
    const ids = new Set(filtered.map((b) => b.id));
    const children = new Map<string, Building[]>();
    filtered.forEach((b) => {
      if (b.parent_building_id && ids.has(b.parent_building_id)) {
        const l = children.get(b.parent_building_id) ?? [];
        l.push(b);
        children.set(b.parent_building_id, l);
      }
    });
    const roots = filtered.filter((b) => !(b.parent_building_id && ids.has(b.parent_building_id)));
    const byDate = (a: Building, b: Building) => (b.created_at || '').localeCompare(a.created_at || '');
    const out: Row[] = [];
    roots.sort(byDate).forEach((r) => {
      out.push({ b: r, depth: 0 });
      (children.get(r.id) ?? []).sort((a, b) => (a.hailand_code ?? '').localeCompare(b.hailand_code ?? '')).forEach((c) => out.push({ b: c, depth: 1 }));
    });
    return mode === 'tree' ? out : [...filtered].sort(byDate).map((b) => ({ b, depth: 0 }));
  }, [filtered, mode]);

  const selected = buildings.find((b) => b.id === selectedId) ?? null;
  const authorName = (b: Building) => profiles.find((p) => p.id === b.submitted_by)?.full_name || b.submitted_by || '—';
  const counts = {
    mothers: buildings.filter((b) => b.has_courtyard).length,
    children: buildings.filter((b) => b.parent_building_id).length,
  };

  const runBackfill = async () => {
    setMenu(null);
    setWorking(true);
    try {
      const res = await backfillAdministrativeAddresses(buildings);
      await onRefresh();
      onNotify('Adressage administratif synchronisé', `${res.updatedCount} fiche(s) mise(s) à jour sur ${res.enrichedBuildings.length} analysées.`, 'success');
    } catch (e: any) {
      onNotify('Synchronisation impossible', e?.message || 'Erreur inconnue', 'warning');
    } finally {
      setWorking(false);
    }
  };
  const runAudit = async () => {
    setMenu(null);
    setWorking(true);
    try {
      const rep: any = await reassignBuildingsToCommunes({ buildings, onProgress: () => {} });
      if (rep.reassignedCount > 0) await onRefresh();
      onNotify('Audit spatial terminé', `${rep.reassignedCount ?? 0} fiche(s) rattachée(s) à une autre commune.`, rep.reassignedCount ? 'warning' : 'success');
    } catch (e: any) {
      onNotify('Audit impossible', e?.message || 'Erreur inconnue', 'warning');
    } finally {
      setWorking(false);
    }
  };

  const th = 'border-b border-hx-line px-3 py-2.5 text-left text-[11.5px] font-medium tracking-wide text-hx-dim';
  const td = 'border-b border-hx-line px-3 py-2.5';

  return (
    <div className="flex h-full min-h-0 bg-hx-base text-hx-text">
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="relative flex flex-wrap items-center gap-2.5 border-b border-hx-line px-[18px] py-3.5">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Code, quartier, repère, adresse…"
            aria-label="Rechercher au registre"
            className="h-[34px] min-w-[260px] flex-1 rounded-lg border border-hx-line2 bg-hx-base/60 px-3 text-[13px] outline-none placeholder:text-hx-faint focus:border-hx-accent"
          />
          <select value={commune} onChange={(e) => setCommune(e.target.value)} aria-label="Commune" className="h-[34px] rounded-lg border border-hx-line2 bg-hx-card px-2.5 text-[12.5px]">
            <option value="">Toutes les communes</option>
            {communes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Statut" className="h-[34px] rounded-lg border border-hx-line2 bg-hx-card px-2.5 text-[12.5px]">
            <option value="">Tous les statuts</option>
            <option value="actif">Actif</option>
            <option value="en_attente">En attente</option>
            <option value="conteste">Contesté</option>
            <option value="non_reclame">Non réclamé</option>
            <option value="inactif">Inactif</option>
          </select>
          <div className="flex gap-0.5 rounded-lg border border-hx-line bg-hx-panel p-[3px]">
            {(['table', 'tree'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={`h-7 rounded-md px-2.5 text-[12.5px] ${mode === m ? 'bg-hx-hover font-semibold' : 'text-hx-dim'}`}>{m === 'table' ? 'Tableau' : 'Arbre'}</button>
            ))}
          </div>
          <div className="relative">
            <button type="button" onClick={() => setMenu(menu === 'export' ? null : 'export')} className="h-[34px] rounded-lg border border-hx-line2 px-3 text-[12.5px] transition hover:bg-hx-hover/40">Exporter ▾</button>
            {menu === 'export' && (
              <div className="absolute right-0 top-10 z-20 w-44 overflow-hidden rounded-lg border border-hx-line2 bg-hx-bar shadow-xl">
                <button type="button" onClick={() => { exportRegistryCSV(filtered); setMenu(null); }} className="block w-full px-3 py-2 text-left text-[13px] hover:bg-hx-hover">CSV</button>
                <button type="button" onClick={() => { exportRegistryGeoJSON(filtered); setMenu(null); }} className="block w-full px-3 py-2 text-left text-[13px] hover:bg-hx-hover">GeoJSON</button>
              </div>
            )}
          </div>
          <div className="relative">
            <button type="button" onClick={() => setMenu(menu === 'maintenance' ? null : 'maintenance')} disabled={working} className="h-[34px] rounded-lg border border-hx-line2 px-3 text-[12.5px] transition hover:bg-hx-hover/40 disabled:opacity-40">{working ? 'En cours…' : 'Maintenance ▾'}</button>
            {menu === 'maintenance' && (
              <div className="absolute right-0 top-10 z-20 w-64 overflow-hidden rounded-lg border border-hx-line2 bg-hx-bar shadow-xl">
                <button type="button" onClick={runBackfill} className="block w-full px-3 py-2 text-left text-[13px] hover:bg-hx-hover">Synchroniser l’adressage État<span className="block text-[11.5px] text-hx-faint">Écrit les adresses administratives en base</span></button>
                <button type="button" onClick={runAudit} className="block w-full px-3 py-2 text-left text-[13px] hover:bg-hx-hover">Audit spatial des communes<span className="block text-[11.5px] text-hx-faint">Rattache chaque fiche à la bonne commune</span></button>
              </div>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead className="sticky top-0 z-10 bg-hx-base">
              <tr>
                <th className={`${th} pl-[18px]`}>CODE</th><th className={th}>CODE ADMINISTRATIF</th><th className={th}>NATURE</th><th className={th}>QUARTIER</th><th className={th}>STATUT</th><th className={`${th} pr-[18px]`}>CRÉÉ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ b, depth }) => (
                <tr key={b.id} onClick={() => setSelectedId(b.id)} className={`cursor-pointer transition hover:bg-hx-hover/30 ${selectedId === b.id ? 'bg-hx-accent-soft' : ''}`}>
                  <td className={`${td} pl-[18px] font-mono ${depth ? 'pl-[38px]' : ''} text-hx-accent-text`}>{depth ? '↳ ' : ''}{b.hailand_code}</td>
                  <td className={`${td} font-mono text-hx-dim`}>{b.admin_address_code || '—'}</td>
                  <td className={td}>{b.has_courtyard ? `Concession · ${buildings.filter((x) => x.parent_building_id === b.id).length} bât.` : `${typeLabel[b.building_type] ?? b.building_type} · ${levelsOf(b)}`}</td>
                  <td className={td}>{b.quartier || '—'}</td>
                  <td className={td}><StatusDot status={b.status} /></td>
                  <td className={`${td} pr-[18px] text-hx-dim`}>{fmtDate(b.created_at)}</td>
                </tr>
              ))}
              {rows.length === 0 && (<tr><td colSpan={6} className="px-[18px] py-10 text-center text-hx-faint">Aucune fiche ne correspond aux filtres.</td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="flex h-10 shrink-0 items-center border-t border-hx-line px-[18px] text-[12.5px] text-hx-dim">
          {filtered.length} fiche{filtered.length > 1 ? 's' : ''} affichée{filtered.length > 1 ? 's' : ''} sur {buildings.length} · {counts.mothers} concessions · {counts.children} bâtiments de concession
        </div>
      </main>

      {selected && (
        <aside aria-label="Fiche 360°" className="flex w-[380px] shrink-0 flex-col border-l border-hx-line bg-hx-panel max-md:fixed max-md:inset-x-0 max-md:bottom-14 max-md:z-[45] max-md:h-[60vh] max-md:w-auto max-md:rounded-t-2xl max-md:border-l-0 max-md:border-t max-md:shadow-[0_-12px_32px_rgba(0,0,0,0.45)]">
          <div className="flex items-start justify-between gap-2.5 border-b border-hx-line px-[18px] py-4">
            <div>
              <div className="text-[11px] tracking-[0.08em] text-hx-faint">{natureOf(selected).toUpperCase()}</div>
              <div className="mt-1 font-mono text-[15px] text-hx-accent-text">{selected.hailand_code}</div>
              <div className="mt-0.5 text-[13px] text-hx-dim">{[selected.quartier, selected.commune].filter(Boolean).join(' · ')}</div>
            </div>
            <button type="button" onClick={() => setSelectedId(null)} aria-label="Fermer la fiche" className="h-[30px] w-[30px] rounded-md text-hx-faint transition hover:bg-hx-hover hover:text-hx-text">✕</button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-[18px]">
            <MiniMap focus={selected} all={buildings} radius={70} className="rounded-lg" />
            <dl className="m-0 grid grid-cols-[120px_1fr] gap-y-2.5 text-[13px]">
              <dt className="text-hx-dim">Statut</dt><dd className="m-0"><StatusDot status={selected.status} /></dd>
              {selected.admin_address_code && (<><dt className="text-hx-dim">Code administratif</dt><dd className="m-0 font-mono text-[12px]">{selected.admin_address_code}</dd></>)}
              <dt className="text-hx-dim">Type</dt><dd className="m-0">{typeLabel[selected.building_type] ?? selected.building_type} · {levelsOf(selected)}</dd>
              <dt className="text-hx-dim">Unités</dt><dd className="m-0">{selected.unit_count}</dd>
              {selected.entry_point_note && (<><dt className="text-hx-dim">Entrée</dt><dd className="m-0">{selected.entry_point_note}</dd></>)}
              {selected.landmark_note && (<><dt className="text-hx-dim">Repère</dt><dd className="m-0">{selected.landmark_note}</dd></>)}
              {selected.door_color && (<><dt className="text-hx-dim">Porte</dt><dd className="m-0">{selected.door_color}</dd></>)}
              {selected.intercom_code && (<><dt className="text-hx-dim">Interphone</dt><dd className="m-0">{selected.intercom_code}</dd></>)}
              {selected.access_note && (<><dt className="text-hx-dim">Consignes</dt><dd className="m-0">{selected.access_note}</dd></>)}
              <dt className="text-hx-dim">Certifié</dt><dd className="m-0">{selected.validated_at ? `${fmtDate(selected.validated_at)} · ${profiles.find((p) => p.id === selected.validated_by)?.full_name || selected.validated_by || '—'}` : '—'}</dd>
              <dt className="text-hx-dim">Relevé par</dt><dd className="m-0">{authorName(selected)}</dd>
            </dl>
          </div>
          <div className="flex gap-2 border-t border-hx-line px-[18px] py-3.5">
            <button type="button" onClick={() => onOpenOnMap(selected)} className="h-[38px] flex-1 rounded-lg bg-hx-accent text-[13.5px] font-semibold text-white transition hover:brightness-110">Voir dans l’Atelier</button>
            <button type="button" onClick={() => exportAttestation(selected)} className="h-[38px] rounded-lg border border-hx-line2 px-3.5 text-[13px] transition hover:bg-hx-hover/40">Attestation</button>
          </div>
        </aside>
      )}
    </div>
  );
};
