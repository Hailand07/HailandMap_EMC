import React from 'react';
import type { Declaration } from '../../lib/attachment';
import { adminNamesById } from '../../lib/administrativeAddressingService';
import { fmtDate, typeLabel } from '../common/status';

interface Props {
  origin: 'certification' | 'osm' | 'nouveau';
  declaration: Declaration | null;
  onCancelCertification: () => void;
}

/**
 * Bandeau en tête de l'assistant : dit à l'agent QUEL type d'enregistrement il fait.
 * - Certification demandée par un résident (NavigationX) : la demande, ce que le résident a indiqué (à vérifier), et la conséquence.
 * - Bâtiment OSM repris : emprise et adresse déjà connues.
 * - Nouveau tracé : terrain vide.
 */
export const RegistrationBanner: React.FC<Props> = ({ origin, declaration: d, onCancelCertification }) => {
  // Téléphone : la demande du résident est repliée sur une ligne (« Détails » pour la lire en entier).
  const [open, setOpen] = React.useState(false);
  if (origin === 'certification' && d) {
    const n = adminNamesById(d.quartier_id, d.commune_id);
    const facts = [
      d.declared_building_type && (typeLabel[d.declared_building_type] ?? d.declared_building_type),
      d.declared_floor_count != null && (d.declared_floor_count <= 1 ? 'plain-pied' : `R+${d.declared_floor_count - 1}`),
      d.declared_units_per_floor != null && `${d.declared_units_per_floor} unité(s) par niveau`,
      (d.location_floor || d.location_door) && `emplacement ${[d.location_floor, d.location_door].filter(Boolean).join(' · ')}`,
      d.declared_landmark && `repère : ${d.declared_landmark}`,
    ].filter(Boolean) as string[];
    return (
      <div role="note" aria-label="Certification demandée" className="hx-sheet-banner shrink-0 border-b border-hx-warn/40 bg-hx-warn/10 px-[18px] py-3 text-[12.5px] text-hx-text max-md:px-4 max-md:py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold tracking-[0.08em] text-hx-warn">CERTIFICATION DEMANDÉE PAR UN RÉSIDENT</span>
          <button type="button" onClick={onCancelCertification} className="rounded-md px-2 py-0.5 text-[12px] text-hx-faint hover:bg-hx-hover hover:text-hx-text">
            Revenir à la demande
          </button>
        </div>
        <div className="mt-1 font-semibold max-md:truncate">{d.declared_label || 'Domicile'} · {[n.quartier, n.commune].filter(Boolean).join(', ') || 'adresse en cours'}</div>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-0.5 text-[12px] text-hx-accent-text md:hidden">
          {open ? 'Masquer les détails' : 'Détails de la demande'}
        </button>
        <div className={open ? '' : 'max-md:hidden'}>
        <div className="font-mono text-[11.5px] text-hx-dim">{d.hailand_code} · déclaré le {fmtDate(d.created_at)} · niveau {d.detected_level}</div>
        {facts.length > 0 && <div className="mt-1 text-hx-dim">Indiqué par le résident (à vérifier) : {facts.join(' · ')}</div>}
        <div className="mt-1.5 text-hx-dim">
          À l’enregistrement, ce bâtiment passe au <b className="text-hx-text">niveau 3</b>, garde le code <span className="font-mono">{d.hailand_code}</span> et le résident y est
          rattaché officiellement.
        </div>
        </div>
      </div>
    );
  }
  return (
    <div role="note" className="hx-sheet-banner shrink-0 border-b border-hx-line bg-hx-base/40 px-[18px] py-2 text-[12px] text-hx-dim max-md:truncate max-md:px-4 max-md:py-1.5">
      <span className="font-semibold tracking-[0.06em] text-hx-faint">NOUVEL ENREGISTREMENT</span> ·{' '}
      <span className="md:hidden">{origin === 'osm' ? 'bâtiment OSM repris (sera masqué)' : 'nouveau tracé'}</span>
      <span className="max-md:hidden">{origin === 'osm' ? 'à partir d’un bâtiment OSM (emprise et adresse déjà connues ; le bâtiment OSM sera masqué)' : 'nouveau tracé sur terrain vide'}</span>
    </div>
  );
};
