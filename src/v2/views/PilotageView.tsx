import React, { useMemo } from 'react';
import type { Building, Profile, Validation, Zone } from '../../types';
import { fmtDate } from '../common/status';

interface Props {
  buildings: Building[];
  zones: Zone[];
  validations: Validation[];
  profiles: Profile[];
  onGoRevue: () => void;
}

const Card: React.FC<{ label: string; value: React.ReactNode; sub: React.ReactNode; tone?: string }> = ({ label, value, sub, tone = '' }) => (
  <div className="rounded-[10px] border border-hx-line bg-hx-panel px-[18px] py-4">
    <div className="text-[12.5px] text-hx-dim">{label}</div>
    <div className={`mt-1.5 font-mono text-[30px] font-medium ${tone}`}>{value}</div>
    <div className="mt-0.5 text-[12px] text-hx-dim">{sub}</div>
  </div>
);

/** Module Pilotage (maquette) : avancement réel du cadastre, couverture par commune, équipe terrain et journal. */
export const PilotageView: React.FC<Props> = ({ buildings, zones, validations, profiles, onGoRevue }) => {
  const name = (id?: string | null) => profiles.find((p) => p.id === id)?.full_name || id || 'agent inconnu';
  const data = useMemo(() => {
    const certified = buildings.filter((b) => b.status === 'actif').length;
    const toReview = buildings.filter((b) => b.status === 'en_attente' || b.status === 'conteste').length;
    const byCommune = new Map<string, number>();
    buildings.forEach((b) => byCommune.set(b.commune || 'Non identifiée', (byCommune.get(b.commune || 'Non identifiée') ?? 0) + 1));
    const communes = [...byCommune.entries()].sort((a, b) => b[1] - a[1]);
    const agents = new Map<string, { n: number; last: string }>();
    buildings.forEach((b) => {
      const k = b.submitted_by || 'inconnu';
      const cur = agents.get(k) ?? { n: 0, last: '' };
      cur.n += 1;
      if ((b.created_at || '') > cur.last) cur.last = b.created_at || '';
      agents.set(k, cur);
    });
    const events = [
      ...validations.map((v) => ({ at: v.created_at, text: `${name(v.reviewed_by || v.validator_id)} — ${v.comment || 'décision'}`, tone: v.status === 'approved' ? 'text-hx-ok' : v.status === 'rejected' ? 'text-hx-bad' : 'text-hx-warn', tag: v.status === 'approved' ? 'certification' : v.status === 'rejected' ? 'rejet' : 'revue' })),
      ...buildings.map((b) => ({ at: b.created_at, text: `Relevé ${b.hailand_code ?? ''} par ${name(b.submitted_by)}`, tone: 'text-hx-accent-text', tag: 'relevé' })),
    ].sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 12);
    return { certified, toReview, communes, agents: [...agents.entries()].sort((a, b) => b[1].n - a[1].n), events, coveredZones: new Set(buildings.map((b) => b.zone_code).filter(Boolean)).size };
  }, [buildings, validations, profiles]);
  const max = Math.max(1, ...data.communes.map((c) => c[1]));
  const reviewsBy = (id: string) => validations.filter((v) => v.reviewed_by === id).length;

  return (
    <div className="h-full overflow-y-auto bg-hx-base px-7 py-6 text-hx-text max-md:px-3.5">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
        <div className="grid grid-cols-4 gap-3.5 max-md:grid-cols-2">
          <Card label="Fiches au registre" value={buildings.length} sub={`${buildings.filter((b) => b.has_courtyard).length} concessions · ${buildings.filter((b) => !b.has_courtyard).length} bâtiments`} />
          <Card label="Certifiées" value={data.certified} tone="text-hx-ok" sub={`${buildings.length ? Math.round((data.certified / buildings.length) * 100) : 0} % du registre`} />
          <Card label="À revoir" value={data.toReview} tone="text-hx-warn" sub={<button type="button" onClick={onGoRevue} className="text-hx-accent-text hover:underline">Ouvrir la revue</button>} />
          <Card label="Carreaux 200 m couverts" value={data.coveredZones} sub={`${zones.length} carreau${zones.length > 1 ? 'x' : ''} enregistré${zones.length > 1 ? 's' : ''}`} />
        </div>

        <div className="grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
          <section className="flex flex-col gap-3.5 rounded-[10px] border border-hx-line bg-hx-panel p-[18px]">
            <h2 className="m-0 text-[14px] font-semibold">Fiches par commune</h2>
            <div className="flex flex-col gap-3 text-[13px]">
              {data.communes.map(([c, n]) => (
                <div key={c} className="grid grid-cols-[110px_1fr_36px] items-center gap-2.5">
                  <span className="truncate">{c}</span>
                  <div className="h-2.5 overflow-hidden rounded-[3px] bg-hx-hover"><div className="h-full bg-hx-accent" style={{ width: `${(n / max) * 100}%` }} /></div>
                  <span className="text-right font-mono">{n}</span>
                </div>
              ))}
              {data.communes.length === 0 && <div className="text-hx-faint">Aucune fiche pour l’instant.</div>}
            </div>
            <div className="text-[12px] text-hx-faint">La part couverte par commune demande le nombre total de bâtiments attendus (non disponible en base).</div>
          </section>

          <section className="flex flex-col gap-3.5 rounded-[10px] border border-hx-line bg-hx-panel p-[18px]">
            <h2 className="m-0 text-[14px] font-semibold">Équipe terrain</h2>
            <table className="w-full border-collapse text-[13px]">
              <thead><tr className="text-left text-[11.5px] text-hx-dim"><th className="pb-2 font-medium">AGENT</th><th className="pb-2 font-medium">RELEVÉS</th><th className="pb-2 font-medium">REVUES</th><th className="pb-2 font-medium">DERNIÈRE ACTIVITÉ</th></tr></thead>
              <tbody>
                {data.agents.map(([id, a]) => (
                  <tr key={id}><td className="border-t border-hx-line py-2">{name(id)}</td><td className="border-t border-hx-line py-2 font-mono">{a.n}</td><td className="border-t border-hx-line py-2 font-mono">{reviewsBy(id) || '—'}</td><td className="border-t border-hx-line py-2 text-hx-dim">{fmtDate(a.last)}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <section className="flex flex-col gap-3 rounded-[10px] border border-hx-line bg-hx-panel p-[18px]">
          <h2 className="m-0 text-[14px] font-semibold">Journal</h2>
          <div className="flex flex-col text-[13px]">
            {data.events.map((e, i) => (
              <div key={i} className="grid grid-cols-[110px_1fr_auto] gap-3 border-t border-hx-line py-2.5">
                <span className="text-hx-dim">{fmtDate(e.at)}</span>
                <span className="min-w-0 truncate">{e.text}</span>
                <span className={e.tone}>{e.tag}</span>
              </div>
            ))}
            {data.events.length === 0 && <div className="text-hx-faint">Aucune activité enregistrée.</div>}
          </div>
        </section>
      </div>
    </div>
  );
};
