/**
 * HailandMap Admin — Panneau latéral de validation/modification de bâtiment
 */
import { useState } from 'react';
import {
  X,
  MapPin,
  Check,
  XCircle,
  Edit3,
  Clock,
  User,
  AlertTriangle,
  ExternalLink,
  Copy,
  Download,
  Building2,
  Home,
  ShieldCheck
} from 'lucide-react';
import type { Building, Validation, Profile } from '../types';
import { STATUS_COLORS } from '../types';
import {
  generateHailandCode,
  isValidHailandCode,
} from '../lib/supabase';
import { getAgentReporterInfo, type AgentDisplayInfo } from '../utils/agentHelper';
import AgentHistoryModal from './AgentHistoryModal';
import { computeDualAddressing } from '../lib/administrativeAddressingService';

interface BuildingPanelProps {
  building: Building;
  onClose: () => void;
  validations: Validation[];
  profiles: Profile[];
  isDark: boolean;
  onApprove?: (building: Building, newCode: string) => void;
  onReject?: (building: Building, comment: string) => void;
  onModify?: (building: Building, editForm: any) => void;
  allBuildings?: Building[];
}

const TYPE_LABELS: Record<string, string> = {
  R: 'Résidentiel',
  C: 'Commercial',
  M: 'Mixte',
  A: 'Administratif',
  H: 'Hôtel',
  P: 'Public',
};

export default function BuildingPanel({
  building,
  onClose,
  validations,
  profiles,
  isDark,
  onApprove,
  onReject,
  onModify,
  allBuildings = [],
}: BuildingPanelProps) {
  const [actionMode, setActionMode] = useState<
    'view' | 'approve' | 'reject' | 'modify'
  >('view');
  const [comment, setComment] = useState('');
  const [actionDone, setActionDone] = useState(false);
  const [selectedAgentForHistory, setSelectedAgentForHistory] = useState<AgentDisplayInfo | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const dual = computeDualAddressing(building);
  const isMother = building.has_courtyard || (building.hailand_code && building.hailand_code.includes('-CR'));
  const isChild = !!building.parent_building_id;

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleDownloadCertificate = () => {
    const cert = {
      republique: "République de Guinée",
      ministere: "Ministère de l'Administration du Territoire et de la Décentralisation",
      direction: "Direction Nationale du Cadastre et de la Cartographie",
      titre: "Fiche Officielle d'Attestation Cadastrale et d'Adressage",
      date_emission: new Date().toISOString(),
      statut: building.status,
      code_metrique_hailand: building.hailand_code || dual.gridAddress.hailandCode,
      code_administratif_etat: building.admin_address_code || dual.adminAddress.adminAddressCode,
      adresse_textuelle_officielle: building.formatted_address || dual.adminAddress.formattedAddress,
      hierarchie_administrative: {
        pays: "Guinée (GN)",
        region: building.region || "Conakry",
        prefecture: building.prefecture || "Ville de Conakry",
        commune: building.commune,
        quartier: building.quartier || "Quartier non délimité"
      },
      caracteristiques: {
        nature: TYPE_LABELS[building.building_type] || building.building_type,
        nombre_etages: building.floor_count,
        nombre_unites: building.unit_count,
        cour_cloture: building.has_courtyard ? "Enceinte délimitée (Concession)" : "Non",
        structure: isMother ? "Concession Mère" : isChild ? "Bâtiment Enfant rattaché" : "Bâtiment Direct Autonome",
        position_relative: building.physical_position || null
      },
      geolocalisation: {
        centroide_gps: building.centroid?.coordinates || null,
        entree_gps: building.entry_point_geom?.coordinates || null
      },
      notes: {
        repere: building.landmark_note || null,
        acces: building.access_note || null,
        instructions_internes: building.internal_directions || null,
        couleur_porte: building.door_color || null,
        interphone: building.intercom_code || null
      },
      agent_rapporteur: building.submitted_by || "Agent de collecte"
    };

    const blob = new Blob([JSON.stringify(cert, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Attestation_${building.hailand_code || building.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const [editForm, setEditForm] = useState({
    building_type: building.building_type,
    commune: building.commune,
    quartier: building.quartier || '',
    floor_count: building.floor_count,
    unit_count: building.unit_count,
    has_courtyard: building.has_courtyard,
    physical_position: building.physical_position || '',
    landmark_note: building.landmark_note || '',
    access_note: building.access_note || '',
  });

  const handleSaveModify = () => {
    Object.assign(building, { ...editForm });
    building.updated_at = new Date().toISOString();
    if (onModify) {
      onModify(building, { ...editForm });
    }
    setActionDone(true);
    setActionMode('view');
  };

  const handleCancelModify = () => {
    setActionMode('view');
  };

  const palette = {
    bg: isDark ? '#0A0F1E' : '#F8F6F0',
    surface: isDark ? '#1A2540' : '#FFFFFF',
    border: isDark ? '#1E293B' : '#E2E8F0',
    text: isDark ? '#E2E8F0' : '#1B4332',
    muted: isDark ? '#94A3B8' : '#64748B',
    accent: '#00FFB2',
    gold: '#FFD700',
  };

  const agentInfo = getAgentReporterInfo(building.submitted_by, profiles, allBuildings.length > 0 ? allBuildings : [building]);

  const handleApprove = () => {
    // Simuler la génération du HailandCode
    let newCode = building.hailand_code;
    if (!newCode && building.zone_code && building.building_type) {
      newCode = generateHailandCode(
        'CKY',
        building.commune,
        building.zone_code,
        building.building_type,
        Math.floor(Math.random() * 900) + 100,
        building.floor_level || undefined,
        building.unit_code || undefined
      );
      building.hailand_code = newCode;
    }
    if (onApprove && newCode) {
      onApprove(building, newCode);
    }
    setActionDone(true);
    setActionMode('view');
  };

  const handleReject = () => {
    if (!comment.trim()) return;
    building.rejection_reason = comment;
    if (onReject) {
      onReject(building, comment);
    }
    setActionDone(true);
    setActionMode('view');
    setComment('');
  };

  return (
    <aside
      className="w-96 border-l overflow-y-auto shrink-0 animate-fade-in"
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
        <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
          <MapPin size={16} style={{ color: palette.gold }} />
          Détail Bâtiment
        </h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-white/10 transition"
        >
          <X size={18} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Statut */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
          style={{
            backgroundColor: STATUS_COLORS[building.status].fill + '22',
            borderLeft: `4px solid ${STATUS_COLORS[building.status].fill}`,
            color: STATUS_COLORS[building.status].fill,
          }}
        >
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[building.status].fill }} />
          {STATUS_COLORS[building.status].label}
        </div>

        {/* BADGE STRUCTURE MÈRE-ENFANT */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center gap-2">
            {isMother ? (
              <Home className="w-4 h-4 text-amber-400" />
            ) : isChild ? (
              <Building2 className="w-4 h-4 text-cyan-400" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            )}
            <span className="text-xs font-semibold text-white">
              {isMother 
                ? 'Concession Mère / Enceinte Principale' 
                : isChild 
                ? 'Bâtiment Enfant rattaché' 
                : 'Bâtiment Direct Autonome'}
            </span>
          </div>

          <button
            onClick={handleDownloadCertificate}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-500/20 text-[10.5px] font-semibold transition"
            title="Télécharger l'Attestation Cadastrale Officielle (JSON)"
          >
            <Download size={12} />
            <span>Attestation</span>
          </button>
        </div>

        {/* DOUBLE CODE D'ADRESSAGE OFFICIEL */}
        <div className="p-3 rounded-xl space-y-2.5 bg-slate-900/70 border border-slate-800">
          {/* Code Métrique Grille */}
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] uppercase font-mono font-bold text-slate-500">
                Code Métrique Grille (200m)
              </span>
              <button
                onClick={() => handleCopy(building.hailand_code || dual.gridAddress.hailandCode, 'metric')}
                className="flex items-center gap-1 text-[10.5px] font-mono font-bold text-amber-400 hover:text-amber-300"
              >
                {copiedField === 'metric' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} className="text-slate-500" />}
                <span>{copiedField === 'metric' ? 'Copié' : 'Copier'}</span>
              </button>
            </div>
            <p className="text-base font-mono font-bold text-amber-400 break-all">
              {building.hailand_code || dual.gridAddress.hailandCode}
            </p>
          </div>

          {/* Code Administratif National */}
          <div className="pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] uppercase font-mono font-bold text-slate-500">
                Code Administratif d'État
              </span>
              <button
                onClick={() => handleCopy(building.admin_address_code || dual.adminAddress.adminAddressCode, 'admin')}
                className="flex items-center gap-1 text-[10.5px] font-mono font-bold text-cyan-400 hover:text-cyan-300"
              >
                {copiedField === 'admin' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} className="text-slate-500" />}
                <span>{copiedField === 'admin' ? 'Copié' : 'Copier'}</span>
              </button>
            </div>
            <p className="text-sm font-mono font-bold text-cyan-400 break-all">
              {building.admin_address_code || dual.adminAddress.adminAddressCode}
            </p>
          </div>

          {/* Fil d'Ariane Administratif Officiel */}
          <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-300">
            <div className="flex items-center gap-1 flex-wrap font-sans">
              <span className="text-slate-500">Guinée</span>
              <span className="text-slate-600">›</span>
              <span className="text-slate-400">{building.region || 'Conakry'}</span>
              <span className="text-slate-600">›</span>
              <span className="font-semibold text-slate-200">{building.commune}</span>
              <span className="text-slate-600">›</span>
              <span className="text-emerald-400 font-medium">{building.quartier || 'Quartier non délimité'}</span>
            </div>
            <p className="text-[10.5px] text-slate-400 mt-1 italic leading-tight">
              {building.formatted_address || dual.adminAddress.formattedAddress}
            </p>
          </div>
        </div>

        {/* Infos principales */}
        <div className="grid grid-cols-2 gap-3">
          <InfoBlock
            label="Type"
            value={TYPE_LABELS[building.building_type] || building.building_type}
            palette={palette}
          />
          <InfoBlock label="Commune" value={building.commune} palette={palette} />
          <InfoBlock label="Zone" value={building.zone_code || '—'} palette={palette} />
          <InfoBlock
            label="Étages"
            value={String(building.floor_count)}
            palette={palette}
          />
          <InfoBlock
            label="Avec cour"
            value={building.has_courtyard ? 'Oui' : 'Non'}
            palette={palette}
          />
          <InfoBlock
            label="Position"
            value={building.physical_position || '—'}
            palette={palette}
          />
        </div>

        {/* Coordonnées GPS Fixes */}
        <div
          className="p-3 rounded-xl space-y-2 border text-xs font-mono"
          style={{
            backgroundColor: isDark ? '#0B132B' : '#F8FAFC',
            borderColor: isDark ? '#1E293B' : '#E2E8F0',
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400">GPS Fixe Centoïde (Bâtiment) :</span>
            <span className="text-amber-400 font-bold">
              {building.centroid?.coordinates 
                ? `${building.centroid.coordinates[1].toFixed(6)}, ${building.centroid.coordinates[0].toFixed(6)}`
                : '—'}
            </span>
          </div>
          {building.entry_point_geom?.coordinates && (
            <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
              <span className="text-[10px] uppercase font-bold text-cyan-400">GPS Fixe Entrée / Portail :</span>
              <span className="text-emerald-400 font-bold">
                {`${building.entry_point_geom.coordinates[1].toFixed(6)}, ${building.entry_point_geom.coordinates[0].toFixed(6)}`}
              </span>
            </div>
          )}
        </div>

        {/* Quartier / Repère */}
        <div className="space-y-2">
          <InfoBlock label="Quartier" value={building.quartier || '—'} palette={palette} />
          <InfoBlock
            label="Repère"
            value={building.landmark_note || '—'}
            palette={palette}
          />
          <InfoBlock
            label="Accès"
            value={building.access_note || '—'}
            palette={palette}
          />
        </div>

        {/* Navigation & Accès Niveau 3 */}
        {(building.entry_point_note || building.internal_directions || building.door_color || building.intercom_code || building.unit_code) && (
          <div
            className="p-3 rounded-xl space-y-2 border"
            style={{
              backgroundColor: isDark ? '#0F172A' : '#F1F5F9',
              borderColor: isDark ? '#334155' : '#CBD5E1',
            }}
          >
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                Navigation & Accès Niveau 3
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {building.unit_code && (
                <div>
                  <span className="text-[10px] uppercase font-mono text-slate-400 block">Porte / Unité</span>
                  <span className="font-bold text-white font-mono">{building.unit_code} {building.floor_level ? `(${building.floor_level})` : ''}</span>
                </div>
              )}
              {building.door_color && (
                <div>
                  <span className="text-[10px] uppercase font-mono text-slate-400 block">Couleur porte</span>
                  <span className="font-medium text-slate-200">{building.door_color}</span>
                </div>
              )}
              {building.intercom_code && (
                <div>
                  <span className="text-[10px] uppercase font-mono text-slate-400 block">Interphone / Sonnette</span>
                  <span className="font-mono font-semibold text-emerald-300">{building.intercom_code}</span>
                </div>
              )}
            </div>

            {building.entry_point_note && (
              <div className="text-xs pt-1 border-t border-slate-700/50">
                <span className="text-[10px] uppercase font-mono text-slate-400 block">Point d'accès / Portail :</span>
                <span className="text-slate-200">{building.entry_point_note}</span>
              </div>
            )}

            {building.internal_directions && (
              <div className="text-xs pt-1 border-t border-slate-700/50">
                <span className="text-[10px] uppercase font-mono text-slate-400 block">Itinéraire intérieur :</span>
                <span className="text-slate-200">{building.internal_directions}</span>
              </div>
            )}
          </div>
        )}

        {/* Propriétaire / Rapporteur */}
        <div>
          <label className="text-xs font-mono uppercase tracking-wider" style={{ color: palette.muted }}>
            Rapporteur / Soumis par
          </label>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <User size={14} style={{ color: palette.muted }} className="shrink-0" />
            <button
              type="button"
              onClick={() => setSelectedAgentForHistory(agentInfo)}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-indigo-950/80 text-slate-200 hover:text-indigo-300 border border-slate-700/80 hover:border-indigo-500/40 text-xs font-semibold transition-all cursor-pointer shadow-sm group/btn"
              title="Cliquer pour voir l'historique et la fiabilité de cet agent"
            >
              <span className="underline decoration-indigo-500/40 underline-offset-2 group-hover/btn:decoration-indigo-400">
                {agentInfo.formatted}
              </span>
              <ExternalLink size={11} className="text-indigo-400/80 group-hover/btn:text-indigo-300" />
            </button>
          </div>
        </div>

        {/* Modal d'historique de l'agent */}
        <AgentHistoryModal
          isOpen={!!selectedAgentForHistory}
          onClose={() => setSelectedAgentForHistory(null)}
          agentInfo={selectedAgentForHistory}
          allBuildings={allBuildings.length > 0 ? allBuildings : [building]}
          profiles={profiles}
        />

        {/* Demande de modification */}
        {building.modification_request && (
          <div
            className="p-3 rounded-lg text-sm"
            style={{
              backgroundColor: '#EF444411',
              border: '1px solid #EF444433',
              color: '#EF4444',
            }}
          >
            <AlertTriangle size={14} className="inline mr-1" />
            Demande : {building.modification_request}
          </div>
        )}

        {/* Actions Admin */}
        {actionMode === 'view' && !actionDone && (
          <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: palette.border }}>
            <button
              onClick={() => setActionMode('approve')}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer"
              style={{
                backgroundColor: '#00FFB215',
                color: '#00FFB2',
                border: '1px solid #00FFB233',
              }}
            >
              <Check size={16} />
              Approuver & Générer le HailandCode
            </button>
            <button
              onClick={() => setActionMode('reject')}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer"
              style={{
                backgroundColor: '#EF444415',
                color: '#EF4444',
                border: '1px solid #EF444433',
              }}
            >
              <XCircle size={16} />
              Rejeter avec commentaire
            </button>
          </div>
        )}

        {/* Écran Approbation */}
        {actionMode === 'approve' && (
          <div className="space-y-3 pt-2 border-t" style={{ borderColor: palette.border }}>
            <p className="text-sm" style={{ color: palette.text }}>
              Confirmer la validation. Un HailandCode officiel sera généré.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleApprove}
                className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition cursor-pointer"
              >
                Confirmer
              </button>
              <button
                onClick={() => setActionMode('view')}
                className="flex-1 px-4 py-2 rounded-lg border text-sm transition cursor-pointer"
                style={{ borderColor: palette.border, color: palette.muted }}
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Écran Rejet */}
        {actionMode === 'reject' && (
          <div className="space-y-3 pt-2 border-t" style={{ borderColor: palette.border }}>
            <label className="text-sm" style={{ color: palette.text }}>
              Motif du rejet :
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="w-full p-3 rounded-lg text-sm border outline-none resize-none"
              style={{
                backgroundColor: palette.bg,
                borderColor: palette.border,
                color: palette.text,
              }}
              placeholder="Expliquez pourquoi l'adresse est rejetée..."
            />
            <div className="flex gap-2">
              <button
                onClick={handleReject}
                disabled={!comment.trim()}
                className="flex-1 px-4 py-2 rounded-lg bg-red-650 hover:bg-red-700 text-white text-sm font-bold disabled:opacity-40 transition cursor-pointer"
              >
                Rejeter
              </button>
              <button
                onClick={() => setActionMode('view')}
                className="flex-1 px-4 py-2 rounded-lg border text-sm transition cursor-pointer"
                style={{ borderColor: palette.border, color: palette.muted }}
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Action réussie */}
        {actionDone && (
          <div
            className="p-3 rounded-lg text-sm font-bold text-center animate-pulse"
            style={{
              backgroundColor: '#00FFB222',
              color: '#00FFB2',
            }}
          >
            ✅ Action effectuée avec succès.
          </div>
        )}

        {/* Historique des validations */}
        {validations.length > 0 && (
          <div className="space-y-2 pt-2 border-t" style={{ borderColor: palette.border }}>
            <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: palette.muted }}>
              Historique
            </h3>
            {validations.map((v) => (
              <div
                key={v.id}
                className="p-3 rounded-lg text-xs space-y-1"
                style={{
                  backgroundColor: palette.bg,
                  border: `1px solid ${palette.border}`,
                }}
              >
                <div className="flex items-center gap-1.5" style={{ color: palette.text }}>
                  <Clock size={12} style={{ color: palette.muted }} />
                  {new Date(v.created_at).toLocaleDateString('fr-FR')}
                </div>
                <p style={{ color: palette.text }}>{v.comment || v.type}</p>
                <span
                  className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
                  style={{
                    backgroundColor:
                      v.status === 'approved'
                        ? '#00FFB222'
                        : v.status === 'rejected'
                        ? '#EF444422'
                        : '#F59E0B22',
                    color:
                      v.status === 'approved'
                        ? '#00FFB2'
                        : v.status === 'rejected'
                        ? '#EF4444'
                        : '#F59E0B',
                  }}
                >
                  {v.status === 'approved' ? 'Approuvé' : v.status === 'rejected' ? 'Rejeté' : 'En attente'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

// Sous-composant réutilisable
function InfoBlock({
  label,
  value,
  palette,
}: {
  label: string;
  value: string;
  palette: Record<string, string>;
}) {
  return (
    <div>
      <span className="text-[10px] uppercase tracking-wider font-mono" style={{ color: palette.muted }}>
        {label}
      </span>
      <p className="text-sm font-medium truncate" style={{ color: palette.text }}>
        {value}
      </p>
    </div>
  );
}
