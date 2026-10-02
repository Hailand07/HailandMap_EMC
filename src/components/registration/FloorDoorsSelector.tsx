import React from 'react';
import { Sparkles, Compass } from 'lucide-react';

export interface GeneratedDoorOption {
  doorNumber: string;       // ex: '001', '101', '202', 'SS01', 'M01'
  positionLabel: string;    // ex: 'Droite', 'Centre', 'Gauche' ou 'Porte 1 (Droite)', etc.
  positionDetail: string;   // 'Droite (Règle d'or)', 'Centre', 'Gauche'
  isDefault?: boolean;
}

interface FloorDoorsSelectorProps {
  floorId: string; // 'RDC', 'E1', 'E2', 'SS1', 'MEZ'
  floorLabel: string;
  totalUnitsOnFloor: number;
  buildingType: string; // 'M', 'R', 'C', 'B', etc.
  selectedUnitCode: string;
  onSelectUnitCode: (code: string) => void;
  accentColor?: 'emerald' | 'amber' | 'indigo';
}

/**
 * Générateur automatique des numéros de porte selon la Règle d'Or HailandCode :
 * Numérotation de Droite vers la Gauche en faisant face au palier.
 * - RDC : 001 (Droite), 002 (Centre), 003 (Gauche)...
 * - Étage 1 : 101 (Droite), 102 (Centre), 103 (Gauche)...
 * - Étage 2 : 201 (Droite), 202 (Gauche)...
 * - Sous-Sol SS1 : SS01, SS02...
 * - Mezzanine : MEZ01, MEZ02...
 */
export function generateFloorDoors(floorId: string, count: number, buildingType?: string): GeneratedDoorOption[] {
  const safeCount = Math.max(1, count || 1);
  const options: GeneratedDoorOption[] = [];

  // Détermination du préfixe d'étage
  let prefix = '';
  if (floorId === 'RDC') {
    prefix = '0';
  } else if (floorId.startsWith('E')) {
    prefix = floorId.replace('E', '');
  } else if (floorId === 'SS1' || floorId.startsWith('SS')) {
    prefix = 'SS';
  } else if (floorId === 'MEZ') {
    prefix = 'MEZ';
  } else {
    prefix = floorId;
  }

  // Position physique selon la Règle d'Or (de Droite vers la Gauche)
  const getPositionText = (index: number, total: number) => {
    if (total === 1) return { label: 'Entrée Unique', detail: 'Unité seule sur le palier' };
    if (total === 2) {
      if (index === 0) return { label: 'Porte Droite', detail: '1ère porte à droite (Règle d\'Or)' };
      return { label: 'Porte Gauche', detail: '2ème porte à gauche' };
    }
    if (total === 3) {
      if (index === 0) return { label: 'Porte Droite', detail: '1ère porte à droite' };
      if (index === 1) return { label: 'Porte Centre', detail: 'Porte centrale' };
      return { label: 'Porte Gauche', detail: 'Porte à gauche' };
    }
    if (total === 4) {
      if (index === 0) return { label: 'Extrême Droite', detail: '1ère porte à droite' };
      if (index === 1) return { label: 'Centre Droit', detail: '2ème porte' };
      if (index === 2) return { label: 'Centre Gauche', detail: '3ème porte' };
      return { label: 'Extrême Gauche', detail: '4ème porte à gauche' };
    }
    // Général pour > 4 portes
    if (index === 0) return { label: `Porte ${index + 1} (Droite)`, detail: '1ère porte à droite' };
    if (index === total - 1) return { label: `Porte ${index + 1} (Gauche)`, detail: 'Dernière porte à gauche' };
    return { label: `Porte ${index + 1} (Centre)`, detail: `Position ${index + 1}/${total}` };
  };

  for (let i = 1; i <= safeCount; i++) {
    let doorNumber = '';
    const index0 = i - 1;

    if (floorId === 'RDC') {
      // 001, 002, 003... ou C01 si pur commerce direct
      doorNumber = buildingType === 'C' ? `C0${i}` : `00${i}`.slice(-3);
    } else if (floorId.startsWith('E')) {
      // Étage 1 -> 101, 102; Étage 2 -> 201, 202...
      const numPart = `0${i}`.slice(-2);
      doorNumber = `${prefix}${numPart}`;
    } else if (floorId.startsWith('SS')) {
      doorNumber = `SS0${i}`.slice(-4);
    } else if (floorId === 'MEZ') {
      doorNumber = `MEZ0${i}`.slice(-5);
    } else {
      doorNumber = `${floorId}-${i}`;
    }

    const pos = getPositionText(index0, safeCount);
    options.push({
      doorNumber,
      positionLabel: pos.label,
      positionDetail: pos.detail,
      isDefault: i === 1
    });
  }

  return options;
}

export default function FloorDoorsSelector({
  floorId,
  floorLabel,
  totalUnitsOnFloor,
  buildingType,
  selectedUnitCode,
  onSelectUnitCode,
  accentColor = 'emerald'
}: FloorDoorsSelectorProps) {
  const doors = generateFloorDoors(floorId, totalUnitsOnFloor, buildingType);

  const colors = {
    emerald: {
      activeCard: 'bg-emerald-950/80 border-emerald-500 text-white shadow-lg shadow-emerald-500/20 ring-1 ring-emerald-400',
      inactiveCard: 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900',
      badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      activeNumber: 'text-emerald-300'
    },
    amber: {
      activeCard: 'bg-amber-950/80 border-amber-500 text-white shadow-lg shadow-amber-500/20 ring-1 ring-amber-400',
      inactiveCard: 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900',
      badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      activeNumber: 'text-amber-300'
    },
    indigo: {
      activeCard: 'bg-indigo-950/80 border-indigo-500 text-white shadow-lg shadow-indigo-500/20 ring-1 ring-indigo-400',
      inactiveCard: 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900',
      badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
      activeNumber: 'text-indigo-300'
    }
  }[accentColor];

  return (
    <div className="space-y-3">
      {/* Règle d'Or en rappel contextuel */}
      <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px]">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-slate-300">
            <strong>Règle d'Or :</strong> Portes ordonnées de <strong>Droite ➔ Gauche</strong> face au palier
          </span>
        </div>
        <span className="font-mono font-bold text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800">
          {totalUnitsOnFloor} {totalUnitsOnFloor > 1 ? 'unités' : 'unité'}
        </span>
      </div>

      {/* Grille dynamique des portes calculées */}
      <div className={`grid gap-2.5 ${doors.length === 1 ? 'grid-cols-1' : doors.length === 2 ? 'grid-cols-2' : doors.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
        {doors.map((door, idx) => {
          const isSelected = selectedUnitCode === door.doorNumber;
          return (
            <button
              key={door.doorNumber}
              type="button"
              id={`door-select-${door.doorNumber}`}
              onClick={() => onSelectUnitCode(door.doorNumber)}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative group flex flex-col justify-between min-h-[90px] ${
                isSelected ? colors.activeCard : colors.inactiveCard
              }`}
            >
              {/* Header de la carte : Numéro d'ordre visuel (1..n) & Badge */}
              <div className="flex items-center justify-between w-full">
                <span className="text-[10px] font-mono text-slate-400 font-bold">
                  #{idx + 1}
                </span>
                {idx === 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold bg-amber-950/60 text-amber-300 border border-amber-500/30">
                    1ère à Droite
                  </span>
                )}
                {idx === doors.length - 1 && doors.length > 1 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold bg-indigo-950/60 text-indigo-300 border border-indigo-500/30">
                    Gauche
                  </span>
                )}
              </div>

              {/* Code Porte en grand (ex: Porte 201) */}
              <div className="my-1">
                <div className="text-sm font-mono font-extrabold flex items-center gap-1.5">
                  <span className="text-xs text-slate-400 font-sans font-normal">Porte</span>
                  <span className={isSelected ? colors.activeNumber : 'text-white'}>
                    {door.doorNumber}
                  </span>
                </div>
                <div className="text-[10.5px] font-medium text-slate-300 truncate">
                  {door.positionLabel}
                </div>
              </div>

              {/* Sous-texte indicatif */}
              <div className="text-[9px] text-slate-400 truncate">
                {door.positionDetail}
              </div>

              {/* Indicateur de sélection active */}
              {isSelected && (
                <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-emerald-500/40" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
