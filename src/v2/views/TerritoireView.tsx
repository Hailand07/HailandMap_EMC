import React, { useMemo, useState } from 'react';
import type { Building, Zone } from '../../types';

interface Props {
  zones: Zone[];
  buildings: Building[];
  onOpenZoneOnMap?: (z: Zone) => void;
}

/** Module Territoire : carreaux de 200 m et couverture par commune (les carreaux sont créés automatiquement à l'enregistrement). */
export const TerritoireView: React.FC<Props> = ({ zones, buildings }) => {
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const codes = new Set<string>([...zones.map((z) => z.zone_code), ...(buildings.map((b) => b.zone_code).filter(Boolean) as string[])]);
    return [...codes]
      .map((code) => {
        const z = zones.find((x) => x.zone_code === code);
        const inZone = buildings.filter((b) => b.zone_code === code);
        const communes = [...new Set(inZone.map((b) => b.commune).filter(Boolean))];
        return { code, commune: z?.commune || communes.join(', ') || '—', total: inZone.length, certified: inZone.filter((b) => b.status === 'actif').length, pending: inZone.filter((b) => b.status === 'en_attente' || b.status === 'conteste').length };
      })
      .filter((r) => !needle || r.code.toLowerCase().includes(needle) || r.commune.toLowerCase().includes(needle))
      .sort((a, b) => b.total - a.total || a.code.localeCompare(b.code));
  }, [zones, buildings, q]);

  const th = 'border-b border-hx-line px-3 py-2.5 text-left text-[11.5px] font-medium tracking-wide text-hx-dim';
  const td = 'border-b border-hx-line px-3 py-2.5';
  return (
    <div className="flex h-full min-h-0 flex-col bg-hx-base text-hx-text">
      <div className="flex flex-wrap items-center gap-3 border-b border-hx-line px-[18px] py-3.5">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code de carreau ou commune…" aria-label="Rechercher un carreau" className="h-[34px] min-w-[260px] flex-1 rounded-lg border border-hx-line2 bg-hx-base/60 px-3 text-[13px] outline-none placeholder:text-hx-faint focus:border-hx-accent" />
        <span className="text-[12.5px] text-hx-dim">{rows.length} carreau{rows.length > 1 ? 'x' : ''} · grille de 200 m</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 bg-hx-base"><tr><th className={`${th} pl-[18px]`}>CARREAU</th><th className={th}>COMMUNE</th><th className={th}>FICHES</th><th className={th}>CERTIFIÉES</th><th className={`${th} pr-[18px]`}>À REVOIR</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className="hover:bg-hx-hover/30">
                <td className={`${td} pl-[18px] font-mono text-hx-accent-text`}>{r.code}</td>
                <td className={td}>{r.commune}</td>
                <td className={`${td} font-mono`}>{r.total}</td>
                <td className={`${td} font-mono text-hx-ok`}>{r.certified}</td>
                <td className={`${td} pr-[18px] font-mono ${r.pending ? 'text-hx-warn' : 'text-hx-faint'}`}>{r.pending}</td>
              </tr>
            ))}
            {rows.length === 0 && (<tr><td colSpan={5} className="px-[18px] py-10 text-center text-hx-faint">Aucun carreau.</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
};
