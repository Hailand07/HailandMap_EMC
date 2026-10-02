import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Box, 
  Plus, 
  Trash2, 
  ChevronRight, 
  Compass,
  Boxes,
  MapPin
} from 'lucide-react';
import type { Custom3DBuilding, Placed3DModel } from '../types';

interface Edit3DMenuProps {
  buildings3D: Custom3DBuilding[];
  isDrawing3D: boolean;
  onStartDrawing3D: () => void;
  onSelectBuilding3D: (building: Custom3DBuilding) => void;
  onDeleteBuilding3D: (buildingId: string) => void;
  onToggle3DPitch: () => void;
  currentPitch: number;
  // Nouveau : Support Placement Modèles 3D GLTF/GLB
  isPlacingModel3D?: boolean;
  onStartModel3DPlacement?: () => void;
  placed3DModels?: Placed3DModel[];
  onSelectPlaced3DModel?: (model: Placed3DModel) => void;
  onDeletePlaced3DModel?: (modelId: string) => void;
  onUpdatePlaced3DModelScale?: (modelId: string, newScale: number) => void;
}

export const Edit3DMenu: React.FC<Edit3DMenuProps> = ({
  buildings3D,
  isDrawing3D,
  onStartDrawing3D,
  onSelectBuilding3D,
  onDeleteBuilding3D,
  onToggle3DPitch,
  currentPitch,
  isPlacingModel3D = false,
  onStartModel3DPlacement,
  placed3DModels = [],
  onSelectPlaced3DModel,
  onDeletePlaced3DModel,
  onUpdatePlaced3DModelScale
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const totalEntities = buildings3D.length + placed3DModels.length;

  return (
    <div className="relative">
      {/* BOUTON ÉDIT PRINCIPAL */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl border shadow-2xl transition-all cursor-pointer select-none active:scale-95 group ${
          isOpen || isDrawing3D || isPlacingModel3D
            ? 'bg-blue-600 border-blue-400 text-white shadow-blue-500/25 ring-2 ring-blue-400/40'
            : 'bg-slate-900/95 border-slate-700/80 hover:border-blue-500/50 text-slate-200 hover:text-white hover:bg-slate-850 ring-1 ring-white/10'
        }`}
        title="Mode Édition 3D — Tracé manuel, volumes et modèles GLTF"
      >
        <Box className={`w-4 h-4 transition-transform duration-300 ${isOpen ? 'rotate-12 text-white' : 'text-blue-400 group-hover:scale-110'}`} />
        <span className="text-xs font-bold font-display uppercase tracking-wider">
          Édit
        </span>
        {totalEntities > 0 && (
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-blue-950 text-blue-300 border border-blue-400/30">
            {totalEntities}
          </span>
        )}
      </button>

      {/* MENU DÉROULANT DES ACTIONS D'ÉDITION */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full mt-2 left-0 w-80 sm:w-96 bg-slate-900/95 border border-slate-700 rounded-2xl p-3.5 shadow-2xl backdrop-blur-md z-40 space-y-3 text-left ring-1 ring-white/10 max-h-[85vh] overflow-y-auto no-scrollbar"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/20">
                  <Box className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white font-display uppercase tracking-wider">
                    Mode Édition 3D
                  </h3>
                  <p className="text-[10px] text-slate-400 font-sans">
                    Extrusion volumétrique & modèles GLTF
                  </p>
                </div>
              </div>
              <span className="text-[9px] font-mono text-blue-300 bg-blue-950 px-2 py-0.5 rounded-full border border-blue-500/30">
                Mapbox Model 3D
              </span>
            </div>

            {/* ACTION 1 : AJOUTER UN BÂTIMENT */}
            <button
              onClick={() => {
                setIsOpen(false);
                onStartDrawing3D();
              }}
              className="w-full py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-between shadow-lg shadow-blue-600/20 transition-all cursor-pointer active:scale-98 group"
            >
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-white group-hover:rotate-90 transition-transform duration-300" />
                <span>+ Ajouter un Bâtiment</span>
              </div>
              <span className="text-[10px] font-mono bg-white/20 px-2 py-0.5 rounded-full text-white">
                Tracé 3D
              </span>
            </button>

            {/* ACTION 2 : IMPORTER OBJET 3D (GLTF/GLB) */}
            {onStartModel3DPlacement && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  onStartModel3DPlacement();
                }}
                className={`w-full py-2.5 px-3.5 rounded-xl text-white font-bold text-xs flex items-center justify-between shadow-lg transition-all cursor-pointer active:scale-98 group ${
                  isPlacingModel3D
                    ? 'bg-amber-600 border border-amber-400 ring-2 ring-amber-400/40 shadow-amber-600/30'
                    : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-600/20'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Boxes className="w-4 h-4 text-white group-hover:scale-110 transition-transform duration-300" />
                  <span>+ Importer Objet 3D</span>
                </div>
                <span className="text-[10px] font-mono bg-white/20 px-2 py-0.5 rounded-full text-white flex items-center gap-1">
                  GLTF 3D
                </span>
              </button>
            )}

            {/* CONTRÔLE DE PERSPECTIVE CAMÉRA 3D */}
            <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Compass className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[11px] text-slate-300 font-medium">Vue Perspective 3D</span>
              </div>
              <button
                type="button"
                onClick={onToggle3DPitch}
                className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg transition cursor-pointer border ${
                  currentPitch > 10
                    ? 'bg-blue-600 border-blue-400 text-white shadow-sm'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                {currentPitch > 10 ? '3D Active (50°)' : 'Plat (0°)'}
              </button>
            </div>

            {/* LISTE DES OBJETS 3D GLTF PLACÉS */}
            {placed3DModels.length > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
                <div className="flex items-center justify-between text-[10px] font-mono text-emerald-400 px-1">
                  <span className="font-bold flex items-center gap-1">
                    <Boxes className="w-3 h-3" /> OBJETS 3D GLTF ({placed3DModels.length})
                  </span>
                  <span className="text-slate-400 font-mono">Échelle moyenne (~20m)</span>
                </div>

                <div className="max-h-44 overflow-y-auto space-y-2 pr-1 no-scrollbar">
                  {placed3DModels.map((m) => {
                    const currentScale = m.scale && m.scale > 3 ? m.scale : 20;
                    return (
                      <div
                        key={m.id}
                        onClick={() => onSelectPlaced3DModel?.(m)}
                        className="p-2.5 bg-emerald-950/20 hover:bg-emerald-950/40 rounded-xl border border-emerald-800/40 hover:border-emerald-700/60 transition cursor-pointer flex flex-col gap-2 group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0 shadow-sm" />
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-200 truncate group-hover:text-emerald-300 transition">
                                {m.name}
                              </p>
                              <p className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                                <MapPin className="w-2.5 h-2.5 text-emerald-400" />
                                {m.lat.toFixed(5)}, {m.lng.toFixed(5)}
                              </p>
                            </div>
                          </div>

                          {onDeletePlaced3DModel && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeletePlaced3DModel(m.id);
                              }}
                              className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/50 rounded-lg transition cursor-pointer border border-transparent hover:border-rose-500/30 ml-2"
                              title="Supprimer cet objet 3D"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* CONTRÔLE DE L'ÉCHELLE DU MODÈLE */}
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center justify-between pt-1 border-t border-emerald-900/30 text-[10px] font-mono text-slate-400"
                        >
                          <span className="text-slate-400">Échelle: <strong className="text-emerald-400 font-bold">{currentScale}m</strong></span>
                          {onUpdatePlaced3DModelScale && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => onUpdatePlaced3DModelScale(m.id, Math.max(5, currentScale - 5))}
                                className="w-5 h-5 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 active:scale-95 transition"
                                title="Réduire l'échelle (-5m)"
                              >
                                -
                              </button>
                              <button
                                type="button"
                                onClick={() => onUpdatePlaced3DModelScale(m.id, Math.min(60, currentScale + 5))}
                                className="w-5 h-5 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 active:scale-95 transition"
                                title="Augmenter l'échelle (+5m)"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* LISTE DES BÂTIMENTS 3D CRÉÉS */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 px-1">
                <span className="font-bold text-slate-300">BÂTIMENTS VECTORIELS ({buildings3D.length})</span>
                {buildings3D.length > 0 && <span>Étage / Hauteur</span>}
              </div>

              {buildings3D.length === 0 && placed3DModels.length === 0 ? (
                <div className="p-3.5 bg-slate-950/40 rounded-xl border border-slate-800/80 text-center text-[11px] text-slate-500 font-sans leading-relaxed">
                  Aucune entité 3D. Cliquez sur <strong className="text-blue-400">+ Ajouter un Bâtiment</strong> ou <strong className="text-emerald-400">+ Importer Objet 3D</strong>.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
                  {buildings3D.map((b, idx) => (
                    <div
                      key={`b3d-${b.id || idx}-${idx}`}
                      onClick={() => {
                        onSelectBuilding3D(b);
                      }}
                      className="p-2 bg-slate-950/60 hover:bg-slate-850 rounded-xl border border-slate-800 hover:border-slate-700 transition cursor-pointer flex items-center justify-between group"
                    >
                      {/* Clic sur le bâtiment : flyTo & zoom & highlight */}
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className="w-3 h-3 rounded-full shrink-0 shadow-sm border border-white/20"
                          style={{ backgroundColor: b.color || '#f0eee9' }}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-200 truncate group-hover:text-blue-400 transition">
                            {b.name}
                          </p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            {b.area_m2} m² · {b.floors} ét. ({b.height}m)
                          </p>
                        </div>
                      </div>

                      {/* Bouton de suppression rapide 🗑️ */}
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteBuilding3D(b.id);
                          }}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/50 rounded-lg transition cursor-pointer border border-transparent hover:border-rose-500/30"
                          title="Supprimer définitivement ce volume 3D"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

