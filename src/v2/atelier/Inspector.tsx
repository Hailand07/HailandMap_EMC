import React, { useMemo } from 'react';
import * as turf from '@turf/turf';
import type { Building } from '../../types';
import { TOOLS, type AtelierTool } from '../../shell/AtelierShell';

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  actif: { label: 'Actif · certifié', cls: 'text-hx-ok bg-hx-ok/10' },
  en_attente: { label: 'En attente', cls: 'text-hx-warn bg-hx-warn/10' },
  conteste: { label: 'Contesté', cls: 'text-hx-bad bg-hx-bad/10' },
  non_reclame: { label: 'Non réclamé', cls: 'text-hx-violet bg-hx-violet/10' },
  inactif: { label: 'Inactif', cls: 'text-hx-faint bg-hx-hover' },
};

const Stat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-lg bg-hx-card px-3 py-2.5">
    <div className="text-[11.5px] text-hx-faint">{label}</div>
    <div className="mt-0.5 font-mono text-[15px]">{value}</div>
  </div>
);

const Head: React.FC<{ kicker: string; title: string; sub?: string; badge?: React.ReactNode }> = ({ kicker, title, sub, badge }) => (
  <div className="flex flex-col gap-2 border-b border-hx-line px-[18px] pb-3.5 pt-4">
    <div className="flex items-center justify-between">
      <span className="text-[11px] tracking-[0.08em] text-hx-faint">{kicker}</span>
      {badge}
    </div>
    <div className="text-[17px] font-semibold">{title}</div>
    {sub && <div className="font-mono text-[12px] text-hx-dim">{sub}</div>}
  </div>
);

interface CandidateProps {
  coords: { latitude: number; longitude: number; geometry?: any; area?: number };
  zone: string;
  commune: string;
  buildings: Building[];
  onCreate: () => void;
  onConcession: () => void;
  onRedraw: () => void;
  onClose: () => void;
}

/** Inspecteur : bâtiment OSM sélectionné et pas encore relevé (maquette « Atelier », colonne de droite). */
export const CandidateInspector: React.FC<CandidateProps> = ({ coords, zone, commune, buildings, onCreate, onConcession, onRedraw, onClose }) => {
  const info = useMemo(() => {
    const g = coords.geometry;
    const ring = (g?.type === 'Polygon' ? g.coordinates?.[0] : g?.type === 'MultiPolygon' ? g.coordinates?.[0]?.[0] : null) as [number, number][] | null;
    let perimeter: number | null = null;
    try {
      if (ring && ring.length > 3) perimeter = Math.round(turf.length(turf.lineString(ring), { units: 'meters' }));
    } catch {
      perimeter = null;
    }
    const here = turf.point([coords.longitude, coords.latitude]);
    const neighbours = buildings.filter((b) => {
      try {
        return turf.distance(here, turf.point(b.centroid.coordinates as [number, number]), { units: 'meters' }) < 40;
      } catch {
        return false;
      }
    }).length;
    const inZone = buildings.filter((b) => b.zone_code === zone);
    const nums = inZone.map((b) => /CR(\d+)/i.exec(b.hailand_code ?? '')?.[1]).filter(Boolean).map((n) => parseInt(n as string, 10));
    return { vertices: ring ? Math.max(0, ring.length - 1) : null, perimeter, neighbours, relevés: inZone.length, nextCr: (nums.length ? Math.max(...nums) : 0) + 1 };
  }, [coords, buildings, zone]);
  return (
    <aside aria-label="Sélection" className="relative z-40 flex h-full w-[400px] shrink-0 flex-col border-l border-hx-line bg-hx-panel text-hx-text max-md:fixed max-md:inset-x-0 max-md:bottom-14 max-md:z-[45] max-md:h-[58vh] max-md:w-auto max-md:rounded-t-2xl max-md:border-l-0 max-md:border-t max-md:shadow-[0_-12px_32px_rgba(0,0,0,0.45)]">
      <Head
        kicker="SÉLECTION · BÂTIMENT OSM"
        title="Bâtiment sans fiche"
        sub={`${zone} · ${commune}`}
        badge={<span className="rounded-md bg-hx-violet/10 px-2 py-0.5 text-[11.5px] font-semibold text-hx-violet">Non relevé</span>}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-[18px]">
        <div className="grid grid-cols-2 gap-2.5">
          <Stat label="Surface" value={coords.area ? `${Math.round(coords.area)} m²` : '—'} />
          <Stat label="Périmètre" value={info.perimeter !== null ? `${info.perimeter} m` : '—'} />
          <Stat label="Sommets" value={info.vertices ?? '—'} />
          <Stat label="Voisins relevés" value={info.neighbours} />
        </div>
        <div className="flex flex-col gap-2">
          <div className="text-[12px] text-hx-dim">Que voulez-vous faire ?</div>
          <button type="button" onClick={onCreate} className="flex h-[42px] items-center justify-between rounded-lg bg-hx-accent px-3.5 text-[14px] font-semibold text-white transition hover:brightness-110">
            Créer la fiche de ce bâtiment <span className="font-mono text-[11.5px] opacity-75">B</span>
          </button>
          <button type="button" onClick={onConcession} className="flex h-10 items-center justify-between rounded-lg border border-hx-line2 px-3.5 text-[13.5px] transition hover:bg-hx-hover/40">
            C’est une concession : tracer l’enceinte <span className="font-mono text-[11.5px] text-hx-faint">C</span>
          </button>
          <button type="button" onClick={onRedraw} className="flex h-10 items-center justify-between rounded-lg border border-hx-line2 px-3.5 text-[13.5px] transition hover:bg-hx-hover/40">
            Corriger le contour <span className="font-mono text-[11.5px] text-hx-faint">P</span>
          </button>
          <button type="button" onClick={onClose} className="h-9 rounded-lg text-[13px] text-hx-faint transition hover:text-hx-text">
            Désélectionner
          </button>
        </div>
        <div className="flex flex-col gap-2 border-t border-hx-line pt-3.5">
          <div className="text-[12px] text-hx-dim">Dans ce carreau</div>
          <div className="flex justify-between text-[13px]"><span className="text-hx-dim">Bâtiments relevés</span><span className="font-mono">{info.relevés}</span></div>
          <div className="flex justify-between text-[13px]"><span className="text-hx-dim">Prochain numéro de cour</span><span className="font-mono text-hx-accent-text">CR{String(info.nextCr).padStart(3, '0')}</span></div>
        </div>
      </div>
    </aside>
  );
};

interface BuildingInspectorProps {
  building: Building;
  onClose: () => void;
  onOpenRegistre: () => void;
}

/** Inspecteur : fiche d'un bâtiment déjà au registre. */
export const BuildingInspector: React.FC<BuildingInspectorProps> = ({ building: b, onClose, onOpenRegistre }) => {
  const st = STATUS_LABEL[b.status] ?? STATUS_LABEL.inactif;
  const row = (k: string, v: React.ReactNode) => (
    <>
      <dt className="text-hx-dim">{k}</dt>
      <dd className="m-0">{v}</dd>
    </>
  );
  return (
    <aside aria-label="Fiche du bâtiment" className="relative z-40 flex h-full w-[400px] shrink-0 flex-col border-l border-hx-line bg-hx-panel text-hx-text max-md:fixed max-md:inset-x-0 max-md:bottom-14 max-md:z-[45] max-md:h-[58vh] max-md:w-auto max-md:rounded-t-2xl max-md:border-l-0 max-md:border-t max-md:shadow-[0_-12px_32px_rgba(0,0,0,0.45)]">
      <Head
        kicker={b.has_courtyard ? 'CONCESSION' : b.parent_building_id ? 'BÂTIMENT DE CONCESSION' : 'BÂTIMENT'}
        title={b.landmark_note || `Bâtiment ${b.building_type}`}
        sub={b.hailand_code ?? undefined}
        badge={<span className={`rounded-md px-2 py-0.5 text-[11.5px] font-semibold ${st.cls}`}>{st.label}</span>}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-[18px]">
        <dl className="m-0 grid grid-cols-[120px_1fr] gap-y-2.5 text-[13px]">
          {b.admin_address_code && row('Code administratif', <span className="font-mono text-[12px]">{b.admin_address_code}</span>)}
          {row('Type', b.building_type)}
          {row('Niveaux · unités', `${b.floor_count === 0 ? 'RDC' : `R+${b.floor_count}`} · ${b.unit_count}`)}
          {row('Quartier', [b.quartier, b.commune].filter(Boolean).join(', ') || '—')}
          {b.access_note && row('Accès', b.access_note)}
          {b.door_color && row('Porte', b.door_color)}
          {b.intercom_code && row('Interphone', b.intercom_code)}
          {row('Créé le', new Date(b.created_at).toLocaleDateString('fr-FR'))}
        </dl>
      </div>
      <div className="flex gap-2 border-t border-hx-line px-[18px] py-3.5">
        <button type="button" onClick={onOpenRegistre} className="h-10 flex-1 rounded-lg bg-hx-accent text-[13.5px] font-semibold text-white transition hover:brightness-110">
          Ouvrir au registre
        </button>
        <button type="button" onClick={onClose} className="h-10 rounded-lg border border-hx-line2 bg-hx-hover px-4 text-[13.5px]">
          Fermer
        </button>
      </div>
    </aside>
  );
};

interface EmptyProps {
  buildings: Building[];
  onTool: (t: AtelierTool) => void;
}

/** Inspecteur sans sélection : outils et état du registre. */
export const EmptyInspector: React.FC<EmptyProps> = ({ buildings, onTool }) => {
  const count = (s: string) => buildings.filter((b) => b.status === s).length;
  return (
    <aside aria-label="Inspecteur" className="relative z-40 flex h-full w-[400px] shrink-0 flex-col border-l border-hx-line bg-hx-panel text-hx-text max-md:hidden">
      <Head kicker="INSPECTEUR" title="Rien de sélectionné" sub="Choisissez un outil puis cliquez sur la carte" />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-[18px]">
        <div className="flex flex-col gap-2">
          {TOOLS.map((t) => (
            <button key={t.id} type="button" onClick={() => onTool(t.id)} className="flex items-center justify-between rounded-lg border border-hx-line2 px-3.5 py-2.5 text-left transition hover:bg-hx-hover/40">
              <span>
                <span className="block text-[13.5px]">{t.label}</span>
                <span className="block text-[12px] text-hx-faint">{t.hint}</span>
              </span>
              <span className="font-mono text-[11.5px] text-hx-faint">{t.key}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Stat label="Au registre" value={buildings.length} />
          <Stat label="Certifiés" value={count('actif')} />
          <Stat label="En attente" value={count('en_attente')} />
          <Stat label="Contestés" value={count('conteste')} />
        </div>
      </div>
    </aside>
  );
};
