import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Box, Layers, Trash2, X, Check, Palette, Eye,  } from 'lucide-react';
import type { Custom3DBuilding } from '../types';

interface Building3DDetailModalProps {
  building: Custom3DBuilding | null;
  onClose: () => void;
  onUpdate: (updatedBuilding: Custom3DBuilding) => void;
  onDelete: (buildingId: string) => void;
  onFlyTo: (building: Custom3DBuilding) => void;
}

const COLOR_PRESETS = [
  { label: 'Style Natif Mapbox', value: '#f0eee9', bg: 'bg-[#f0eee9] text-slate-800' },
  { label: 'Ardoise / Minéral', value: '#e2e8f0', bg: 'bg-slate-200 text-slate-800' },
  { label: 'Béton Urbain', value: '#cbd5e1', bg: 'bg-slate-300 text-slate-800' },
  { label: 'Blanc Architectural', value: '#f8fafc', bg: 'bg-slate-50 text-slate-800' },
  { label: 'Bleu Mapbox', value: '#3b82f6', bg: 'bg-blue-500 text-white' },
  { label: 'Ambre / Brique', value: '#f59e0b', bg: 'bg-amber-500 text-white' },
  { label: 'Émeraude / Végétalisé', value: '#10b981', bg: 'bg-emerald-500 text-white' },
  { label: 'Indigo Contemporain', value: '#6366f1', bg: 'bg-indigo-500 text-white' },
];

export const Building3DDetailModal: React.FC<Building3DDetailModalProps> = ({
  building,
  onClose,
  onUpdate,
  onDelete,
  onFlyTo
}) => {
  if (!building) return null;

  const [floors, setFloors] = useState<number>(building.floors);
  const [name, setName] = useState<string>(building.name);
  const [color, setColor] = useState<string>(building.color || '#3b82f6');
  const [isConfirmDelete, setIsConfirmDelete] = useState<boolean>(false);

  const heightMeters = Number((floors * 3.2).toFixed(1));

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate({
      ...building,
      name: name.trim() || building.name,
      floors,
      height: heightMeters,
      color
    });
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-white/10"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div 
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-lg"
                style={{ backgroundColor: color }}
              >
                <Box className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white font-display">
                  Inspection Bâtiment 3D
                </h3>
                <p className="text-[11px] text-slate-400 font-mono">
                  {building.id}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSave} className="p-5 space-y-4 text-left">
            {/* Info bar */}
            <div className="grid grid-cols-2 gap-2 p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs font-mono">
              <div className="space-y-0.5">
                <span className="text-[10px] text-slate-500 uppercase block">Surface au sol</span>
                <span className="text-white font-bold">{building.area_m2.toLocaleString()} m²</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] text-slate-500 uppercase block">Coordonnées</span>
                <span className="text-slate-300 text-[11px]">
                  {building.centroid[1].toFixed(5)}, {building.centroid[0].toFixed(5)}
                </span>
              </div>
            </div>

            {/* Nom */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-200 font-display">
                Nom du bâtiment
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl py-2 px-3 text-xs text-white focus:outline-none transition"
              />
            </div>

            {/* Nombre d'étages & Hauteur */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-200 font-display flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-400" />
                  Nombre d'étages
                </label>
                <div className="text-xs font-mono font-bold text-blue-400 bg-blue-950 px-2 py-0.5 rounded border border-blue-500/30">
                  {heightMeters} m
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFloors(Math.max(1, floors - 1))}
                  className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-lg flex items-center justify-center transition cursor-pointer"
                >
                  -
                </button>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={floors}
                  onChange={(e) => setFloors(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                  className="flex-1 bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl py-1.5 px-3 text-center text-base font-mono font-bold text-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setFloors(Math.min(100, floors + 1))}
                  className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-lg flex items-center justify-center transition cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            {/* Couleur */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-200 font-display flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-slate-400" />
                Couleur de l'extrusion 3D
              </label>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {COLOR_PRESETS.map((preset) => {
                  const isSelected = color.toLowerCase() === preset.value.toLowerCase();
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setColor(preset.value)}
                      className={`h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer border-2 ${preset.bg} ${
                        isSelected ? 'border-white scale-110 shadow-md shadow-white/20' : 'border-transparent opacity-75 hover:opacity-100'
                      }`}
                      title={preset.label}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onFlyTo(building);
                    onClose();
                  }}
                  className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-750 text-slate-200 flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-blue-400" />
                  <span>Vue Caméra 3D</span>
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md shadow-blue-600/20"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Sauvegarder</span>
                </button>
              </div>

              {/* Bouton supprimer */}
              {!isConfirmDelete ? (
                <button
                  type="button"
                  onClick={() => setIsConfirmDelete(true)}
                  className="w-full py-1.5 px-3 rounded-xl text-[11px] font-mono text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 transition cursor-pointer flex items-center justify-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Supprimer ce bâtiment 3D</span>
                </button>
              ) : (
                <div className="p-2.5 bg-rose-950/40 border border-rose-500/30 rounded-xl flex items-center justify-between">
                  <span className="text-[11px] text-rose-300 font-sans">Confirmer la suppression ?</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsConfirmDelete(false)}
                      className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                    >
                      Non
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onDelete(building.id);
                        onClose();
                      }}
                      className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                    >
                      Oui, supprimer
                    </button>
                  </div>
                </div>
              )}
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
