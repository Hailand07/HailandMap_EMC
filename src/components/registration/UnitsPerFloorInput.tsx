import React from 'react';
import { Layers, Plus, Minus, Sparkles, Building2 } from 'lucide-react';

export interface LevelInfo {
  id: string; // 'SS1', 'RDC', 'E1', 'E2', 'MEZ'
  label: string; // 'Sous-sol', 'Rez-de-chaussée', 'Étage 1'
  shortLabel: string; // 'SS1', 'RDC', 'E1'
  subtitle?: string;
  isSpecial?: boolean;
}

interface UnitsPerFloorInputProps {
  levels: LevelInfo[];
  unitsPerFloor: Record<string, number>;
  onChange: (updated: Record<string, number>) => void;
  accentColor?: 'amber' | 'orange' | 'emerald';
}

export default function UnitsPerFloorInput({
  levels,
  unitsPerFloor,
  onChange,
  accentColor = 'amber'
}: UnitsPerFloorInputProps) {
  // Calcul automatique de la somme totale
  const totalUnits = levels.reduce((acc, lvl) => {
    const val = unitsPerFloor[lvl.id];
    return acc + (typeof val === 'number' && !isNaN(val) ? Math.max(0, val) : 0);
  }, 0);

  const handleUnitChange = (levelId: string, value: number) => {
    const safeVal = Math.max(0, Math.min(99, Math.floor(value || 0)));
    onChange({
      ...unitsPerFloor,
      [levelId]: safeVal
    });
  };

  const handleApplyToAll = (count: number) => {
    const updated: Record<string, number> = {};
    levels.forEach(lvl => {
      updated[lvl.id] = count;
    });
    onChange(updated);
  };

  const themeColors = {
    amber: {
      border: 'border-amber-500/30',
      badgeBg: 'bg-amber-950/60',
      badgeText: 'text-amber-300',
      badgeBorder: 'border-amber-500/40',
      activeText: 'text-amber-400',
      accentBg: 'bg-amber-500',
      glow: 'shadow-amber-500/20'
    },
    orange: {
      border: 'border-orange-500/30',
      badgeBg: 'bg-orange-950/60',
      badgeText: 'text-orange-300',
      badgeBorder: 'border-orange-500/40',
      activeText: 'text-orange-400',
      accentBg: 'bg-orange-500',
      glow: 'shadow-orange-500/20'
    },
    emerald: {
      border: 'border-emerald-500/30',
      badgeBg: 'bg-emerald-950/60',
      badgeText: 'text-emerald-300',
      badgeBorder: 'border-emerald-500/40',
      activeText: 'text-emerald-400',
      accentBg: 'bg-emerald-500',
      glow: 'shadow-emerald-500/20'
    }
  }[accentColor];

  return (
    <div className="space-y-3 bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800">
      {/* En-tête : Répartition par niveau + Total dynamique */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-900">
        <div className="flex items-center gap-2">
          <Layers className={`w-4 h-4 ${themeColors.activeText}`} />
          <span className="text-xs font-bold text-white font-display">
            Saisie par niveau ({levels.length} {levels.length > 1 ? 'niveaux' : 'niveau'})
          </span>
        </div>

        {/* Somme automatique en direct */}
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl ${themeColors.badgeBg} border ${themeColors.badgeBorder}`}>
          <span className="text-[10px] text-slate-300 font-medium">Total calculé :</span>
          <span className={`font-mono font-bold text-xs ${themeColors.badgeText}`}>
            {totalUnits} {totalUnits > 1 ? 'unités' : 'unité'}
          </span>
        </div>
      </div>

      {/* Raccourcis rapides de pré-remplissage */}
      {levels.length > 1 && (
        <div className="flex items-center justify-between bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-800/80 text-[10.5px]">
          <span className="text-slate-400 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-slate-400" />
            Remplir tous les étages :
          </span>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4].map(num => (
              <button
                key={num}
                type="button"
                onClick={() => handleApplyToAll(num)}
                className="px-2 py-0.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-[10px] font-mono font-bold transition cursor-pointer"
                title={`Attribuer ${num} unité(s) à chaque niveau`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Liste verticale intelligente des étages */}
      <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
        {levels.map((lvl) => {
          const count = typeof unitsPerFloor[lvl.id] === 'number' ? unitsPerFloor[lvl.id] : 0;
          return (
            <div
              key={lvl.id}
              className="flex items-center justify-between p-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition"
            >
              {/* Badge & Nom du niveau */}
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-10 text-center font-mono font-bold text-xs py-1 rounded-lg ${lvl.id === 'RDC' ? 'bg-slate-800 text-slate-200' : 'bg-slate-950 text-slate-300'} border border-slate-800 shrink-0`}>
                  {lvl.shortLabel}
                </span>
                <div className="truncate">
                  <span className="text-xs font-semibold text-white block truncate">
                    {lvl.label}
                  </span>
                  {lvl.subtitle && (
                    <span className="text-[9px] text-slate-400 block truncate">
                      {lvl.subtitle}
                    </span>
                  )}
                </div>
              </div>

              {/* Contrôleur numérique (Stepper) */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleUnitChange(lvl.id, count - 1)}
                  disabled={count <= 0}
                  className="w-7 h-7 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 flex items-center justify-center font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  <Minus className="w-3 h-3" />
                </button>

                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={count === 0 ? '0' : count}
                    onChange={(e) => handleUnitChange(lvl.id, parseInt(e.target.value, 10) || 0)}
                    className="w-12 text-center bg-slate-950 border border-slate-700 rounded-lg py-1 text-xs font-mono font-bold text-white focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleUnitChange(lvl.id, count + 1)}
                  className="w-7 h-7 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 flex items-center justify-center font-bold text-xs transition cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                </button>

                <span className="text-[10px] text-slate-400 font-mono w-10 text-right">
                  {count > 1 ? 'unités' : 'unité'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Règle & Note explicative */}
      <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1">
        <span>* RDC commercial ou appartements par étage</span>
        <span className="font-mono text-slate-400">
          Moyenne : <strong>{(totalUnits / (levels.length || 1)).toFixed(1)} un./niv.</strong>
        </span>
      </div>
    </div>
  );
}
