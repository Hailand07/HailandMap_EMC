/**
 * HailandMap Admin — Vue Validations (F3)
 * Tableau des bâtiments en attente ou contestés à traiter par l'admin.
 */
import React, { useMemo, useState } from 'react';
import {
  CheckCircle,
  AlertTriangle,
  Clock,
  MapPin,
  User,
  ChevronRight,
  Shield,
  Activity,
  UserCheck,
  ExternalLink,
  Search,
  Filter,
  FileCheck2,
  Building2,
  Download,
  Copy,
  Check
} from 'lucide-react';
import type { Building, Profile } from '../types';
import { getAgentReporterInfo, type AgentDisplayInfo } from '../utils/agentHelper';
import AgentHistoryModal from './AgentHistoryModal';
import { computeDualAddressing } from '../lib/administrativeAddressingService';

interface ValidationsViewProps {
  buildings: Building[];
  profiles: Profile[];
  onSelect: (b: Building) => void;
  isDark: boolean;
}

type FilterMode = 'all' | 'en_attente' | 'conteste';

const TYPE_LABELS: Record<string, string> = {
  R: 'Résidentiel',
  C: 'Commercial',
  M: 'Mixte',
  A: 'Administratif',
  H: 'Hôtel',
  P: 'Public',
  T: 'Temporaire / Kiosque',
};

export default function ValidationsView({
  buildings,
  profiles,
  onSelect,
}: ValidationsViewProps) {
  const [filter, setFilter] = useState<FilterMode>('all');
  const [selectedAgentForHistory, setSelectedAgentForHistory] = useState<AgentDisplayInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCommune, setSelectedCommune] = useState<string>('all');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const pending = useMemo(
    () =>
      buildings.filter(
        (b) => b.status === 'en_attente' || b.status === 'conteste'
      ),
    [buildings]
  );

  const communesList = useMemo(() => {
    const set = new Set<string>();
    pending.forEach(b => {
      if (b.commune) set.add(b.commune);
    });
    return Array.from(set).sort();
  }, [pending]);

  const filtered = useMemo(() => {
    return pending.filter((b) => {
      if (filter !== 'all' && b.status !== filter) return false;
      if (selectedCommune !== 'all' && b.commune !== selectedCommune) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCode = (b.hailand_code || '').toLowerCase().includes(q);
        const matchAdmin = (b.admin_address_code || '').toLowerCase().includes(q);
        const matchCommune = (b.commune || '').toLowerCase().includes(q);
        const matchQuartier = (b.quartier || '').toLowerCase().includes(q);
        const matchNote = (b.landmark_note || '').toLowerCase().includes(q);
        const matchMotif = (b.modification_request || '').toLowerCase().includes(q);
        if (!matchCode && !matchAdmin && !matchCommune && !matchQuartier && !matchNote && !matchMotif) {
          return false;
        }
      }
      return true;
    });
  }, [pending, filter, selectedCommune, searchQuery]);

  const countAttente = pending.filter((b) => b.status === 'en_attente').length;
  const countConteste = pending.filter((b) => b.status === 'conteste').length;

  const copyToClipboard = (text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleExportCertificate = (b: Building, e: React.MouseEvent) => {
    e.stopPropagation();
    const dual = computeDualAddressing(b);
    const cert = {
      republique: "République de Guinée",
      ministere: "Ministère de l'Administration du Territoire et de la Décentralisation",
      direction: "Direction Nationale du Cadastre et de la Cartographie",
      titre: "Attestation Provisoire de Numérotation et d'Agrément Cadastral",
      date_emission: new Date().toISOString(),
      statut_dossier: b.status,
      code_metrique_hailand: b.hailand_code || dual.gridAddress.hailandCode,
      code_administratif_etat: b.admin_address_code || dual.adminAddress.adminAddressCode,
      adresse_officielle: b.formatted_address || dual.adminAddress.formattedAddress,
      hierarchie_administrative: {
        pays: "Guinée (GN)",
        region: b.region || "Conakry",
        prefecture: b.prefecture || "Ville de Conakry",
        commune: b.commune,
        quartier: b.quartier || "Secteur en cours d'attribution"
      },
      caracteristiques: {
        type_usage: TYPE_LABELS[b.building_type] || b.building_type,
        etages: b.floor_count,
        unites: b.unit_count,
        cour_cloture: b.has_courtyard ? "Enceinte délimitée" : "Autonome sans cour",
        position_relative: b.physical_position || "Non spécifié"
      },
      geolocalisation: {
        centroide_gps: b.centroid?.coordinates || null,
        entree_gps: b.entry_point_geom?.coordinates || null
      },
      agent_rapporteur: b.submitted_by || "Agent de collecte",
      remarque: b.landmark_note || null,
      motif_litige_si_conteste: b.modification_request || null
    };

    const blob = new Blob([JSON.stringify(cert, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Attestation_Cadastre_${b.hailand_code || b.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 md:p-8 space-y-6 text-slate-100 bg-slate-950 font-sans min-h-screen">
      {/* MODAL HISTORIQUE & FIABILITÉ AGENT */}
      <AgentHistoryModal
        isOpen={!!selectedAgentForHistory}
        onClose={() => setSelectedAgentForHistory(null)}
        agentInfo={selectedAgentForHistory}
        allBuildings={buildings}
        profiles={profiles}
        onSelectBuilding={(b) => {
          setSelectedAgentForHistory(null);
          onSelect(b);
        }}
      />

      {/* SECTION INFORMATIONNELLE STUDIO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[9px] uppercase font-mono font-bold tracking-wider bg-indigo-950/80 text-indigo-400 border border-indigo-500/10">
              Module de Modération
            </span>
            <span className="flex items-center gap-1 text-[9px] uppercase font-mono text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              SÉCURISÉ
            </span>
          </div>
          <h2 className="text-xl font-bold font-display tracking-tight text-white flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-indigo-400" />
            Atelier National de Modération Cadastrale
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Reconstitution du cadastre de Conakry. Validez ou rejetez les demandes de numérotations pour l'octroi d'Adresses Uniques.
          </p>
        </div>

        {/* Boutons de filtrage format segmenté Studio */}
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl p-1 shadow-lg max-w-sm">
          {[
            { id: 'all', label: 'Toutes les alertes', count: pending.length, activeColor: 'text-indigo-400 bg-indigo-950/40 border-indigo-550/20' },
            { id: 'en_attente', label: 'En Attente', count: countAttente, activeColor: 'text-blue-400 bg-blue-950/40 border-blue-500/20' },
            { id: 'conteste', label: 'Contestés', count: countConteste, activeColor: 'text-red-400 bg-red-950/40 border-red-500/20' }
          ].map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id as FilterMode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer select-none transition-all flex items-center gap-1.5 border ${
                  active 
                    ? tab.activeColor + ' border shadow-sm' 
                    : 'bg-transparent text-slate-400 border-transparent hover:text-slate-200'
                }`}
              >
                {tab.label}
                <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold ${active ? 'bg-white/10' : 'bg-slate-800 text-slate-400'}`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* RUSTINE KPIs MINIATURES */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Soumissions', value: pending.length, color: 'text-blue-400', icon: <Activity className="w-4 h-4" /> },
          { label: 'Agréments Requis', value: countAttente, color: 'text-indigo-400', icon: <Clock className="w-4 h-4" /> },
          { label: 'Litiges Fonciers', value: countConteste, color: 'text-red-400', icon: <AlertTriangle className="w-4 h-4" /> },
          { label: 'Administrateurs', value: 1, color: 'text-emerald-400', icon: <UserCheck className="w-4 h-4" /> }
        ].map((item, i) => (
          <div key={i} className="p-3.5 bg-slate-900/40 border border-slate-800/80 rounded-2xl flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-mono text-slate-500 tracking-wider block">{item.label}</span>
              <span className={`text-lg font-bold font-mono tracking-tight block ${item.color}`}>{item.value}</span>
            </div>
            <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 flex items-center justify-center">
              {item.icon}
            </div>
          </div>
        ))}
      </div>

      {/* BARRE D'OUTILS & RECHERCHE TERRITORIALE */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Rechercher par code (GN-Z... ou GN.CKY...), commune, quartier, motif..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-sans"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
            >
              Effacer
            </button>
          )}
        </div>

        {communesList.length > 0 && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={selectedCommune}
              onChange={(e) => setSelectedCommune(e.target.value)}
              className="px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-sans w-full sm:w-auto"
            >
              <option value="all">Toutes les communes ({communesList.length})</option>
              {communesList.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Liste vide */}
      {filtered.length === 0 && (
        <div className="p-16 rounded-3xl border border-dashed border-slate-800 text-center bg-slate-900/30 max-w-xl mx-auto space-y-4">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
            <CheckCircle className="w-6 h-6 animate-bounce" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Aucun dossier dans cette sélection</p>
            <p className="text-xs text-slate-400 mt-1">
              Tous les lots correspondant aux filtres actifs sont certifiés ou aucun litige n'est signalé.
            </p>
          </div>
        </div>
      )}

      {/* Cartes de validation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((b, idx) => {
          const isContested = b.status === 'conteste';
          const agentInfo = getAgentReporterInfo(b.submitted_by, profiles, buildings);
          const dual = computeDualAddressing(b);
          const isMother = b.has_courtyard || (b.hailand_code && b.hailand_code.includes('-CR'));
          const isChild = !!b.parent_building_id;

          return (
            <div
              key={`val-bldg-${b.id || idx}-${idx}`}
              onClick={() => onSelect(b)}
              className="group text-left p-5 rounded-2xl border bg-slate-900/50 border-slate-800/80 hover:border-indigo-500/40 transition-all cursor-pointer relative shadow-lg hover:shadow-indigo-500/5 flex flex-col justify-between"
            >
              <div>
                {/* Ligne haute : statut + badges structure + bouton inspecter */}
                <div className="flex items-center justify-between mb-3.5 flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      isContested 
                        ? 'bg-red-950/80 text-red-400 border border-red-500/20' 
                        : 'bg-indigo-950/80 text-indigo-400 border border-indigo-500/20'
                    }`}>
                      {isContested ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {isContested ? 'CONTESTÉ' : 'EN ATTENTE'}
                    </span>

                    {isMother && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        COUR MÈRE
                      </span>
                    )}

                    {isChild && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                        BÂTIMENT ENFANT
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => handleExportCertificate(b, e)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-indigo-900/50 text-slate-300 hover:text-indigo-300 border border-slate-700/80 transition-colors"
                      title="Télécharger l'Attestation Provisoire Cadastrale (JSON)"
                    >
                      <Download size={13} />
                    </button>

                    <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-400 uppercase font-sans tracking-wide">
                      <span>Inspecter</span>
                      <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform text-indigo-400" />
                    </div>
                  </div>
                </div>

                {/* Double Code d'Adressage Hybride */}
                <div className="mb-3 space-y-1.5 bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-mono font-bold text-slate-500">Code Métrique Grille :</span>
                    <button
                      type="button"
                      onClick={(e) => copyToClipboard(b.hailand_code || dual.gridAddress.hailandCode, e)}
                      className="inline-flex items-center gap-1 text-xs font-mono font-bold text-amber-400 hover:text-amber-300"
                    >
                      {b.hailand_code || dual.gridAddress.hailandCode}
                      {copiedCode === (b.hailand_code || dual.gridAddress.hailandCode) ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} className="text-slate-500" />}
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                    <span className="text-[10px] uppercase font-mono font-bold text-slate-500">Code Administratif État :</span>
                    <button
                      type="button"
                      onClick={(e) => copyToClipboard(b.admin_address_code || dual.adminAddress.adminAddressCode, e)}
                      className="inline-flex items-center gap-1 text-xs font-mono font-bold text-cyan-400 hover:text-cyan-300"
                    >
                      {b.admin_address_code || dual.adminAddress.adminAddressCode}
                      {copiedCode === (b.admin_address_code || dual.adminAddress.adminAddressCode) ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} className="text-slate-500" />}
                    </button>
                  </div>
                </div>

                {/* Fil d'Ariane Administratif Officiel */}
                <div className="text-[11px] font-sans text-slate-300 flex items-center gap-1.5 flex-wrap mb-2">
                  <span className="text-slate-500">Guinée</span>
                  <span className="text-slate-600">›</span>
                  <span className="font-semibold text-slate-200">{b.commune}</span>
                  <span className="text-slate-600">›</span>
                  <span className="text-emerald-400 font-medium">{b.quartier || 'Quartier non délimité'}</span>
                  <span className="text-slate-500 ml-auto text-[10px]">
                    Type : <strong className="text-slate-300">{TYPE_LABELS[b.building_type] || b.building_type}</strong>
                  </span>
                </div>
              </div>

              {/* Détails complémentaires & Rapporteur */}
              <div className="space-y-2 mt-3 pt-3 border-t border-slate-800/60 text-xs text-slate-400">
                {b.landmark_note && (
                  <p className="flex items-center gap-2">
                    <MapPin size={13} className="text-slate-500 block shrink-0" />
                    <span className="text-slate-300 font-sans">{b.landmark_note}</span>
                  </p>
                )}
                
                {/* LIGNE RAPPORTEUR DYNAMIQUE ET CLIQUABLE */}
                <div className="flex items-center gap-2 justify-between">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <User size={13} className="text-slate-500 shrink-0" />
                    <span>Rapporteur :</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAgentForHistory(agentInfo);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          setSelectedAgentForHistory(agentInfo);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-800 hover:bg-indigo-950 text-slate-200 hover:text-indigo-300 border border-slate-700/80 hover:border-indigo-500/50 font-semibold font-sans text-xs transition-all cursor-pointer shadow-sm group/btn"
                      title="Cliquez pour évaluer la fiabilité et voir l'historique des collectes de cet agent"
                    >
                      <span className="underline decoration-indigo-500/40 underline-offset-2 group-hover/btn:decoration-indigo-400 font-medium text-slate-200 group-hover/btn:text-indigo-300">
                        {agentInfo.formatted}
                      </span>
                      <ExternalLink size={11} className="text-indigo-400/70 group-hover/btn:text-indigo-300" />
                    </span>
                  </div>

                  <span className="text-[10px] font-mono text-slate-500">
                    {b.floor_count ? `R+${b.floor_count - 1}` : 'RDC'} · {b.unit_count || 1} unité(s)
                  </span>
                </div>

                {b.modification_request && (
                  <div className="flex items-start gap-2 mt-2 p-2.5 rounded-xl bg-red-950/30 border border-red-500/10 text-red-400 leading-normal animate-fadeIn">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-red-300 block mb-0.5">Motif de Litige :</span>
                      <p className="font-medium text-red-300/90 font-sans text-xs">{b.modification_request}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

