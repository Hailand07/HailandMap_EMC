import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  ShieldCheck, 
  UserCheck, 
  Phone, 
  MapPin, 
  Building2, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Search, 
  ChevronRight, 
  Award,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import type { Building, Profile } from '../types';
import { getAgentReporterInfo, type AgentDisplayInfo } from '../utils/agentHelper';

interface AgentHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentInfo: AgentDisplayInfo | null;
  allBuildings: Building[];
  profiles: Profile[];
  onSelectBuilding?: (building: Building) => void;
}

export default function AgentHistoryModal({
  isOpen,
  onClose,
  agentInfo,
  allBuildings,
  profiles,
  onSelectBuilding
}: AgentHistoryModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'actif' | 'en_attente' | 'conteste'>('all');

  // Récupérer les bâtiments collectés par cet agent
  const agentBuildings = useMemo(() => {
    if (!agentInfo) return [];
    const agentId = agentInfo.profile?.id;
    const agentCode = agentInfo.code;
    const agentName = agentInfo.name.toLowerCase();

    return allBuildings.filter((b) => {
      if (b.submitted_by === agentId) return true;
      if (b.submitted_by === agentCode) return true;
      if (!b.submitted_by && agentInfo.profile?.role === 'admin') return true;
      if (b.submitted_by === 'admin' && agentInfo.profile?.role === 'admin') return true;
      if (b.submitted_by === 'admin-1' && agentInfo.profile?.id === 'admin-1') return true;
      
      const p = profiles.find((prof) => prof.id === b.submitted_by);
      if (p && p.full_name.toLowerCase() === agentName) return true;
      
      return false;
    });
  }, [agentInfo, allBuildings, profiles]);

  const filteredBuildings = useMemo(() => {
    return agentBuildings.filter((b) => {
      const matchesSearch = 
        (b.hailand_code && b.hailand_code.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (b.landmark_note && b.landmark_note.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (b.commune && b.commune.toLowerCase().includes(searchTerm.toLowerCase()));
      
      if (!matchesSearch) return false;
      if (statusFilter === 'all') return true;
      return b.status === statusFilter;
    });
  }, [agentBuildings, searchTerm, statusFilter]);

  if (!isOpen || !agentInfo) return null;

  return (
    <AnimatePresence>
      <div 
        id="agent-history-modal-backdrop"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md"
        onClick={onClose}
      >
        <motion.div
          id="agent-history-modal-container"
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-slate-900 border border-slate-800/90 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl shadow-slate-950/80 overflow-hidden text-slate-100 font-sans"
        >
          {/* HEADER MODAL */}
          <div className="p-5 sm:p-6 border-b border-slate-800 flex items-start justify-between gap-4 bg-slate-950/60">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-indigo-700/30 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-lg font-mono shadow-inner">
                {agentInfo.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg sm:text-xl font-bold font-display text-white tracking-tight">
                    {agentInfo.name}
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {agentInfo.code}
                  </span>
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-500/20">
                    <ShieldCheck className="w-3 h-3" />
                    Accrédité SIG
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-400 mt-1.5 flex-wrap">
                  <span className="flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                    {agentInfo.role}
                  </span>
                  {agentInfo.phone && (
                    <span className="flex items-center gap-1 font-mono">
                      <Phone className="w-3.5 h-3.5 text-slate-500" />
                      {agentInfo.phone}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-500" />
                    {agentInfo.commune} · {agentInfo.quartier}
                  </span>
                </div>
              </div>
            </div>

            <button
              id="close-agent-history-modal-button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* INDICATEURS DE FIABILITÉ & STATISTIQUES */}
          <div className="p-5 sm:p-6 bg-slate-900/90 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
              <span className="text-[11px] text-slate-400 block font-medium">Taux de Fiabilité</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-bold font-mono text-emerald-400">
                  {agentInfo.reliabilityScore}%
                </span>
                <span className="text-[10px] text-emerald-500/80 uppercase font-mono font-bold">Élevé</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                <div 
                  className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${agentInfo.reliabilityScore}%` }}
                />
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
              <span className="text-[11px] text-slate-400 block font-medium">Total Collectés</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-bold font-mono text-white">
                  {agentBuildings.length || agentInfo.totalSubmissions}
                </span>
                <span className="text-xs text-slate-500">adresses</span>
              </div>
              <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-2">
                <Building2 className="w-3 h-3 text-indigo-400" />
                Géoréférencés PostGIS
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
              <span className="text-[11px] text-slate-400 block font-medium">Validés / Actifs</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-bold font-mono text-emerald-400">
                  {agentBuildings.filter(b => b.status === 'actif' || b.is_validated).length || agentInfo.approvedCount}
                </span>
                <span className="text-xs text-emerald-500/80 font-mono">100% OK</span>
              </div>
              <span className="text-[10px] text-emerald-400/80 flex items-center gap-1 mt-2">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                Sans réserve
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
              <span className="text-[11px] text-slate-400 block font-medium">Litiges / Contestés</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-bold font-mono text-amber-400">
                  {agentBuildings.filter(b => b.status === 'conteste').length}
                </span>
                <span className="text-xs text-amber-500/80">cas</span>
              </div>
              <span className="text-[10px] text-amber-400/80 flex items-center gap-1 mt-2">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                Modération requise
              </span>
            </div>
          </div>

          {/* HISTORIQUE DES COLLECTES */}
          <div className="p-5 sm:p-6 flex-1 flex flex-col overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  Historique des collectes de l'agent ({filteredBuildings.length})
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Consultez les déclarations transmises par cet agent pour auditer la précision du tracé et la conformité des repères.
                </p>
              </div>

              {/* FILTRES & RECHERCHE */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filtrer code, repère..."
                    className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center bg-slate-950 p-0.5 rounded-xl border border-slate-800 text-xs">
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      statusFilter === 'all' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Tous
                  </button>
                  <button
                    onClick={() => setStatusFilter('actif')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      statusFilter === 'actif' ? 'bg-emerald-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Actifs
                  </button>
                  <button
                    onClick={() => setStatusFilter('en_attente')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      statusFilter === 'en_attente' ? 'bg-amber-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    En Attente
                  </button>
                  <button
                    onClick={() => setStatusFilter('conteste')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      statusFilter === 'conteste' ? 'bg-rose-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Contestés
                  </button>
                </div>
              </div>
            </div>

            {/* LISTE DÉROULANTE DES BÂTIMENTS */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 custom-scrollbar max-h-[340px]">
              {filteredBuildings.length > 0 ? (
                filteredBuildings.map((b, idx) => (
                  <div
                    key={`hist-bldg-${b.id || idx}-${idx}`}
                    className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-indigo-500/40 transition-all flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-mono font-bold text-xs ${
                        b.status === 'actif'
                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/20'
                          : b.status === 'conteste'
                          ? 'bg-rose-950/60 text-rose-400 border border-rose-500/20'
                          : 'bg-amber-950/60 text-amber-400 border border-amber-500/20'
                      }`}>
                        {b.building_type}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-white group-hover:text-indigo-400 transition-colors">
                            {b.hailand_code || b.id}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                            b.status === 'actif'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/20'
                              : b.status === 'conteste'
                              ? 'bg-rose-950 text-rose-400 border border-rose-500/20'
                              : 'bg-amber-950 text-amber-400 border border-amber-500/20'
                          }`}>
                            {b.status === 'actif' ? 'Validé' : b.status === 'conteste' ? 'Contesté' : 'En Attente'}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                          <span>{b.commune}{b.quartier ? ` · ${b.quartier}` : ''}</span>
                          {b.landmark_note && (
                            <span className="text-slate-300 truncate max-w-[200px]">
                              📍 {b.landmark_note}
                            </span>
                          )}
                          <span className="font-mono text-[11px] text-slate-500">
                            {new Date(b.created_at).toLocaleDateString('fr-FR')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {onSelectBuilding && (
                      <button
                        onClick={() => {
                          onSelectBuilding(b);
                          onClose();
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-indigo-600 text-slate-300 hover:text-white text-xs font-medium border border-slate-800 hover:border-indigo-500 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        <span>Inspecter sur Carte</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-8 text-center bg-slate-950/40 rounded-xl border border-slate-800/60 text-slate-400">
                  <p className="text-sm">Aucun bâtiment correspondant trouvé pour cet agent.</p>
                </div>
              )}
            </div>
          </div>

          {/* FOOTER */}
          <div className="p-4 px-6 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-400" />
              Agent Certifié Système National HailandCode v3.0
            </span>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium transition-all cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
