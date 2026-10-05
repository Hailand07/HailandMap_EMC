import React from 'react';
import type { Building } from '../../types';

const STATUS: Record<string, { label: string; text: string; dot: string }> = {
  actif: { label: 'Actif', text: 'text-hx-ok', dot: 'bg-hx-ok' },
  en_attente: { label: 'En attente', text: 'text-hx-warn', dot: 'bg-hx-warn' },
  conteste: { label: 'Contesté', text: 'text-hx-bad', dot: 'bg-hx-bad' },
  non_reclame: { label: 'Non réclamé', text: 'text-hx-violet', dot: 'bg-hx-violet' },
  inactif: { label: 'Inactif', text: 'text-hx-faint', dot: 'bg-hx-faint' },
};

export const StatusDot: React.FC<{ status: string }> = ({ status }) => {
  const s = STATUS[status] ?? STATUS.inactif;
  return (
    <span className={`inline-flex items-center gap-1.5 ${s.text}`}>
      <span className={`h-[7px] w-[7px] rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
};

export const natureOf = (b: Building) => (b.has_courtyard ? 'Concession' : b.parent_building_id ? 'Bâtiment de concession' : 'Bâtiment direct');
export const levelsOf = (b: Building) => (b.floor_count === 0 ? 'RDC' : `R+${b.floor_count}`);
export const typeLabel: Record<string, string> = { R: 'Résidentiel', C: 'Commercial', M: 'Mixte', A: 'Administratif', H: 'Hébergement', P: 'Public', T: 'Temporaire' };
export const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

