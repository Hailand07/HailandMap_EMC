/**
 * HailandMap Admin — Panneau latéral de contrôle et d'analyse pour carreau de grille 200m²
 */
import { useState } from 'react';
import {
  X,
  Grid,
  MapPin,
  Check,
  Download,
  Building as BuildingIcon,
  User,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import type { Building, Profile } from '../types';
import { safeJsonStringify } from '../utils/safeJson';

interface GridPanelProps {
  gridCell: any; // GeoJSON feature representing the 200m cell
  buildings: Building[];
  profiles: Profile[];
  isDark: boolean;
  onClose: () => void;
  onSelectBuilding: (building: Building) => void;
  onApproveAll: (buildingsToApprove: Building[]) => void;
}

export default function GridPanel({
  gridCell,
  buildings,
  profiles,
  isDark,
  onClose,
  onSelectBuilding,
  onApproveAll,
}: GridPanelProps) {
  const [exporting, setExporting] = useState(false);

  const palette = {
    bg: isDark ? '#0A0F1E' : '#F8F6F0',
    surface: isDark ? '#1A2540' : '#FFFFFF',
    border: isDark ? '#1E293B' : '#E2E8F0',
    text: isDark ? '#E2E8F0' : '#1B4332',
    muted: isDark ? '#94A3B8' : '#64748B',
    accent: '#06b6d4', // Cyan theme matched with the grid color
    gold: '#FFD700',
  };

  const cellId = gridCell?.properties?.id || 'Inconnu';
  const pendingBuildings = buildings.filter((b) => b.status === 'en_attente');

  // Coordonnées approximatives du centre de la case
  const coords = gridCell?.geometry?.coordinates?.[0] || [];
  let centerLng = 0;
  let centerLat = 0;
  if (coords.length > 0) {
    const lats = coords.map((c: any) => c[1]);
    const lngs = coords.map((c: any) => c[0]);
    centerLat = lats.reduce((a: number, b: number) => a + b, 0) / coords.length;
    centerLng = lngs.reduce((a: number, b: number) => a + b, 0) / coords.length;
  }

  const handleExportData = () => {
    setExporting(true);
    try {
      const dataStr = safeJsonStringify({ gridCellId: cellId, buildings }, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `hailandmap-grid-${cellId}-export.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <aside
      className="w-96 border-l overflow-y-auto shrink-0 flex flex-col h-full animate-fade-in"
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.border,
      }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-10 p-4 border-b flex items-center justify-between"
        style={{
          backgroundColor: palette.surface,
          borderColor: palette.border,
        }}
      >
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-cyan-950/80 text-cyan-400 border border-cyan-500/20 rounded-lg">
            <Grid size={18} />
          </div>
          <div>
            <h2 className="text-xs font-bold font-display uppercase tracking-wider text-white">Carreau de Grille 200m</h2>
            <p className="text-[10px] text-cyan-400 font-mono leading-none mt-0.5">{cellId}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 flex-1 space-y-4">
        {/* Stats & Meta */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3.5 space-y-2.5 font-sans">
          <div className="flex justify-between items-center text-[11px] text-slate-400">
            <span>Coordonnées du centre :</span>
            <span className="font-mono text-white">
              {centerLat.toFixed(6)}, {centerLng.toFixed(6)}
            </span>
          </div>
          <div className="flex justify-between items-center text-[11px] text-slate-400">
            <span>Surface couverte :</span>
            <span className="font-mono text-cyan-400 font-bold">40 000 m² (200m x 200m)</span>
          </div>
          <div className="flex justify-between items-center text-[11px] text-slate-400">
            <span>Total bâtiments détectés :</span>
            <span className="font-mono text-white bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
              {buildings.length}
            </span>
          </div>
          {pendingBuildings.length > 0 && (
            <div className="flex justify-between items-center text-[11px] text-slate-400">
              <span>En attente de validation :</span>
              <span className="font-mono text-amber-400 font-bold bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/10">
                {pendingBuildings.length}
              </span>
            </div>
          )}
        </div>

        {/* Bulk Action Controls */}
        <div className="flex gap-2">
          {pendingBuildings.length > 0 && (
            <button
              onClick={() => onApproveAll(pendingBuildings)}
              className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[10.5px] font-bold font-display transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-600/10"
            >
              <CheckCircle2 size={14} />
              Tout valider ({pendingBuildings.length})
            </button>
          )}
          <button
            onClick={handleExportData}
            disabled={exporting}
            className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-[10.5px] font-bold font-display transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Download size={14} />
            {exporting ? 'Export...' : 'Exporter Données'}
          </button>
        </div>

        {/* Buildings list inside this grid cell */}
        <div className="space-y-2.5 pt-2">
          <h3 className="text-xs font-mono font-bold text-slate-400 flex items-center gap-1.5 uppercase">
            <BuildingIcon size={14} className="text-cyan-400" />
            Polygones & Adresses ({buildings.length})
          </h3>

          <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1 no-scrollbar">
            {buildings.length === 0 ? (
              <div className="text-center py-8 bg-slate-950/20 border border-slate-850 rounded-2xl text-slate-500 font-sans text-xs">
                Aucun polygone enregistré dans ce carreau.
              </div>
            ) : (
              buildings.map((b, idx) => {
                const claimant = profiles.find((p) => p.id === b.claimed_by || p.id === b.submitted_by)?.full_name;
                const label = b.landmark_note || claimant || `Bâtiment ${b.building_type}`;
                const statusColors = {
                  en_attente: 'bg-amber-950/40 text-amber-400 border border-amber-500/10',
                  valide: 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/10',
                  rejete: 'bg-rose-950/40 text-rose-400 border border-rose-500/10',
                };

                return (
                  <button
                    key={`grid-bldg-${b.id || idx}-${idx}`}
                    onClick={() => onSelectBuilding(b)}
                    className="w-full text-left p-3 rounded-xl border border-slate-800 bg-slate-950/40 hover:bg-slate-900 hover:border-slate-700 transition-all flex items-center justify-between group"
                  >
                    <div className="space-y-1 font-sans">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-bold text-orange-400">
                          {b.hailand_code || `DRAFT-${b.id.substring(0, 6).toUpperCase()}`}
                        </span>
                        <span className={`text-[8px] px-1 rounded uppercase font-mono font-bold ${statusColors[b.status] || 'bg-slate-850'}`}>
                          {b.status}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-200 group-hover:text-white truncate max-w-[210px]">
                        {label}
                      </p>
                      {claimant && (
                        <div className="flex items-center gap-1 text-[9px] text-slate-400 font-mono">
                          <User size={10} />
                          <span>Par: {claimant}</span>
                        </div>
                      )}
                    </div>
                    <ChevronRight size={14} className="text-slate-500 group-hover:text-white group-hover:translate-x-0.5 transition-transform" />
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
