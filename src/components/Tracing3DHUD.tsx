import React from 'react';
import { motion } from 'motion/react';
import { Box, Sparkles, Undo2, X, Check, MousePointerClick } from 'lucide-react';

interface Tracing3DHUDProps {
  pointsCount: number;
  onClosePolygon: () => void;
  onUndoPoint: () => void;
  onCancel: () => void;
  areaEstimate?: number;
}

export const Tracing3DHUD: React.FC<Tracing3DHUDProps> = ({
  pointsCount,
  onClosePolygon,
  onUndoPoint,
  onCancel,
  areaEstimate
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -25, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      className="absolute top-4 left-1/2 -translate-x-1/2 z-40 max-w-xl w-[92vw] sm:w-auto bg-slate-900/95 border border-blue-500/50 rounded-2xl p-3 px-4 shadow-2xl backdrop-blur-md ring-2 ring-blue-500/20"
    >
      <div className="flex flex-col sm:flex-row items-center gap-3">
        {/* Badge & Info */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            <Box className="w-4.5 h-4.5 animate-pulse" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white font-display uppercase tracking-wide">
                Tracé Manuel Bâtiment 3D
              </span>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-blue-950 text-blue-300 border border-blue-400/30">
                {pointsCount} sommets
              </span>
            </div>
            <p className="text-[11px] text-slate-300 font-sans leading-tight">
              {pointsCount < 3 
                ? "Cliquez sur la carte pour placer les contours du bâtiment."
                : `Polygone prêt (${areaEstimate ? `${Math.round(areaEstimate)} m²` : '3+ sommets'}). Cliquez sur Valider.`
              }
            </p>
          </div>
        </div>

        {/* Boutons d'action */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-800">
          {/* Undo */}
          <button
            type="button"
            onClick={onUndoPoint}
            disabled={pointsCount === 0}
            className={`p-2 rounded-xl border text-xs font-mono flex items-center gap-1 transition cursor-pointer ${
              pointsCount > 0
                ? 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-200 active:scale-95'
                : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
            }`}
            title="Annuler le dernier point"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Retour</span>
          </button>

          {/* Valider / Fermer polygone */}
          <button
            type="button"
            onClick={onClosePolygon}
            disabled={pointsCount < 3}
            className={`py-2 px-3.5 rounded-xl text-xs font-bold font-display flex items-center gap-1.5 transition-all shadow-md active:scale-95 ${
              pointsCount >= 3
                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/25 cursor-pointer ring-1 ring-white/20'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            <span>Fermer & Extruder</span>
          </button>

          {/* Quitter */}
          <button
            type="button"
            onClick={onCancel}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-750 border border-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
            title="Abandonner le tracé"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
};
