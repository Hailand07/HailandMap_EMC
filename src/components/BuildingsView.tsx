/**
 * HailandMap Admin — Registre National d'Adressage Numérique (v6.0 Cadastre d'État)
 * 
 * Interface complète, détaillée et ultra-flexible de consultation et gestion
 * du cadastre numérique de Guinée (inspirée des data grids modernes de type Supabase).
 * 
 * Fonctionnalités majeures :
 * - Double Adressage Hybride intégré : Système 1 (Grille 200m) + Système 2 (Hiérarchie Administrative)
 * - Gestion intégrale de la logique Mère-Enfant (Concessions / Cours mères et bâtiments enfants rattachés)
 * - Multi-modes d'affichage : Tableur Cadastral Pro, Vue Hiérarchique Arbre (Mère ➔ Enfants), Vue Fiches
 * - Dossier Cadastral Exhaustif (Modal d'inspection 360° avec toutes les données du formulaire de relevé)
 * - Filtres à facettes (Commune, Quartier, Typologie, Nature, Statut)
 * - Exportation des données en CSV et GeoJSON
 * - Outil de contrôle spatial Turf.js intégré
 */

import React, { useMemo, useState, useEffect } from 'react';
import {
  Search,
  Filter,
  ChevronRight,
  ChevronDown,
  Building2,
  MapPin,
  User,
  ArrowUpDown,
  BookOpen,
  Database,
  Grid,
  List,
  Layers,
  ExternalLink,
  Compass,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  Sparkles,
  Download,
  Copy,
  Check,
  Eye,
  Home,
  Store,
  Landmark,
  Hotel,
  ShieldAlert,
  Tent,
  FileSpreadsheet,
  Maximize2,
  Navigation,
  Key,
  Calendar,
  Share2,
  FolderTree,
  DoorClosed
} from 'lucide-react';
import type { Building, BuildingStatus, BuildingType, Profile } from '../types';
import { STATUS_COLORS } from '../types';
import { getAgentReporterInfo, type AgentDisplayInfo } from '../utils/agentHelper';
import AgentHistoryModal from './AgentHistoryModal';
import { reassignBuildingsToCommunes, type ReassignCommuneReport } from '../lib/spatialReassignment';
import { computeDualAddressing, backfillAdministrativeAddresses } from '../lib/administrativeAddressingService';
import * as turf from '@turf/turf';

interface BuildingsViewProps {
  buildings: Building[];
  profiles: Profile[];
  onSelect: (b: Building) => void;
  isDark: boolean;
  onRefresh?: () => Promise<void> | void;
}

type ViewMode = 'table' | 'hierarchy' | 'cards';
type SortKey = 'hailand_code' | 'admin_address_code' | 'commune' | 'quartier' | 'building_type' | 'status' | 'created_at';
type NatureFilter = 'all' | 'mother' | 'child' | 'direct';

const TYPE_CONFIG: Record<string, { label: string; icon: any; color: string; badgeBg: string }> = {
  R: { label: 'Résidentiel', icon: Home, color: 'text-orange-400', badgeBg: 'bg-orange-950/80 border-orange-500/30' },
  C: { label: 'Commercial', icon: Store, color: 'text-cyan-400', badgeBg: 'bg-cyan-950/80 border-cyan-500/30' },
  M: { label: 'Mixte', icon: Building2, color: 'text-purple-400', badgeBg: 'bg-purple-950/80 border-purple-500/30' },
  A: { label: 'Administratif', icon: Landmark, color: 'text-blue-400', badgeBg: 'bg-blue-950/80 border-blue-500/30' },
  H: { label: 'Hôtel / Hébergement', icon: Hotel, color: 'text-amber-400', badgeBg: 'bg-amber-950/80 border-amber-500/30' },
  P: { label: 'Public / Établissement', icon: ShieldAlert, color: 'text-emerald-400', badgeBg: 'bg-emerald-950/80 border-emerald-500/30' },
  T: { label: 'Temporaire / Kiosque', icon: Tent, color: 'text-slate-400', badgeBg: 'bg-slate-900 border-slate-700' },
};

export default function BuildingsView({
  buildings,
  profiles,
  onSelect,
  onRefresh,
}: BuildingsViewProps) {
  // Synchronisation des bâtiments enrichis avec le double adressage
  const enrichedBuildings = useMemo(() => {
    return buildings.map((b) => {
      try {
        const dual = computeDualAddressing(b);
        return {
          ...b,
          commune: dual.adminAddress.communeNom || b.commune,
          commune_id: dual.adminAddress.communeId || b.commune_id,
          quartier: b.quartier || dual.adminAddress.quartierNom,
          quartier_id: b.quartier_id || dual.adminAddress.quartierId,
          region: b.region || dual.adminAddress.regionNom,
          prefecture: b.prefecture || dual.adminAddress.prefectureNom,
          admin_address_code: b.admin_address_code || dual.adminAddress.adminAddressCode,
          formatted_address: b.formatted_address || dual.adminAddress.formattedAddress,
        };
      } catch {
        return b;
      }
    });
  }, [buildings]);

  const [localBuildings, setLocalBuildings] = useState<Building[]>(enrichedBuildings);
  useEffect(() => {
    setLocalBuildings(enrichedBuildings);
  }, [enrichedBuildings]);

  // États de l'interface
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [search, setSearch] = useState('');
  const [communeFilter, setCommuneFilter] = useState<string>('all');
  const [quartierFilter, setQuartierFilter] = useState<string>('all');
  const [natureFilter, setNatureFilter] = useState<NatureFilter>('all');
  const [statusFilter, setStatusFilter] = useState<BuildingStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortAsc, setSortAsc] = useState(false);

  // État de sélection / inspection détaillée
  const [inspectedBuilding, setInspectedBuilding] = useState<Building | null>(null);
  const [inspectionTab, setInspectionTab] = useState<'address' | 'architecture' | 'access' | 'governance'>('address');
  const [selectedAgentForHistory, setSelectedAgentForHistory] = useState<AgentDisplayInfo | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Arbre hiérarchique : concessions mères déployées
  const [expandedMotherIds, setExpandedMotherIds] = useState<Set<string>>(new Set());

  // États pour l'audit et réassignation spatiale Turf
  const [isReassigning, setIsReassigning] = useState(false);
  const [reassignReport, setReassignReport] = useState<ReassignCommuneReport | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number; inconsistentCount: number } | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  // État pour la synchronisation administrative souveraine (Backfill)
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ updatedCount: number; total: number } | null>(null);

  // Calculs géométriques pour le dossier cadastral 360°
  const inspectedArea = useMemo(() => {
    if (!inspectedBuilding?.geom) return 0;
    try {
      return Math.round(turf.area(inspectedBuilding.geom as any));
    } catch {
      return 0;
    }
  }, [inspectedBuilding]);

  const inspectedPerimeter = useMemo(() => {
    if (!inspectedBuilding?.geom) return 0;
    try {
      const line = turf.polygonToLine(inspectedBuilding.geom as any);
      return Math.round(turf.length(line as any, { units: 'meters' }));
    } catch {
      return 0;
    }
  }, [inspectedBuilding]);

  // Listes d'options pour les filtres
  const allCommunes = useMemo(() => {
    const list = Array.from(new Set(localBuildings.map((b) => b.commune).filter(Boolean))).sort();
    return list;
  }, [localBuildings]);

  const allQuartiers = useMemo(() => {
    const list = Array.from(
      new Set(
        localBuildings
          .filter((b) => communeFilter === 'all' || b.commune === communeFilter)
          .map((b) => b.quartier)
          .filter(Boolean) as string[]
      )
    ).sort();
    return list;
  }, [localBuildings, communeFilter]);

  // Statistiques globales Cadastrales (KPIs)
  const stats = useMemo(() => {
    const total = localBuildings.length;
    const mothers = localBuildings.filter((b) => b.has_courtyard).length;
    const children = localBuildings.filter((b) => Boolean(b.parent_building_id)).length;
    const directs = localBuildings.filter((b) => !b.has_courtyard && !b.parent_building_id).length;
    const withDual = localBuildings.filter((b) => Boolean(b.hailand_code && b.admin_address_code)).length;
    const totalUnits = localBuildings.reduce((sum, b) => sum + (b.unit_count || 1), 0);
    return { total, mothers, children, directs, withDual, totalUnits };
  }, [localBuildings]);

  // Filtrage et tri principal
  const filteredBuildings = useMemo(() => {
    let list = [...localBuildings];

    // Recherche libre multi-critères
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((b) => {
        const hCode = (b.hailand_code || '').toLowerCase();
        const aCode = (b.admin_address_code || '').toLowerCase();
        const fAddr = (b.formatted_address || '').toLowerCase();
        const com = (b.commune || '').toLowerCase();
        const qtr = (b.quartier || '').toLowerCase();
        const lmk = (b.landmark_note || '').toLowerCase();
        const col = (b.door_color || '').toLowerCase();
        const agt = (b.submitted_by || '').toLowerCase();
        return (
          hCode.includes(q) ||
          aCode.includes(q) ||
          fAddr.includes(q) ||
          com.includes(q) ||
          qtr.includes(q) ||
          lmk.includes(q) ||
          col.includes(q) ||
          agt.includes(q)
        );
      });
    }

    // Filtres sélectifs
    if (communeFilter !== 'all') list = list.filter((b) => b.commune === communeFilter);
    if (quartierFilter !== 'all') list = list.filter((b) => b.quartier === quartierFilter);
    if (statusFilter !== 'all') list = list.filter((b) => b.status === statusFilter);
    if (typeFilter !== 'all') list = list.filter((b) => b.building_type === typeFilter);

    // Filtre de Nature (Mère / Enfant / Direct)
    if (natureFilter === 'mother') list = list.filter((b) => b.has_courtyard);
    else if (natureFilter === 'child') list = list.filter((b) => Boolean(b.parent_building_id));
    else if (natureFilter === 'direct') list = list.filter((b) => !b.has_courtyard && !b.parent_building_id);

    // Tri
    list.sort((a, b) => {
      let va = '', vb = '';
      if (sortKey === 'hailand_code') { va = a.hailand_code || ''; vb = b.hailand_code || ''; }
      else if (sortKey === 'admin_address_code') { va = a.admin_address_code || ''; vb = b.admin_address_code || ''; }
      else if (sortKey === 'commune') { va = a.commune || ''; vb = b.commune || ''; }
      else if (sortKey === 'quartier') { va = a.quartier || ''; vb = b.quartier || ''; }
      else if (sortKey === 'building_type') { va = a.building_type || ''; vb = b.building_type || ''; }
      else if (sortKey === 'status') { va = a.status || ''; vb = b.status || ''; }
      else if (sortKey === 'created_at') { va = a.created_at || ''; vb = b.created_at || ''; }
      const cmp = va.localeCompare(vb);
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [
    localBuildings,
    search,
    communeFilter,
    quartierFilter,
    natureFilter,
    statusFilter,
    typeFilter,
    sortKey,
    sortAsc,
  ]);

  // Structuration Arborescente Mère-Enfant
  const hierarchicalConcessions = useMemo(() => {
    // 1. Concessions mères (cours)
    const mothers = localBuildings.filter((b) => b.has_courtyard);
    // 2. Bâtiments directs autonomes (sans cour et sans parent)
    const autonomous = localBuildings.filter((b) => !b.has_courtyard && !b.parent_building_id);

    // Indexation des enfants par parent_building_id
    const childrenByParent = new Map<string, Building[]>();
    for (const b of localBuildings) {
      if (b.parent_building_id) {
        const existing = childrenByParent.get(b.parent_building_id) || [];
        existing.push(b);
        childrenByParent.set(b.parent_building_id, existing);
      }
    }

    return {
      mothers: mothers.map((m) => ({
        mother: m,
        children: childrenByParent.get(m.id) || [],
      })),
      autonomous,
    };
  }, [localBuildings]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const toggleExpandMother = (motherId: string) => {
    setExpandedMotherIds((prev) => {
      const next = new Set(prev);
      if (next.has(motherId)) next.delete(motherId);
      else next.add(motherId);
      return next;
    });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(label);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Exécution de l'Audit & Réassignation Spatiale
  const handleRunSpatialReassign = async () => {
    setIsReassigning(true);
    setProgress({ current: 0, total: localBuildings.length, inconsistentCount: 0 });
    try {
      const rep = await reassignBuildingsToCommunes({
        buildings: localBuildings,
        onProgress: (p) => setProgress(p),
      });
      setReassignReport(rep);
      setShowReportModal(true);
      if (rep.reassignedCount > 0) {
        if (onRefresh) {
          await onRefresh();
        }
      }
    } catch (e: any) {
      console.error('Erreur audit spatial:', e);
    } finally {
      setIsReassigning(false);
      setProgress(null);
    }
  };

  // Synchronisation & Rétro-enrichissement de l'Adressage Administratif Souverain
  const handleRunBackfill = async () => {
    setIsBackfilling(true);
    try {
      const res = await backfillAdministrativeAddresses(localBuildings);
      setBackfillResult({ updatedCount: res.updatedCount, total: res.enrichedBuildings.length });
      setLocalBuildings(res.enrichedBuildings);
      if (onRefresh) {
        await onRefresh();
      }
    } catch (e: any) {
      console.error('Erreur lors du backfill administratif:', e);
    } finally {
      setIsBackfilling(false);
    }
  };

  // Exportation CSV
  const handleExportCSV = () => {
    const headers = [
      'ID',
      'Code Grille (HailandCode)',
      'Code Administratif',
      'Nature',
      'Commune',
      'Quartier',
      'Type',
      'Etages',
      'Unites',
      'Unite Cible',
      'Etage Cible',
      'Statut',
      'Longitude',
      'Latitude',
      'Altitude (m)',
      'Portail / Entree',
      'Couleur Porte',
      'Repere',
      'Adresse Formatee',
      'Date Creation'
    ];

    const rows = filteredBuildings.map((b) => {
      const coords = b.centroid?.coordinates || [0, 0];
      const nature = b.has_courtyard
        ? 'Cour Mère'
        : b.parent_building_id
        ? 'Bâtiment Enfant'
        : 'Bâtiment Direct';
      return [
        b.id,
        b.hailand_code || '',
        b.admin_address_code || '',
        nature,
        b.commune || '',
        b.quartier || '',
        b.building_type || '',
        b.floor_count || 1,
        b.unit_count || 1,
        b.unit_code || '',
        b.floor_level || '',
        b.status || '',
        coords[0],
        coords[1],
        b.altitude_m || 35,
        b.entry_point_note || '',
        b.door_color || '',
        b.landmark_note || '',
        b.formatted_address ? `"${b.formatted_address.replace(/"/g, '""')}"` : '',
        b.created_at || ''
      ].join(';');
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `registre_cadastral_guinee_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Exportation GeoJSON
  const handleExportGeoJSON = () => {
    const featureCollection = {
      type: 'FeatureCollection',
      features: filteredBuildings.map((b) => ({
        type: 'Feature',
        id: b.id,
        geometry: b.geom || b.centroid,
        properties: {
          id: b.id,
          hailand_code: b.hailand_code,
          admin_address_code: b.admin_address_code,
          formatted_address: b.formatted_address,
          commune: b.commune,
          quartier: b.quartier,
          building_type: b.building_type,
          floor_count: b.floor_count,
          unit_count: b.unit_count,
          status: b.status,
          has_courtyard: b.has_courtyard,
          parent_building_id: b.parent_building_id,
          landmark_note: b.landmark_note,
          door_color: b.door_color,
          created_at: b.created_at,
        },
      })),
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(featureCollection, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `cadastre_guinee_${new Date().toISOString().slice(0, 10)}.geojson`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="p-4 md:p-8 space-y-6 text-slate-100 bg-slate-950 font-sans min-h-screen">
      {/* 🏛️ EN-TÊTE SUPÉRIEUR & TITRE OFFICIEL */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="px-2.5 py-0.5 rounded text-[10px] uppercase font-mono font-bold tracking-wider bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
              RÉPUBLIQUE DE GUINÉE · CADASTRE NATIONAL NUMÉRIQUE
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-950/80 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
              <Sparkles size={11} className="text-indigo-400" />
              DOUBLE ADRESSAGE HYBRIDE (GRILLE + ÉTAT)
            </span>
          </div>
          <h2 className="text-2xl font-bold font-display tracking-tight text-white flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-indigo-400" />
            Registre National des Concessions & Adresses
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Système souverain d'identification cadastrale couplant le maillage métrique territorial (Grilles de 200m)
            et l'organisation administrative officielle (Région ➔ Préfecture ➔ Commune ➔ Quartier ➔ Lot).
          </p>
        </div>

        {/* BOUTONS D'ACTIONS GÉNÉRALES & OUTILS */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Synchronisation de l'Adressage Administratif Souverain (Backfill) */}
          <button
            onClick={handleRunBackfill}
            disabled={isBackfilling}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 hover:text-white rounded-xl text-xs font-semibold border border-emerald-500/30 transition shadow-sm cursor-pointer disabled:opacity-50"
            title="Calculer et synchroniser dans Supabase l'ensemble des adresses administratives souveraines (Région, Ville, Commune, Quartier, Code Administratif)"
          >
            {isBackfilling ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                <span>Sync Adressage...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>Sync Adressage État</span>
              </>
            )}
          </button>

          {/* Audit Spatial Turf */}
          <button
            onClick={handleRunSpatialReassign}
            disabled={isReassigning}
            className="flex items-center gap-2 px-3 py-2 bg-slate-900 hover:bg-slate-850 text-indigo-300 hover:text-white rounded-xl text-xs font-semibold border border-indigo-500/30 transition shadow-sm cursor-pointer disabled:opacity-50"
            title="Vérifier la conformité point-dans-polygone de chaque bâtiment avec sa commune"
          >
            {isReassigning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                <span>Audit Turf... {progress ? `${progress.current}/${progress.total}` : ''}</span>
              </>
            ) : (
              <>
                <Compass className="w-4 h-4 text-indigo-400" />
                <span>Audit Spatial (Turf)</span>
              </>
            )}
          </button>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-slate-800 transition cursor-pointer"
            title="Exporter les données filtrées en format tableur CSV"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>CSV</span>
          </button>

          {/* Export GeoJSON */}
          <button
            onClick={handleExportGeoJSON}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-slate-800 transition cursor-pointer"
            title="Exporter les géométries et attributs complets en GeoJSON"
          >
            <Download className="w-4 h-4 text-cyan-400" />
            <span>GeoJSON</span>
          </button>

          {/* Rafraîchissement */}
          {onRefresh && (
            <button
              onClick={() => onRefresh()}
              className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl border border-slate-800 transition cursor-pointer"
              title="Recharger les données depuis Supabase"
            >
              <Database className="w-4 h-4 text-indigo-400" />
            </button>
          )}
        </div>
      </div>

      {/* 📊 BARRE DES MÉTRIQUES ANALYTIQUES CADASTRALES (KPIS) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-mono uppercase tracking-wider">
            <span>Lots Indexés</span>
            <Database size={13} className="text-indigo-400" />
          </div>
          <div className="text-xl font-bold font-mono text-white mt-1">{stats.total}</div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">100% vectorisés</div>
        </div>

        <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-mono uppercase tracking-wider">
            <span>Concessions Mères</span>
            <Home size={13} className="text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-300 mt-1">{stats.mothers}</div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">Cours identifiées</div>
        </div>

        <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-mono uppercase tracking-wider">
            <span>Bâtiments Enfants</span>
            <Building2 size={13} className="text-cyan-400" />
          </div>
          <div className="text-xl font-bold font-mono text-cyan-300 mt-1">{stats.children}</div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">Dans concessions</div>
        </div>

        <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-mono uppercase tracking-wider">
            <span>Bâtiments Directs</span>
            <Layers size={13} className="text-purple-400" />
          </div>
          <div className="text-xl font-bold font-mono text-purple-300 mt-1">{stats.directs}</div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">Hors cour / Isolés</div>
        </div>

        <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-mono uppercase tracking-wider">
            <span>Capacité Unités</span>
            <DoorClosed size={13} className="text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-300 mt-1">{stats.totalUnits}</div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">Logements / Portes</div>
        </div>

        <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-mono uppercase tracking-wider">
            <span>Double Adressage</span>
            <CheckCircle2 size={13} className="text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-400 mt-1">100%</div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">Grille + Administratif</div>
        </div>
      </div>

      {/* 🌟 BANNIÈRE DE SUCCÈS SYNCHRONISATION ADMINISTRATIVE */}
      {backfillResult && (
        <div className="bg-emerald-950/90 border border-emerald-500/40 p-4 rounded-2xl flex items-center justify-between text-xs text-emerald-200 animate-in fade-in duration-200 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-900/60 border border-emerald-500/30 text-emerald-400">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <div className="font-bold text-sm text-white">
                Synchronisation de l'Adressage Administratif Souverain Réussie !
              </div>
              <div className="text-emerald-300 text-[11px] mt-0.5">
                {backfillResult.updatedCount} lot(s) mis à jour dans Supabase avec leurs régions, préfectures, communes, quartiers officiels et codes d'adressage hybrides (sur {backfillResult.total} analysés).
              </div>
            </div>
          </div>
          <button
            onClick={() => setBackfillResult(null)}
            className="p-1.5 rounded-lg hover:bg-emerald-900 text-emerald-400 hover:text-white transition cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* 🔍 BARRE DE COMMANDES, RECHERCHE & FILTRES À FACETTES */}
      <div className="space-y-3 bg-slate-900/40 p-4 rounded-2xl border border-slate-800/80">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Barre de recherche plein-texte */}
          <div className="relative flex-1 w-full">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Recherche globale : code grille (ex: Z014-CR001), code administratif (ex: RTM.KIP), commune, quartier, repère, agent..."
              className="w-full bg-slate-950/90 border border-slate-800 hover:border-slate-700 focus:border-indigo-500 rounded-xl pl-10 pr-10 py-2.5 text-xs text-slate-100 placeholder-slate-500 outline-none transition font-sans"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Commutateur de Mode de Visualisation */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Vue Tableur Cadastral (Supabase Data Grid)"
            >
              <List size={14} />
              <span>Table</span>
            </button>

            <button
              onClick={() => setViewMode('hierarchy')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                viewMode === 'hierarchy'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Vue Arborescente Mère-Enfant (Concessions & Bâtiments)"
            >
              <FolderTree size={14} />
              <span>Arbre Mère-Enfant</span>
            </button>

            <button
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Vue Fiches Visuelles"
            >
              <Grid size={14} />
              <span>Fiches</span>
            </button>
          </div>
        </div>

        {/* Filtres déroulants spécifiques */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/50">
          {/* Filtre Commune */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800 text-xs">
            <span className="text-[10px] uppercase font-mono text-slate-500">Commune :</span>
            <select
              value={communeFilter}
              onChange={(e) => {
                setCommuneFilter(e.target.value);
                setQuartierFilter('all');
              }}
              className="bg-transparent text-slate-200 font-semibold outline-none cursor-pointer pr-1"
            >
              <option value="all" className="bg-slate-900 text-slate-200">Toutes les communes ({allCommunes.length})</option>
              {allCommunes.map((c) => (
                <option key={c} value={c} className="bg-slate-900 text-slate-200">
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Filtre Quartier */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800 text-xs">
            <span className="text-[10px] uppercase font-mono text-slate-500">Quartier :</span>
            <select
              value={quartierFilter}
              onChange={(e) => setQuartierFilter(e.target.value)}
              className="bg-transparent text-slate-200 font-semibold outline-none cursor-pointer pr-1"
            >
              <option value="all" className="bg-slate-900 text-slate-200">Tous les quartiers ({allQuartiers.length})</option>
              {allQuartiers.map((q) => (
                <option key={q} value={q} className="bg-slate-900 text-slate-200">
                  {q}
                </option>
              ))}
            </select>
          </div>

          {/* Filtre Nature Concession */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800 text-xs">
            <span className="text-[10px] uppercase font-mono text-slate-500">Nature :</span>
            <select
              value={natureFilter}
              onChange={(e) => setNatureFilter(e.target.value as NatureFilter)}
              className="bg-transparent text-slate-200 font-semibold outline-none cursor-pointer pr-1"
            >
              <option value="all" className="bg-slate-900 text-slate-200">Toutes les natures</option>
              <option value="mother" className="bg-slate-900 text-amber-300">Concessions Mères (Cours)</option>
              <option value="child" className="bg-slate-900 text-cyan-300">Bâtiments Enfants (Rattachés)</option>
              <option value="direct" className="bg-slate-900 text-purple-300">Bâtiments Directs (Autonomes)</option>
            </select>
          </div>

          {/* Filtre Typologie */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800 text-xs">
            <span className="text-[10px] uppercase font-mono text-slate-500">Type :</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-transparent text-slate-200 font-semibold outline-none cursor-pointer pr-1"
            >
              <option value="all" className="bg-slate-900 text-slate-200">Tous les types</option>
              {Object.entries(TYPE_CONFIG).map(([t, cfg]) => (
                <option key={t} value={t} className="bg-slate-900 text-slate-200">
                  {cfg.label} ({t})
                </option>
              ))}
            </select>
          </div>

          {/* Filtre Statut */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800 text-xs">
            <span className="text-[10px] uppercase font-mono text-slate-500">Statut :</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-transparent text-slate-200 font-semibold outline-none cursor-pointer pr-1"
            >
              <option value="all" className="bg-slate-900 text-slate-200">Tous les statuts</option>
              {Object.entries(STATUS_COLORS).map(([status, sc]) => (
                <option key={status} value={status} className="bg-slate-900 text-slate-200">
                  {sc.label}
                </option>
              ))}
            </select>
          </div>

          {/* Réinitialisation filtres si actifs */}
          {(search || communeFilter !== 'all' || quartierFilter !== 'all' || natureFilter !== 'all' || statusFilter !== 'all' || typeFilter !== 'all') && (
            <button
              onClick={() => {
                setSearch('');
                setCommuneFilter('all');
                setQuartierFilter('all');
                setNatureFilter('all');
                setStatusFilter('all');
                setTypeFilter('all');
              }}
              className="text-xs text-rose-400 hover:text-rose-300 underline underline-offset-2 px-2 py-1 cursor-pointer font-mono"
            >
              Effacer filtres
            </button>
          )}

          <div className="ml-auto text-xs font-mono text-slate-400">
            Affichage : <span className="text-white font-bold">{filteredBuildings.length}</span> / {localBuildings.length} lots
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODE 1 : VUE TABLEUR CADASRAL PRO (DATA GRID SUPABASE-LIKE)               */}
      {/* ========================================================================= */}
      {viewMode === 'table' && (
        <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-900/60 shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase font-mono text-slate-400 select-none">
                <tr>
                  <th className="p-3.5 font-bold">
                    <button
                      onClick={() => toggleSort('hailand_code')}
                      className="flex items-center gap-1.5 hover:text-white cursor-pointer"
                    >
                      <span>① Code Grille (200m)</span>
                      <ArrowUpDown size={11} className={sortKey === 'hailand_code' ? 'text-indigo-400' : 'text-slate-600'} />
                    </button>
                  </th>
                  <th className="p-3.5 font-bold">
                    <button
                      onClick={() => toggleSort('admin_address_code')}
                      className="flex items-center gap-1.5 hover:text-white cursor-pointer"
                    >
                      <span>② Code Administratif (État)</span>
                      <ArrowUpDown size={11} className={sortKey === 'admin_address_code' ? 'text-indigo-400' : 'text-slate-600'} />
                    </button>
                  </th>
                  <th className="p-3.5 font-bold hidden sm:table-cell">Nature & Liens</th>
                  <th className="p-3.5 font-bold">
                    <button
                      onClick={() => toggleSort('commune')}
                      className="flex items-center gap-1.5 hover:text-white cursor-pointer"
                    >
                      <span>Commune / Quartier</span>
                      <ArrowUpDown size={11} className={sortKey === 'commune' ? 'text-indigo-400' : 'text-slate-600'} />
                    </button>
                  </th>
                  <th className="p-3.5 font-bold hidden md:table-cell">Type & Structure</th>
                  <th className="p-3.5 font-bold hidden lg:table-cell">Point d'Accès / Repère</th>
                  <th className="p-3.5 font-bold">
                    <button
                      onClick={() => toggleSort('status')}
                      className="flex items-center gap-1.5 hover:text-white cursor-pointer"
                    >
                      <span>Statut</span>
                      <ArrowUpDown size={11} className={sortKey === 'status' ? 'text-indigo-400' : 'text-slate-600'} />
                    </button>
                  </th>
                  <th className="p-3.5 font-bold hidden xl:table-cell">
                    <button
                      onClick={() => toggleSort('created_at')}
                      className="flex items-center gap-1.5 hover:text-white cursor-pointer"
                    >
                      <span>Enregistré le</span>
                      <ArrowUpDown size={11} className={sortKey === 'created_at' ? 'text-indigo-400' : 'text-slate-600'} />
                    </button>
                  </th>
                  <th className="p-3.5 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filteredBuildings.map((b) => {
                  const sc = STATUS_COLORS[b.status] || STATUS_COLORS.en_attente;
                  const typeCfg = TYPE_CONFIG[b.building_type] || TYPE_CONFIG.R;
                  const isMother = b.has_courtyard;
                  const isChild = Boolean(b.parent_building_id);

                  return (
                    <tr
                      key={b.id}
                      onClick={() => setInspectedBuilding(b)}
                      className="hover:bg-slate-800/40 transition cursor-pointer group"
                    >
                      {/* Code Grille (Système 1) */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-orange-400 group-hover:text-orange-300">
                            {b.hailand_code || 'En cours'}
                          </span>
                        </div>
                        {b.unit_code && (
                          <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                            Porte/Lot : <strong className="text-emerald-400">{b.unit_code}</strong>
                            {b.floor_level ? ` (${b.floor_level})` : ''}
                          </span>
                        )}
                      </td>

                      {/* Code Administratif (Système 2) */}
                      <td className="p-3.5">
                        <span className="font-mono font-semibold text-xs text-emerald-300 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20 block w-fit">
                          {b.admin_address_code || 'En cours'}
                        </span>
                      </td>

                      {/* Nature & Relation Mère-Enfant */}
                      <td className="p-3.5 hidden sm:table-cell">
                        {isMother && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase bg-amber-950 text-amber-300 border border-amber-500/30">
                            <Home size={10} /> Cour Mère ({b.unit_count || 1})
                          </span>
                        )}
                        {isChild && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase bg-cyan-950 text-cyan-300 border border-cyan-500/30" title={`Rattaché à ${b.parent_building_id}`}>
                            <Building2 size={10} /> Bât. Enfant
                          </span>
                        )}
                        {!isMother && !isChild && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase bg-slate-900 text-slate-400 border border-slate-700">
                            Direct
                          </span>
                        )}
                      </td>

                      {/* Commune / Quartier */}
                      <td className="p-3.5">
                        <div className="font-semibold text-slate-200">{b.commune}</div>
                        <div className="text-[11px] text-slate-400">
                          {b.quartier ? `Quartier ${b.quartier}` : 'Quartier non assigné'}
                        </div>
                      </td>

                      {/* Type & Structure */}
                      <td className="p-3.5 hidden md:table-cell text-slate-300">
                        <div className="flex items-center gap-1.5 font-medium">
                          <span className={typeCfg.color}>{typeCfg.label}</span>
                          <span className="text-slate-500">·</span>
                          <span className="text-[11px] font-mono text-slate-400">
                            {b.floor_count ? `R+${b.floor_count}` : 'RDC'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {b.unit_count || 1} unité(s)
                        </div>
                      </td>

                      {/* Point d'Accès & Repère */}
                      <td className="p-3.5 hidden lg:table-cell text-slate-300">
                        <div className="truncate max-w-[220px] text-slate-300 font-medium">
                          {b.landmark_note || b.entry_point_note || '—'}
                        </div>
                        {b.door_color && (
                          <span className="text-[10px] text-slate-500">
                            Porte : {b.door_color}
                          </span>
                        )}
                      </td>

                      {/* Statut */}
                      <td className="p-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            b.status === 'actif'
                              ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/20'
                              : b.status === 'conteste'
                              ? 'bg-red-950/80 text-red-400 border border-red-500/20'
                              : 'bg-indigo-950/80 text-indigo-400 border border-indigo-500/20'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              b.status === 'actif'
                                ? 'bg-emerald-400'
                                : b.status === 'conteste'
                                ? 'bg-red-400'
                                : 'bg-indigo-400'
                            }`}
                          />
                          {sc.label}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="p-3.5 hidden xl:table-cell text-slate-400 font-mono text-[11px]">
                        {new Date(b.created_at).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelect(b);
                            }}
                            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
                            title="Localiser sur la carte interactive"
                          >
                            <MapPin size={13} className="text-indigo-400" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setInspectedBuilding(b);
                            }}
                            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
                            title="Ouvrir le dossier cadastral complet"
                          >
                            <ChevronRight size={14} className="group-hover:translate-x-0.5 transition" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredBuildings.length === 0 && (
            <div className="p-12 text-center text-slate-500 text-xs font-mono">
              📭 Aucun lot cadastral ne correspond aux paramètres de votre requête.
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 2 : VUE ARBORESCENTE MÈRE-ENFANT (CONCESSIONS & BÂTIMENTS)            */}
      {/* ========================================================================= */}
      {viewMode === 'hierarchy' && (
        <div className="space-y-4">
          <div className="text-xs text-slate-400 font-mono bg-slate-900/60 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
            <span>
              Affichage de la structure hiérarchique foncière : <strong className="text-amber-400">{hierarchicalConcessions.mothers.length} Cours mères</strong> et <strong className="text-purple-400">{hierarchicalConcessions.autonomous.length} Bâtiments autonomes</strong>.
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setExpandedMotherIds(new Set(hierarchicalConcessions.mothers.map(m => m.mother.id)))}
                className="text-[11px] text-indigo-400 hover:underline cursor-pointer"
              >
                Déplier tout
              </button>
              <span>·</span>
              <button
                onClick={() => setExpandedMotherIds(new Set())}
                className="text-[11px] text-slate-400 hover:underline cursor-pointer"
              >
                Replier tout
              </button>
            </div>
          </div>

          {/* Section 1 : Concessions Mères et leurs Enfants */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-amber-400 font-mono uppercase tracking-wider flex items-center gap-2">
              <Home size={15} /> Concessions Mères & Bâtiments Rattachés
            </h3>

            {hierarchicalConcessions.mothers.map(({ mother, children }) => {
              const isExpanded = expandedMotherIds.has(mother.id);
              const totalChildrenUnits = children.reduce((sum, c) => sum + (c.unit_count || 1), 0);

              return (
                <div
                  key={mother.id}
                  className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden transition shadow-lg"
                >
                  {/* Carte Concession Mère (En-tête dépliable) */}
                  <div
                    onClick={() => toggleExpandMother(mother.id)}
                    className="p-4 bg-slate-950/80 hover:bg-slate-900/80 transition cursor-pointer flex items-center justify-between gap-4 select-none"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-amber-950/80 border border-amber-500/30 text-amber-400">
                        <Home size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-sm text-white">
                            {mother.hailand_code || mother.id}
                          </span>
                          <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">
                            {mother.admin_address_code || 'Code État'}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500/30">
                            {children.length} bâtiment(s) enfant(s)
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          📍 {mother.formatted_address || `${mother.commune} · ${mother.quartier || 'Non défini'}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right hidden sm:block">
                        <div className="text-xs font-mono font-bold text-slate-200">
                          {totalChildrenUnits} unités totales
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {mother.landmark_note || 'Concession familiale'}
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectedBuilding(mother);
                        }}
                        className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-xs text-indigo-300 rounded-lg border border-slate-700 transition"
                      >
                        Dossier
                      </button>

                      <div className="p-1 text-slate-400">
                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </div>
                    </div>
                  </div>

                  {/* Liste Indentée des Bâtiments Enfants */}
                  {isExpanded && (
                    <div className="p-3 bg-slate-950/40 border-t border-slate-800/80 space-y-2">
                      {children.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-500 font-mono">
                          Aucun bâtiment enfant n'a encore été rattaché à cette concession.
                        </div>
                      ) : (
                        children.map((child, idx) => {
                          const childCfg = TYPE_CONFIG[child.building_type] || TYPE_CONFIG.R;
                          return (
                            <div
                              key={child.id}
                              onClick={() => setInspectedBuilding(child)}
                              className="ml-4 sm:ml-8 p-3 rounded-xl bg-slate-900 border border-slate-800/80 hover:border-slate-700 transition cursor-pointer flex items-center justify-between gap-3 group"
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="w-5 h-5 rounded-full bg-cyan-950 text-cyan-400 font-mono text-[10px] font-bold flex items-center justify-center border border-cyan-500/30">
                                  {idx + 1}
                                </span>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-xs text-cyan-300">
                                      {child.hailand_code}
                                    </span>
                                    <span className="text-[11px] font-mono text-emerald-400">
                                      {child.admin_address_code}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-400 mt-0.5">
                                    {childCfg.label} · {child.floor_count ? `R+${child.floor_count}` : 'RDC'} · {child.unit_count || 1} unité(s)
                                    {child.landmark_note ? ` · Repère: ${child.landmark_note}` : ''}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {child.unit_code && (
                                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/20">
                                    Porte {child.unit_code}
                                  </span>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelect(child);
                                  }}
                                  className="p-1 text-slate-400 hover:text-white"
                                  title="Localiser sur la carte"
                                >
                                  <MapPin size={13} className="text-indigo-400" />
                                </button>
                                <ChevronRight size={14} className="text-slate-500 group-hover:translate-x-0.5 transition" />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Section 2 : Bâtiments Autonomes (Directs) */}
          {hierarchicalConcessions.autonomous.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-800">
              <h3 className="text-sm font-bold text-purple-400 font-mono uppercase tracking-wider flex items-center gap-2">
                <Layers size={15} /> Bâtiments Autonomes (Relevés directs hors-concession)
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {hierarchicalConcessions.autonomous.map((b) => (
                  <div
                    key={b.id}
                    onClick={() => setInspectedBuilding(b)}
                    className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    <div>
                      <div className="font-mono font-bold text-xs text-purple-300">
                        {b.hailand_code}
                      </div>
                      <div className="font-mono text-[11px] text-emerald-400 mt-0.5">
                        {b.admin_address_code}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        📍 {b.commune} · {b.quartier || 'Quartier non assigné'}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800">
                        {TYPE_CONFIG[b.building_type]?.label || b.building_type}
                      </span>
                      <ChevronRight size={14} className="text-slate-500 ml-auto mt-2 group-hover:translate-x-0.5 transition" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 3 : VUE CARTES CADASTRALES VISUELLES                                  */}
      {/* ========================================================================= */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBuildings.map((b) => {
            const sc = STATUS_COLORS[b.status] || STATUS_COLORS.en_attente;
            const typeCfg = TYPE_CONFIG[b.building_type] || TYPE_CONFIG.R;
            const isMother = b.has_courtyard;
            const isChild = Boolean(b.parent_building_id);

            return (
              <div
                key={b.id}
                onClick={() => setInspectedBuilding(b)}
                className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 transition shadow-lg flex flex-col justify-between cursor-pointer group"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        b.status === 'actif'
                          ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/20'
                          : 'bg-indigo-950/80 text-indigo-400 border border-indigo-500/20'
                      }`}
                    >
                      {sc.label}
                    </span>

                    {isMother && (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500/30">
                        Cour Mère
                      </span>
                    )}
                    {isChild && (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                        Bât. Enfant
                      </span>
                    )}
                  </div>

                  {/* Double Code */}
                  <div className="space-y-1 my-2">
                    <div className="font-mono font-bold text-sm text-orange-400 group-hover:text-orange-300">
                      {b.hailand_code || b.id}
                    </div>
                    <div className="font-mono text-xs font-semibold text-emerald-300">
                      {b.admin_address_code || 'Code État non généré'}
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 line-clamp-2 mt-2">
                    📍 {b.formatted_address || `${b.commune}, ${b.quartier || 'Guinée'}`}
                  </p>

                  {b.landmark_note && (
                    <div className="text-[11px] text-slate-400 mt-2 bg-slate-950/70 p-2 rounded-xl border border-slate-800/80">
                      🚩 <span className="font-medium text-slate-300">{b.landmark_note}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>
                    {typeCfg.label} ({b.floor_count ? `R+${b.floor_count}` : 'RDC'})
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(b);
                    }}
                    className="p-1 hover:text-white flex items-center gap-1 text-indigo-400"
                  >
                    <MapPin size={12} />
                    <span>Carte</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📁 DOSSIER CADASTRAL COMPLET (MODAL D'INSPECTION 360°)                      */}
      {/* ========================================================================= */}
      {inspectedBuilding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-3xl max-h-[92vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            {/* Header Modal */}
            <div className="p-5 border-b border-slate-800 bg-slate-950 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-indigo-950/80 border border-indigo-500/30 text-indigo-400">
                  <BookOpen className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 font-bold border border-indigo-500/30">
                      DOSSIER CADASTRAL D'ÉTAT
                    </span>
                    <span className="text-xs font-mono text-slate-500">
                      ID : {inspectedBuilding.id}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold font-display text-white mt-0.5">
                    {inspectedBuilding.hailand_code || 'Lot non codé'}
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onSelect(inspectedBuilding)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  <MapPin size={13} />
                  <span>Voir Carte 3D</span>
                </button>
                <button
                  onClick={() => setInspectedBuilding(null)}
                  className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Onglets d'inspection */}
            <div className="flex items-center gap-2 px-5 pt-3 border-b border-slate-800 bg-slate-950/60 overflow-x-auto text-xs font-semibold">
              <button
                onClick={() => setInspectionTab('address')}
                className={`pb-3 px-2 border-b-2 transition cursor-pointer whitespace-nowrap ${
                  inspectionTab === 'address'
                    ? 'border-indigo-500 text-white font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                ① Double Adressage & Localisation
              </button>
              <button
                onClick={() => setInspectionTab('architecture')}
                className={`pb-3 px-2 border-b-2 transition cursor-pointer whitespace-nowrap ${
                  inspectionTab === 'architecture'
                    ? 'border-indigo-500 text-white font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                ② Architecture & Morphologie
              </button>
              <button
                onClick={() => setInspectionTab('access')}
                className={`pb-3 px-2 border-b-2 transition cursor-pointer whitespace-nowrap ${
                  inspectionTab === 'access'
                    ? 'border-indigo-500 text-white font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                ③ Accès, Portails & Repères
              </button>
              <button
                onClick={() => setInspectionTab('governance')}
                className={`pb-3 px-2 border-b-2 transition cursor-pointer whitespace-nowrap ${
                  inspectionTab === 'governance'
                    ? 'border-indigo-500 text-white font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                ④ Traçabilité & Enquête
              </button>
            </div>

            {/* Corps du Modal d'Inspection */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs flex-1">
              {/* ONGLET 1 : DOUBLE ADRESSAGE */}
              {inspectionTab === 'address' && (
                <div className="space-y-4">
                  {/* Encadré Double Code */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-slate-950/80 p-4 rounded-2xl border border-orange-500/20 space-y-2">
                      <div className="flex items-center justify-between text-orange-400 font-mono text-[10px] uppercase font-bold">
                        <span>Système 1 : Grille Métrique (200m)</span>
                        <button
                          onClick={() => copyToClipboard(inspectedBuilding.hailand_code || '', 'grid')}
                          className="hover:text-white"
                          title="Copier le code grille"
                        >
                          {copiedCode === 'grid' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        </button>
                      </div>
                      <div className="text-base font-bold font-mono text-white">
                        {inspectedBuilding.hailand_code || 'Non défini'}
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Navigation fine, livraisons du dernier mètre et guidage d'urgence 112.
                      </p>
                    </div>

                    <div className="bg-slate-950/80 p-4 rounded-2xl border border-emerald-500/20 space-y-2">
                      <div className="flex items-center justify-between text-emerald-400 font-mono text-[10px] uppercase font-bold">
                        <span>Système 2 : Hiérarchique Administratif</span>
                        <button
                          onClick={() => copyToClipboard(inspectedBuilding.admin_address_code || '', 'admin')}
                          className="hover:text-white"
                          title="Copier le code administratif"
                        >
                          {copiedCode === 'admin' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        </button>
                      </div>
                      <div className="text-base font-bold font-mono text-emerald-300">
                        {inspectedBuilding.admin_address_code || 'Non défini'}
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Cadastre d'État, citoyenneté, fiscalité foncière et services publics.
                      </p>
                    </div>
                  </div>

                  {/* Adresse textuelle complète */}
                  <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-1.5">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">Adresse Postale & Civique Complète</div>
                    <div className="text-sm font-semibold text-slate-100 flex items-center justify-between gap-2">
                      <span>{inspectedBuilding.formatted_address || 'Non générée'}</span>
                      <button
                        onClick={() => copyToClipboard(inspectedBuilding.formatted_address || '', 'addr')}
                        className="text-slate-400 hover:text-white p-1"
                        title="Copier l'adresse complète"
                      >
                        {copiedCode === 'addr' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Fil d'Ariane Hiérarchique Administratif Officiel */}
                  <div className="bg-slate-950/80 p-4 rounded-2xl border border-indigo-500/20 space-y-2">
                    <div className="text-[10px] font-mono text-indigo-400 uppercase font-bold flex items-center gap-1.5">
                      <FolderTree size={12} />
                      <span>Hiérarchie Administrative Officielle de l'État</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-xs font-semibold text-slate-300">
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-white flex items-center gap-1">
                        <span>🇬🇳</span> Guinée
                      </span>
                      <span className="text-slate-600">›</span>
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-indigo-300">
                        {inspectedBuilding.region || 'Conakry'}
                      </span>
                      <span className="text-slate-600">›</span>
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-200">
                        {inspectedBuilding.prefecture || 'Conakry'}
                      </span>
                      <span className="text-slate-600">›</span>
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-emerald-300">
                        {inspectedBuilding.commune}
                      </span>
                      <span className="text-slate-600">›</span>
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-300">
                        Quartier {inspectedBuilding.quartier || 'Non assigné'}
                      </span>
                      <span className="text-slate-600">›</span>
                      <span className="px-2 py-0.5 rounded bg-amber-950 border border-amber-500/30 text-amber-300 font-mono">
                        {inspectedBuilding.has_courtyard ? 'Concession Mère' : 'Bâtiment'}
                      </span>
                    </div>
                  </div>

                  {/* Coordonnées Géographiques & Altitude */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                      <div className="text-[10px] font-mono text-slate-500">Commune</div>
                      <div className="text-xs font-bold text-white mt-0.5">{inspectedBuilding.commune}</div>
                    </div>
                    <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                      <div className="text-[10px] font-mono text-slate-500">Quartier</div>
                      <div className="text-xs font-bold text-white mt-0.5">{inspectedBuilding.quartier || 'Non assigné'}</div>
                    </div>
                    <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                      <div className="text-[10px] font-mono text-slate-500">Coordonnées GPS</div>
                      <div className="text-xs font-mono font-bold text-indigo-300 mt-0.5">
                        {inspectedBuilding.centroid?.coordinates
                          ? `[${inspectedBuilding.centroid.coordinates[0].toFixed(5)}, ${inspectedBuilding.centroid.coordinates[1].toFixed(5)}]`
                          : '—'}
                      </div>
                    </div>
                    <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                      <div className="text-[10px] font-mono text-slate-500">Altitude (m)</div>
                      <div className="text-xs font-mono font-bold text-white mt-0.5">{inspectedBuilding.altitude_m || 35} m</div>
                    </div>
                  </div>
                </div>
              )}

              {/* ONGLET 2 : ARCHITECTURE & MORPHOLOGIE */}
              {inspectionTab === 'architecture' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
                      <div className="text-[10px] font-mono text-slate-500">Usage / Typologie</div>
                      <div className="text-sm font-bold text-white mt-1">
                        {TYPE_CONFIG[inspectedBuilding.building_type]?.label || inspectedBuilding.building_type}
                      </div>
                    </div>

                    <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
                      <div className="text-[10px] font-mono text-slate-500">Hauteur / Niveaux</div>
                      <div className="text-sm font-bold text-white mt-1 font-mono">
                        {inspectedBuilding.floor_count ? `R+${inspectedBuilding.floor_count} étages` : 'Rez-de-chaussée (RDC)'}
                      </div>
                    </div>

                    <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
                      <div className="text-[10px] font-mono text-slate-500">Emprise au Sol (m²)</div>
                      <div className="text-sm font-bold text-cyan-300 mt-1 font-mono">
                        {inspectedArea > 0 ? `${inspectedArea} m²` : 'Calculé'}
                      </div>
                    </div>

                    <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
                      <div className="text-[10px] font-mono text-slate-500">Périmètre Bâti / Cour</div>
                      <div className="text-sm font-bold text-emerald-300 mt-1 font-mono">
                        {inspectedPerimeter > 0 ? `${inspectedPerimeter} m` : 'Standard'}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
                    <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
                      <div className="text-[10px] font-mono text-slate-500">Capacité Logements / Portes</div>
                      <div className="text-sm font-bold text-white mt-1 font-mono">
                        {inspectedBuilding.unit_count || 1} unité(s)
                      </div>
                    </div>

                    <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
                      <div className="text-[10px] font-mono text-slate-500">Position / Unité Spécifique</div>
                      <div className="text-sm font-bold text-amber-300 mt-1 font-mono">
                        {inspectedBuilding.unit_code ? `Porte ${inspectedBuilding.unit_code}${inspectedBuilding.floor_level ? ` (${inspectedBuilding.floor_level})` : ''}` : 'Bâtiment entier'}
                      </div>
                    </div>
                  </div>

                  {/* Structure Concession Mère / Enfant */}
                  <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-2">
                    <div className="text-[10px] font-mono text-slate-400 uppercase font-bold">
                      Logique Foncière Mère-Enfant
                    </div>
                    {inspectedBuilding.has_courtyard ? (
                      <div className="flex items-center gap-3 text-amber-300">
                        <Home size={20} />
                        <div>
                          <div className="font-bold text-white">Cette entité est une Concession Mère (Cour).</div>
                          <div className="text-slate-400 text-[11px] mt-0.5">
                            Elle regroupe plusieurs bâtiments enfants et dispose d'une enceinte délimitée.
                          </div>
                        </div>
                      </div>
                    ) : inspectedBuilding.parent_building_id ? (
                      <div className="flex items-center gap-3 text-cyan-300">
                        <Building2 size={20} />
                        <div>
                          <div className="font-bold text-white">Bâtiment Enfant rattaché à une cour.</div>
                          <div className="text-slate-400 text-[11px] mt-0.5">
                            ID Concession parente : <code className="font-mono text-cyan-400">{inspectedBuilding.parent_building_id}</code>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-slate-400">
                        Bâtiment autonome / direct (non rattaché à une concession de cour).
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ONGLET 3 : ACCÈS, PORTAIL & REPÈRES */}
              {inspectionTab === 'access' && (
                <div className="space-y-4">
                  <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-3">
                    <div className="text-[10px] font-mono text-slate-400 uppercase font-bold">
                      Paramètres d'Accès du Dernier Mètre
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Portail / Point d'entrée :</span>
                        <span className="font-medium text-slate-200">
                          {inspectedBuilding.entry_point_note || 'Aucune consigne saisie'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Couleur de porte :</span>
                        <span className="font-medium text-slate-200">
                          {inspectedBuilding.door_color || 'Non spécifiée'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Interphone / Sonnette :</span>
                        <span className="font-medium text-slate-200 font-mono">
                          {inspectedBuilding.intercom_code || 'Aucun code'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Position physique :</span>
                        <span className="font-medium text-slate-200">
                          {inspectedBuilding.physical_position || 'Standard'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {inspectedBuilding.landmark_note && (
                    <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-1">
                      <div className="text-[10px] font-mono text-slate-400 uppercase">Repère de Proximité Notoire (Landmark)</div>
                      <div className="text-sm font-semibold text-amber-300">
                        🚩 {inspectedBuilding.landmark_note}
                      </div>
                    </div>
                  )}

                  {inspectedBuilding.internal_directions && (
                    <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-1">
                      <div className="text-[10px] font-mono text-slate-400 uppercase">Consignes Internes d'Acheminement</div>
                      <div className="text-slate-300 text-xs">
                        {inspectedBuilding.internal_directions}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ONGLET 4 : GOUVERNANCE & TRAÇABILITÉ */}
              {inspectionTab === 'governance' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
                      <div className="text-[10px] font-mono text-slate-500">Agent Enquêteur</div>
                      <div className="text-xs font-bold text-white mt-1">
                        {inspectedBuilding.submitted_by || 'Administrateur'}
                      </div>
                    </div>

                    <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
                      <div className="text-[10px] font-mono text-slate-500">Date de Relevé Terrain</div>
                      <div className="text-xs font-mono font-bold text-white mt-1">
                        {new Date(inspectedBuilding.created_at).toLocaleString('fr-FR')}
                      </div>
                    </div>

                    <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
                      <div className="text-[10px] font-mono text-slate-500">Validateur Officiel</div>
                      <div className="text-xs font-bold text-emerald-400 mt-1">
                        {inspectedBuilding.validated_by || 'Système d\'État'}
                      </div>
                    </div>

                    <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
                      <div className="text-[10px] font-mono text-slate-500">Statut Cadastral</div>
                      <div className="text-xs font-bold text-white mt-1 capitalize">
                        {inspectedBuilding.status}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Modal */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const cardData = {
                      republique: 'République de Guinée',
                      ministere: 'Ministère de l\'Administration du Territoire et de la Décentralisation',
                      direction: 'Direction Nationale du Cadastre et de l\'Adressage Numérique',
                      code_grille_200m: inspectedBuilding.hailand_code,
                      code_administratif: inspectedBuilding.admin_address_code,
                      adresse_formatee: inspectedBuilding.formatted_address,
                      nature: inspectedBuilding.has_courtyard ? 'Concession Mère' : (inspectedBuilding.parent_building_id ? 'Bâtiment Enfant' : 'Bâtiment Direct'),
                      commune: inspectedBuilding.commune,
                      quartier: inspectedBuilding.quartier,
                      prefecture: inspectedBuilding.prefecture,
                      region: inspectedBuilding.region,
                      typologie: inspectedBuilding.building_type,
                      etages: inspectedBuilding.floor_count,
                      unites: inspectedBuilding.unit_count,
                      surface_m2: inspectedArea,
                      perimetre_m: inspectedPerimeter,
                      coordonnees_gps: inspectedBuilding.centroid?.coordinates,
                      altitude_m: inspectedBuilding.altitude_m,
                      acces: {
                        portail: inspectedBuilding.entry_point_note,
                        couleur_porte: inspectedBuilding.door_color,
                        sonnette: inspectedBuilding.intercom_code,
                        repere: inspectedBuilding.landmark_note,
                        directions: inspectedBuilding.internal_directions,
                      },
                      statut: inspectedBuilding.status,
                      date_releve: inspectedBuilding.created_at,
                    };
                    const blob = new Blob([JSON.stringify(cardData, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `fiche_cadastrale_${inspectedBuilding.hailand_code || inspectedBuilding.id}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition cursor-pointer"
                >
                  <Download size={13} className="text-cyan-400" />
                  <span>Exporter Fiche Cadastrale (JSON)</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setInspectedBuilding(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Fermer Dossier
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL HISTORIQUE AGENT */}
      <AgentHistoryModal
        isOpen={!!selectedAgentForHistory}
        onClose={() => setSelectedAgentForHistory(null)}
        agentInfo={selectedAgentForHistory}
        allBuildings={localBuildings}
        profiles={profiles}
        onSelectBuilding={(b) => {
          setSelectedAgentForHistory(null);
          onSelect(b);
        }}
      />

      {/* MODAL RAPPORT AUDIT SPATIAL TURF */}
      {showReportModal && reassignReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-950/80 border border-indigo-500/30 text-indigo-400">
                  <Compass className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Rapport de Contrôle Spatial (Turf.js)
                    {reassignReport.inconsistentCount > 0 ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950/80 text-amber-400 border border-amber-500/20">
                        {reassignReport.inconsistentCount} rectifiés
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/80 text-emerald-400 border border-emerald-500/20">
                        100% Conforme
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Test booléen centroïde point-dans-polygone (<code className="font-mono text-indigo-300">turf.booleanPointInPolygon</code>)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowReportModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 my-5">
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-center">
                <div className="text-[10px] uppercase font-mono text-slate-400">Bâtiments Audités</div>
                <div className="text-lg font-bold text-white font-mono mt-0.5">
                  {reassignReport.totalBuildingsChecked}
                </div>
              </div>
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-center">
                <div className="text-[10px] uppercase font-mono text-slate-400">Incohérences</div>
                <div className={`text-lg font-bold font-mono mt-0.5 ${reassignReport.inconsistentCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {reassignReport.inconsistentCount}
                </div>
              </div>
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-center">
                <div className="text-[10px] uppercase font-mono text-slate-400">Synchronisés Supabase</div>
                <div className="text-lg font-bold text-emerald-400 font-mono mt-0.5">
                  {reassignReport.reassignedCount}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowReportModal(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
