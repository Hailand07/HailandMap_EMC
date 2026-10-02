/**
 * HailandMap Admin — Vue Zones (F4)
 * Gestion des carreaux de Geofencing 200m x 200m à Conakry.
 */
import { useState } from 'react';
import { MapPin, Plus, Edit3, Trash2, Layers, Search, LayoutGrid, RotateCcw, HelpCircle } from 'lucide-react';
import type { Zone } from '../types';

interface ZonesViewProps {
  zones: Zone[];
  isDark: boolean;
  onCreateZone?: (zone: Zone) => void;
}

const COMMUNES_GN = ['Ratoma', 'Matoto', 'Kaloum', 'Dixinn', 'Matam'];

export default function ZonesView({ zones, onCreateZone }: ZonesViewProps) {
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newZoneCode, setNewZoneCode] = useState('');
  const [newCommune, setNewCommune] = useState('');

  const filtered = search.trim()
    ? zones.filter((z) =>
        z.zone_code.toLowerCase().includes(search.toLowerCase()) ||
        z.commune.toLowerCase().includes(search.toLowerCase())
      )
    : zones;

  const handleAddNewZone = () => {
    if (!newZoneCode.trim() || !newCommune) return;
    const newZ: Zone = {
      id: 'z-' + Math.random().toString(36).substring(2, 11),
      zone_code: newZoneCode.toUpperCase().trim(),
      commune: newCommune,
      geom: {
        type: 'Polygon',
        coordinates: [
          [
            [-13.670, 9.610],
            [-13.668, 9.610],
            [-13.668, 9.612],
            [-13.670, 9.612],
            [-13.670, 9.610]
          ]
        ]
      },
      centroid: {
        type: 'Point',
        coordinates: [-13.669, 9.611]
      },
      created_at: new Date().toISOString()
    };
    if (onCreateZone) {
      onCreateZone(newZ);
    }
    setShowCreate(false);
    setNewZoneCode('');
    setNewCommune('');
  };

  return (
    <div className="p-6 md:p-8 space-y-6 text-slate-100 bg-slate-950 font-sans min-h-screen">
      
      {/* SECTION EN-TÊTE ATELIER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[9px] uppercase font-mono font-bold tracking-wider bg-purple-950/60 text-purple-400 border border-purple-500/10">
              PÉRIMÈTRES DE COUVERTURE
            </span>
            <span className="text-[10px] font-mono text-slate-500">CONAKRY GEOFENCING v6</span>
          </div>
          <h2 className="text-xl font-bold font-display tracking-tight text-white flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-indigo-400" />
            Clauses & Frontières de Geofencing SQL
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Gérez les carreaux de repérage et de distribution logistique de 200m x 200m pour cadrer les adresses de livraison d'État.
          </p>
        </div>

        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-indigo-700 hover:from-indigo-405 hover:to-indigo-600 text-white rounded-xl text-xs font-bold transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-lg shadow-indigo-500/20 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Établir Nouveau Quadrillage
        </button>
      </div>

      {/* FORMULAIRE CRÉATION RAPIDE */}
      {showCreate && (
        <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-4 animate-fadeIn">
          <div>
            <h3 className="text-xs uppercase font-mono text-slate-300 font-bold">
              📐 Tracer une Nouvelle Zone de Distribution
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Renseignez les directives géographiques initiales du carreau cadastral.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              placeholder="Code zone (ex: Z016)"
              value={newZoneCode}
              onChange={(e) => setNewZoneCode(e.target.value)}
              className="px-3.5 py-2.5 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl text-xs text-slate-200 outline-none font-mono placeholder-slate-500"
            />
            <select
              value={newCommune}
              onChange={(e) => setNewCommune(e.target.value)}
              className="px-3.5 py-2.5 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl text-xs text-slate-400 outline-none select-none"
            >
              <option value="" className="bg-slate-900 text-slate-300">Sélectionner Commune...</option>
              {COMMUNES_GN.map((c) => (
                <option key={c} value={c} className="bg-slate-900 text-slate-300">{c}</option>
              ))}
            </select>
            <button
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-505 text-white rounded-xl text-xs font-bold transition cursor-pointer select-none active:scale-95 shadow-md shadow-indigo-600/10"
              onClick={handleAddNewZone}
              disabled={!newZoneCode.trim() || !newCommune}
            >
              💾 Enregistrer & Délimiter
            </button>
          </div>
          <p className="text-[10px] text-slate-500 italic">
            * Une fois initiée, tracez directement la toiture ou le terrain de la commune sous forme de polygone carré de 200m x 200m sur la carte 3D.
          </p>
        </div>
      )}

      {/* RECHERCHE COUVERTURE */}
      <div className="relative max-w-md bg-slate-900/40 p-1.5 rounded-2xl border border-slate-800">
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrer les carreaux par code ou commune..."
            className="w-full bg-slate-950/85 border border-slate-800 focus:border-indigo-405 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-300 placeholder-slate-500 outline-none transition-all"
          />
        </div>
      </div>

      {/* GRILLE DES CARREAUX ADRESSAGE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((z) => (
          <div
            key={z.id}
            className="p-5 rounded-2xl border border-slate-800/80 bg-slate-900/50 hover:border-indigo-500/20 shadow-lg hover:shadow-indigo-500/5 transition-all"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-lg font-mono font-bold text-indigo-400 leading-none">
                  {z.zone_code}
                </p>
                <p className="text-xs flex items-center gap-1 text-slate-400 mt-2 font-sans font-medium">
                  <MapPin size={12} className="text-slate-500" />
                  {z.commune}
                </p>
              </div>
              
              {/* Actions */}
              <div className="flex items-center gap-1">
                <button
                  className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-850 hover:text-white text-slate-400 transition cursor-pointer"
                  title="Modifier les limites"
                >
                  <Edit3 size={13} />
                </button>
                <button
                  className="p-1.5 rounded-lg bg-slate-950 hover:bg-red-950/40 border border-slate-850 hover:text-red-400 text-slate-500 transition cursor-pointer"
                  title="Supprimer"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* MÉTADONNÉES TECHNIQUES SIG CARREAU */}
            <div className="pt-3.5 border-t border-slate-800/60 font-mono text-[10.5px] text-slate-400 space-y-1.5">
              <div className="flex items-center justify-between">
                <span>Réseau :</span>
                <span className="text-slate-200">200m x 200m Cell</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Système de Projection :</span>
                <span className="text-slate-200 font-mono">EPSG:3857 (Mercator)</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
