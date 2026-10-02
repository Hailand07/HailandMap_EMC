import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Box, Layers, Check, X, Ruler, Sparkles, Building, Palette } from 'lucide-react';
import type { Custom3DBuilding } from '../types';

interface Building3DModalProps {
  isOpen: boolean;
  onClose: () => void;
  drawPoints: [number, number][];
  areaM2: number;
  centroid: [number, number];
  defaultColor?: string;
  onConfirm: (buildingData: Omit<Custom3DBuilding, 'id' | 'created_at'>) => void;
}

const COLOR_PRESETS = [
  { label: 'Style Natif Mapbox (Défaut)', value: '#f0eee9', bg: 'bg-[#f0eee9] text-slate-800' },
  { label: 'Ardoise / Minéral', value: '#e2e8f0', bg: 'bg-slate-200 text-slate-800' },
  { label: 'Béton Urbain', value: '#cbd5e1', bg: 'bg-slate-300 text-slate-800' },
  { label: 'Blanc Architectural', value: '#f8fafc', bg: 'bg-slate-50 text-slate-800' },
  { label: 'Bleu Mapbox', value: '#3b82f6', bg: 'bg-blue-500 text-white' },
  { label: 'Ambre / Brique', value: '#f59e0b', bg: 'bg-amber-500 text-white' },
  { label: 'Émeraude / Toit Végétalisé', value: '#10b981', bg: 'bg-emerald-500 text-white' },
  { label: 'Indigo Contemporain', value: '#6366f1', bg: 'bg-indigo-500 text-white' },
];

const QUICK_FLOORS = [
  { label: 'RDC (1 ét.)', floors: 1 },
  { label: 'R+1 (2 ét.)', floors: 2 },
  { label: 'R+2 (3 ét.)', floors: 3 },
  { label: 'R+3 (4 ét.)', floors: 4 },
  { label: 'R+4 (5 ét.)', floors: 5 },
  { label: 'R+7 (8 ét.)', floors: 8 },
  { label: 'Tour (12 ét.)', floors: 12 },
];

export const Building3DModal: React.FC<Building3DModalProps> = ({
  isOpen,
  onClose,
  drawPoints,
  areaM2,
  centroid,
  defaultColor,
  onConfirm
}) => {
  const [floors, setFloors] = useState<number>(2);
  const [buildingName, setBuildingName] = useState<string>('Immeuble R+2');
  const [selectedColor, setSelectedColor] = useState<string>(defaultColor || '#f0eee9');
  const [customColor, setCustomColor] = useState<string>(defaultColor || '#f0eee9');

  useEffect(() => {
    if (defaultColor) {
      setSelectedColor(defaultColor);
      setCustomColor(defaultColor);
    }
  }, [defaultColor, isOpen]);

  if (!isOpen) return null;

  const heightMeters = Number((floors * 3.2).toFixed(1));

  const handleFloorsChange = (newFloors: number) => {
    const val = Math.max(1, Math.min(100, newFloors));
    setFloors(val);
    if (!buildingName || buildingName.startsWith('Immeuble R+') || buildingName === 'Bâtiment Simple (RDC)') {
      setBuildingName(val === 1 ? 'Bâtiment Simple (RDC)' : `Immeuble R+${val - 1}`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (drawPoints.length < 3) return;

    // Refermer le polygone
    const polygonCoords = [...drawPoints, drawPoints[0]];

    onConfirm({
      name: buildingName.trim() || `Bâtiment R+${floors - 1}`,
      floors,
      height: heightMeters,
      base_height: 0,
      color: selectedColor,
      opacity: 1.0,
      coordinates: [polygonCoords],
      centroid,
      area_m2: Math.round(areaM2)
    });
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 15 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-white/10"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Box className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white font-display flex items-center gap-1.5">
                  Extrusion 3D du Bâtiment
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-500/30">
                    Mapbox 3D
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 font-sans">
                  Configurez la hauteur et l'apparence volumétrique
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

          <form onSubmit={handleSubmit} className="p-5 space-y-4 text-left">
            {/* Résumé de l'empreinte au sol */}
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2 text-slate-300">
                <Ruler className="w-4 h-4 text-blue-400 shrink-0" />
                <span>Surface au sol :</span>
                <strong className="text-white font-bold">{Math.round(areaM2).toLocaleString()} m²</strong>
              </div>
              <div className="text-[11px] text-slate-400">
                {drawPoints.length} sommets
              </div>
            </div>

            {/* Saisie du Nombre d'étages */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-200 font-display flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-400" />
                  Nombre d'étages
                </label>
                <div className="text-xs font-mono font-bold text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-500/30">
                  Hauteur : {heightMeters} m
                </div>
              </div>

              {/* Contrôleur numérique interactif */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleFloorsChange(floors - 1)}
                  className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-white font-bold text-lg flex items-center justify-center transition cursor-pointer"
                >
                  -
                </button>
                <div className="flex-1 relative">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={floors}
                    onChange={(e) => handleFloorsChange(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-950 border border-slate-750 focus:border-blue-500 rounded-xl py-2 px-3 text-center text-lg font-mono font-bold text-white focus:outline-none transition shadow-inner"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-500 pointer-events-none">
                    étages
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleFloorsChange(floors + 1)}
                  className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-white font-bold text-lg flex items-center justify-center transition cursor-pointer"
                >
                  +
                </button>
              </div>

              {/* Raccourcis rapides d'étages */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {QUICK_FLOORS.map((item) => (
                  <button
                    key={item.floors}
                    type="button"
                    onClick={() => handleFloorsChange(item.floors)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold transition cursor-pointer border ${
                      floors === item.floors
                        ? 'bg-blue-600 border-blue-400 text-white shadow-md shadow-blue-600/20'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 font-mono italic">
                Formule SIG : {floors} × 3.2 m = {heightMeters} m d'extrusion fill-extrusion
              </p>
            </div>

            {/* Nom / Référence du Bâtiment */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-200 font-display flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-slate-400" />
                Nom ou Référence
              </label>
              <input
                type="text"
                value={buildingName}
                onChange={(e) => setBuildingName(e.target.value)}
                placeholder="Ex: Immeuble R+2, Villa Résidentielle..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl py-2 px-3 text-xs text-white placeholder:text-slate-600 focus:outline-none transition shadow-inner font-sans"
              />
            </div>

            {/* Couleur d'extrusion 3D */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-200 font-display flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-slate-400" />
                  Couleur d'extrusion 3D
                </span>
                <span className="text-[10px] font-mono text-slate-400">{selectedColor}</span>
              </label>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {COLOR_PRESETS.map((preset) => {
                  const isSelected = selectedColor.toLowerCase() === preset.value.toLowerCase();
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => {
                        setSelectedColor(preset.value);
                        setCustomColor(preset.value);
                      }}
                      className={`h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer border-2 relative ${preset.bg} ${
                        isSelected ? 'border-white scale-110 shadow-lg shadow-white/20' : 'border-transparent hover:scale-105 opacity-80 hover:opacity-100'
                      }`}
                      title={preset.label}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Boutons d'action */}
            <div className="flex gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="flex-[2] py-2.5 px-4 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-blue-600/25 active:scale-98"
              >
                <Sparkles className="w-4 h-4" />
                <span>Extruder en 3D ({heightMeters} m)</span>
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
