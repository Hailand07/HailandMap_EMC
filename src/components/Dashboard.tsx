/**
 * HailandMap Admin — Dashboard Analytics (F5)
 * KPIs, répartition de couverture urbaine et audits cadastral à Conakry
 */
import { useMemo } from 'react';
import {
  Building2,
  CheckCircle,
  Clock,
  AlertTriangle,
  MapPin,
  Users,
  TrendingUp,
  Activity,
  ShieldAlert,
  FolderSync
} from 'lucide-react';
import type { Building, Zone, Validation } from '../types';
import { getBuildingCountsByStatus } from '../lib/supabase';

interface DashboardProps {
  buildings: Building[];
  zones: Zone[];
  validations: Validation[];
  isDark: boolean;
}

export default function Dashboard({
  buildings,
  zones,
  validations,
}: DashboardProps) {
  const counts = useMemo(
    () => getBuildingCountsByStatus(buildings),
    [buildings]
  );

  const total = buildings.length;
  const tauxValidation = total > 0 ? Math.round((counts.actif / total) * 100) : 0;
  const tauxCouverture = 42; // calcul simulé de couverture sur Conakry

  const kpis = [
    {
      label: 'Volume National',
      value: total,
      icon: <Building2 className="w-5 h-5 text-blue-400" />,
      color: 'border-blue-500/20 shadow-blue-550/5',
      details: 'Structures physiques répertoriées',
    },
    {
      label: 'Lots Actifs Validés',
      value: counts.actif,
      icon: <CheckCircle className="w-5 h-5 text-emerald-400" />,
      color: 'border-emerald-500/10 shadow-emerald-500/5',
      details: `${tauxValidation}% de validation souveraine`,
    },
    {
      label: 'Relevés en Attente',
      value: counts.en_attente,
      icon: <Clock className="w-5 h-5 text-indigo-400" />,
      color: 'border-indigo-500/10 shadow-indigo-550/5',
      details: 'Rapports terrain à approuver',
    },
    {
      label: 'Conflits de Propriété',
      value: counts.conteste,
      icon: <AlertTriangle className="w-5 h-5 text-red-400" />,
      color: 'border-red-500/10 shadow-red-500/5',
      details: 'Lots sous réclamations',
    },
    {
      label: 'Zones Limites Établies',
      value: zones.length,
      icon: <MapPin className="w-5 h-5 text-purple-400" />,
      color: 'border-purple-500/10 shadow-purple-500/5',
      details: `~${tauxCouverture}% du territoire couvert`,
    },
    {
      label: 'Livreurs Partenaires',
      value: 2, 
      icon: <Users className="w-5 h-5 text-indigo-400" />,
      color: 'border-indigo-500/10 shadow-indigo-505/5',
      details: 'Agents sur le réseau de distribution',
    },
  ];

  return (
    <div className="p-6 md:p-8 space-y-6 text-slate-100 bg-slate-950 font-sans min-h-screen">
      
      {/* SECTION INFORMATIONNELLE DE COMMANDE */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[9px] uppercase font-mono font-bold tracking-wider bg-indigo-950/80 text-indigo-400 border border-indigo-500/10">
              AUDIT GENERAUX SIG
            </span>
            <span className="flex items-center gap-1 text-[9px] uppercase font-mono text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              TEMPS RÉEL
            </span>
          </div>
          <h2 className="text-xl font-bold font-display tracking-tight text-white flex items-center gap-2.5">
            <TrendingUp className="w-5 h-5 text-indigo-400" />
            Tour de Contrôle Analytique & Performances
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Indicateurs clés et répartition des lots d'adressage géolocalisés de Conakry.
          </p>
        </div>

        {/* STATUT SYNC */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 flex items-center gap-2 font-mono text-xs w-fit text-slate-400">
          <FolderSync className="w-4 h-4 text-emerald-400 animate-spin-slow" />
          <span>Intégrité Registry :</span>
          <span className="text-emerald-400 font-bold">100% CONFORME</span>
        </div>
      </div>

      {/* METRIC CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {kpis.map((kpi, i) => (
          <div
            key={i}
            className={`p-5 rounded-2xl bg-slate-900/40 border ${kpi.color} shadow-lg transition-transform hover:scale-[1.01]`}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-slate-400 tracking-wide font-sans block">{kpi.label}</span>
              <div className="w-9 h-9 rounded-xl bg-slate-900/95 border border-slate-800 flex items-center justify-center">
                {kpi.icon}
              </div>
            </div>
            
            <div className="space-y-1">
              <div className="text-3xl font-extrabold font-mono tracking-tight text-white leading-none">
                {kpi.value}
              </div>
              <p className="text-[10.5px] text-slate-400 font-sans pt-1">
                {kpi.details}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* REPARTITION GRAPHIQUE STUDIO */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* REPARTITION DES LOTS PAR STATUT */}
        <div className="lg:col-span-2 p-5 rounded-2xl border border-slate-800 bg-slate-900/40 space-y-5">
          <div className="flex border-b border-slate-800 pb-3 justify-between items-center">
            <h3 className="text-xs uppercase font-mono tracking-wider font-extrabold text-slate-300">
              📊 Répartition par statut du Réseau Urbain
            </h3>
            <span className="text-[10px] text-slate-500 font-mono">1 lot = 1 toiture recensée</span>
          </div>

          <div className="w-full h-8 rounded-2xl flex overflow-hidden border border-slate-950/80 bg-slate-950 p-1 select-none">
            {Object.entries(counts).map(([status, count]) => {
              const countNum = count as number;
              if (countNum === 0) return null;
              const width = (countNum / total) * 100;
              const colors: Record<string, string> = {
                non_reclame: 'bg-indigo-500',
                en_attente: 'bg-blue-500',
                actif: 'bg-emerald-400',
                conteste: 'bg-red-500',
                inactif: 'bg-slate-700',
              };
              return (
                <div
                  key={status}
                  className={`h-full first:rounded-l-xl last:rounded-r-xl transition-all duration-500 ${colors[status] || 'bg-slate-400'}`}
                  style={{ width: `${width}%` }}
                  title={`${status}: ${count}`}
                />
              );
            })}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5 pt-2">
            {Object.entries(counts).map(([status, count]) => {
              const bgColorsList: Record<string, string> = {
                non_reclame: 'bg-indigo-500',
                en_attente: 'bg-blue-500',
                actif: 'bg-emerald-400',
                conteste: 'bg-red-500',
                inactif: 'bg-slate-550',
              };

              const labelsList: Record<string, string> = {
                non_reclame: 'Non réclamés',
                en_attente: 'En attente',
                actif: 'Actifs certifiés',
                conteste: 'Contestés',
                inactif: 'Inactifs',
              };

              return (
                <div key={status} className="p-3 bg-slate-950/50 rounded-xl border border-slate-850 flex flex-col justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] font-sans text-slate-400">
                    <span className={`w-2.5 h-2.5 rounded-full ${bgColorsList[status] || 'bg-slate-400'}`} />
                    <span>{labelsList[status] || status}</span>
                  </div>
                  <span className="text-lg font-mono font-bold text-white mt-2 block leading-none">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* LOGS RECENT PROTOCOLE */}
        <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/40 space-y-4">
          <div className="flex border-b border-slate-800 pb-3 justify-between items-center">
            <h3 className="text-xs uppercase font-mono tracking-wider font-extrabold text-slate-300 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-indigo-400" />
              Historique d'Audits
            </h3>
            <span className="text-[10px] text-slate-500 font-mono">5 derniers logs</span>
          </div>

          <div className="space-y-3 max-h-[220px] overflow-auto pr-1 no-scrollbar">
            {validations.slice(0, 5).map((v) => {
              const building = buildings.find((b) => b.id === v.building_id);
              const isApproved = v.status === 'approved';
              const isRejected = v.status === 'rejected';

              return (
                <div
                  key={v.id}
                  className="p-3 bg-slate-950/60 border border-slate-850 rounded-xl flex items-center justify-between text-xs"
                >
                  <div className="space-y-1 flex-1">
                    <span className="text-slate-200 font-semibold font-sans block leading-none">
                      {v.type === 'livreur_validation'
                        ? 'Validation terrain'
                        : v.type === 'modification_request'
                        ? 'Arbitrage lot'
                        : 'Action d\'usager'}
                    </span>
                    <span className="text-[10.5px] font-mono text-slate-400 block pt-0.5">
                      Target : <strong className="text-indigo-400 font-mono">{building?.hailand_code || 'ID_' + v.building_id}</strong>
                    </span>
                  </div>

                  <span className={`text-[9px] uppercase font-mono font-bold px-2 py-0.5 rounded border ${
                    isApproved 
                      ? 'bg-emerald-950/70 text-emerald-400 border-emerald-500/10' 
                      : isRejected 
                      ? 'bg-red-950/70 text-red-400 border-red-500/10' 
                      : 'bg-indigo-950/70 text-indigo-400 border-indigo-500/10'
                  }`}>
                    {isApproved ? 'Aprouvé' : isRejected ? 'Rejeté' : 'Arbitrage'}
                  </span>
                </div>
              );
            })}

            {validations.length === 0 && (
              <div className="text-center text-slate-500 text-xs font-mono py-8">
                📡 Aucun log d'activité de modération recensé.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
