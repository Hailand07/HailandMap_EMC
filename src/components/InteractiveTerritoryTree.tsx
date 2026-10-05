/**
 * HailandMap — Composant UI : Tiroirs Mère-Enfant & Recherche Territoriale
 * 
 * Hiérarchie complète de Guinée :
 * 8 Régions -> Préfectures -> Communes -> Quartiers avec Décompte 3D
 * 
 * Caractéristiques :
 * - Chargement à la demande (Lazy loading) avec spinners discrets
 * - Dépliage automatique lors d'une recherche textuelle
 * - Badges dynamiques (ex: "Kipé • 12 bât. 3D")
 * - Traçabilité stricte par logs [InteractiveMap:UI]
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Search, 
  X, 
  ChevronDown, 
  ChevronRight, 
  Layers, 
  Building2, 
  MapPin, 
  Loader2, 
  Folder, 
  FolderOpen, 
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type {
  AdminLevel,
  InteractiveRegion,
  InteractivePrefecture,
  InteractiveCommune,
  InteractiveQuartier,
  TerritorySearchResult
} from '../types';
import {
  fetchInteractiveRegions,
  fetchInteractivePrefectures,
  fetchInteractiveCommunes,
  fetchInteractiveQuartiersWith3DCount,
  searchAdministrativeEntities
} from '../lib/interactiveMapService';

export interface SelectedTerritoryPayload {
  id: string;
  nom: string;
  level: AdminLevel;
  code?: string;
  geom?: GeoJSON.Geometry | null;
  centroid?: GeoJSON.Point | null;
  totalBatiments3D?: number;
  parentChain?: {
    region?: { id: string; nom: string };
    prefecture?: { id: string; nom: string };
    commune?: { id: string; nom: string };
  };
}

export interface InteractiveTerritoryTreeProps {
  selectedEntityId?: string | null;
  selectedTerritoryId?: string | null;
  selectedTerritoryIds?: string[];
  selectedTerritories?: SelectedTerritoryPayload[];
  onSelectEntity?: (entity: SelectedTerritoryPayload) => void;
  onSelectTerritory?: (entity: SelectedTerritoryPayload) => void;
  onToggleTerritory?: (entity: SelectedTerritoryPayload) => void;
  onToggleBatchTerritories?: (entities: SelectedTerritoryPayload[], forceState?: boolean) => void;
  onResetSelection?: () => void;
  className?: string;
}

export const InteractiveTerritoryTree: React.FC<InteractiveTerritoryTreeProps> = ({
  selectedEntityId,
  selectedTerritoryId,
  selectedTerritoryIds,
  selectedTerritories,
  onSelectEntity,
  onSelectTerritory,
  onToggleTerritory,
  onToggleBatchTerritories,
  onResetSelection,
  className = '',
}) => {
  // Ensemble des identifiants actifs
  const activeIdSet = useMemo(() => {
    const ids = new Set<string>();
    if (selectedEntityId) ids.add(selectedEntityId);
    if (selectedTerritoryId) ids.add(selectedTerritoryId);
    if (selectedTerritoryIds) {
      selectedTerritoryIds.forEach((id) => ids.add(id));
    }
    if (selectedTerritories) {
      selectedTerritories.forEach((t) => ids.add(t.id));
    }
    return ids;
  }, [selectedEntityId, selectedTerritoryId, selectedTerritoryIds, selectedTerritories]);

  const toggleCallback = onToggleTerritory || onSelectEntity || onSelectTerritory;

  // ===== ÉTATS PRINCIPAUX =====
  const [regions, setRegions] = useState<InteractiveRegion[]>([]);
  const [loadingRegions, setLoadingRegions] = useState(false);

  // Nœuds dépliés (Set d'identifiants de régions, préfectures, communes)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Données des enfants chargées à la demande
  const [prefecturesMap, setPrefecturesMap] = useState<Map<string, InteractivePrefecture[]>>(new Map());
  const [communesMap, setCommunesMap] = useState<Map<string, InteractiveCommune[]>>(new Map());
  const [quartiersMap, setQuartiersMap] = useState<Map<string, InteractiveQuartier[]>>(new Map());

  // Indicateurs de chargement par nœud
  const [loadingNodeIds, setLoadingNodeIds] = useState<Set<string>>(new Set());

  // Recherche
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TerritorySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // ===== CHARGEMENT INITIAL DES 8 RÉGIONS =====
  useEffect(() => {
    let isMounted = true;
    console.log('[InteractiveMap:UI] Montage du panneau tiroirs, chargement des régions...');
    setLoadingRegions(true);

    fetchInteractiveRegions()
      .then((data) => {
        if (isMounted) {
          setRegions(data);
          setLoadingRegions(false);
          console.log(`[InteractiveMap:UI] ✅ ${data.length} régions prêtes pour affichage.`);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setLoadingRegions(false);
          console.error('[InteractiveMap:UI:Error] Erreur chargement régions:', err);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // ===== GESTION DE LA RECHERCHE EN TEMPS RÉEL =====
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      console.log(`[InteractiveMap:UI] Recherche déclenchée : "${searchQuery}"`);
      const res = await searchAdministrativeEntities(searchQuery);
      setSearchResults(res);
      setIsSearching(false);
      console.log(`[InteractiveMap:UI] ${res.length} résultat(s) trouvé(s) pour "${searchQuery}"`);
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ===== GESTION DU TOGGLE DE SÉLECTION =====
  const handleSelect = useCallback((payload: SelectedTerritoryPayload) => {
    const isAlreadyActive = activeIdSet.has(payload.id);
    console.log(
      `[InteractiveMap:UI] 🎯 ${isAlreadyActive ? 'Désélection' : 'Sélection'} : [${payload.level.toUpperCase()}] "${payload.nom}" (ID: ${payload.id})`
    );
    if (toggleCallback) {
      toggleCallback(payload);
    }
  }, [toggleCallback, activeIdSet]);

  // ===== GESTION DU TOGGLE EN LOT DES QUARTIERS D'UNE COMMUNE =====
  const handleToggleAllQuartiersOfCommune = useCallback(
    (
      commune: InteractiveCommune,
      region: InteractiveRegion,
      pref: InteractivePrefecture,
      quartiersList: InteractiveQuartier[]
    ) => {
      if (!quartiersList || quartiersList.length === 0) return;

      const allActive = quartiersList.every((q) => activeIdSet.has(q.id));
      const targetState = !allActive; // Si tous actifs -> désactiver tout, sinon -> tout activer

      const payloads: SelectedTerritoryPayload[] = quartiersList.map((q) => ({
        id: q.id,
        nom: q.nom,
        level: 'quartier',
        code: q.code,
        geom: q.geom,
        centroid: q.centroid,
        totalBatiments3D: q.totalBatiments3D,
        parentChain: {
          region: { id: region.id, nom: region.nom },
          prefecture: { id: pref.id, nom: pref.nom },
          commune: { id: commune.id, nom: commune.nom },
        },
      }));

      if (onToggleBatchTerritories) {
        onToggleBatchTerritories(payloads, targetState);
      } else if (toggleCallback) {
        // Fallback séquentiel
        payloads.forEach((p) => {
          const isActive = activeIdSet.has(p.id);
          if (targetState !== isActive) {
            toggleCallback(p);
          }
        });
      }
    },
    [activeIdSet, onToggleBatchTerritories, toggleCallback]
  );

  // ===== GESTION DU DÉPLIAGE RÉGION =====
  const toggleRegion = useCallback(async (region: InteractiveRegion) => {
    const isExpanded = expandedNodes.has(region.id);
    const newExpanded = new Set(expandedNodes);

    if (isExpanded) {
      newExpanded.delete(region.id);
      setExpandedNodes(newExpanded);
      console.log(`[InteractiveMap:UI] 📁 Région fermée : "${region.nom}"`);
    } else {
      newExpanded.add(region.id);
      setExpandedNodes(newExpanded);
      console.log(`[InteractiveMap:UI] 📂 Région ouverte : "${region.nom}"`);

      // Chargement à la demande si pas encore en mémoire
      if (!prefecturesMap.has(region.id)) {
        setLoadingNodeIds((prev) => new Set(prev).add(region.id));
        const prefs = await fetchInteractivePrefectures(region.id);
        setPrefecturesMap((prev) => new Map(prev).set(region.id, prefs));
        setLoadingNodeIds((prev) => {
          const updated = new Set(prev);
          updated.delete(region.id);
          return updated;
        });
      }
    }
  }, [expandedNodes, prefecturesMap]);

  // ===== GESTION DU DÉPLIAGE PRÉFECTURE =====
  const togglePrefecture = useCallback(async (prefecture: InteractivePrefecture) => {
    const isExpanded = expandedNodes.has(prefecture.id);
    const newExpanded = new Set(expandedNodes);

    if (isExpanded) {
      newExpanded.delete(prefecture.id);
      setExpandedNodes(newExpanded);
      console.log(`[InteractiveMap:UI] 📁 Préfecture fermée : "${prefecture.nom}"`);
    } else {
      newExpanded.add(prefecture.id);
      setExpandedNodes(newExpanded);
      console.log(`[InteractiveMap:UI] 📂 Préfecture ouverte : "${prefecture.nom}"`);

      if (!communesMap.has(prefecture.id)) {
        setLoadingNodeIds((prev) => new Set(prev).add(prefecture.id));
        const comms = await fetchInteractiveCommunes(prefecture.id);
        setCommunesMap((prev) => new Map(prev).set(prefecture.id, comms));
        setLoadingNodeIds((prev) => {
          const updated = new Set(prev);
          updated.delete(prefecture.id);
          return updated;
        });
      }
    }
  }, [expandedNodes, communesMap]);

  // ===== GESTION DU DÉPLIAGE COMMUNE =====
  const toggleCommune = useCallback(async (commune: InteractiveCommune) => {
    const isExpanded = expandedNodes.has(commune.id);
    const newExpanded = new Set(expandedNodes);

    if (isExpanded) {
      newExpanded.delete(commune.id);
      setExpandedNodes(newExpanded);
      console.log(`[InteractiveMap:UI] 📁 Commune fermée : "${commune.nom}"`);
    } else {
      newExpanded.add(commune.id);
      setExpandedNodes(newExpanded);
      console.log(`[InteractiveMap:UI] 📂 Commune ouverte : "${commune.nom}"`);

      if (!quartiersMap.has(commune.id)) {
        setLoadingNodeIds((prev) => new Set(prev).add(commune.id));
        const qtrs = await fetchInteractiveQuartiersWith3DCount(commune.id);
        setQuartiersMap((prev) => new Map(prev).set(commune.id, qtrs));
        setLoadingNodeIds((prev) => {
          const updated = new Set(prev);
          updated.delete(commune.id);
          return updated;
        });
      }
    }
  }, [expandedNodes, quartiersMap]);

  // ===== SÉLECTION DEPUIS LES RÉSULTATS DE RECHERCHE =====
  const handleSearchResultClick = useCallback(async (result: TerritorySearchResult) => {
    console.log(`[InteractiveMap:UI] Clic résultat de recherche : [${result.level}] ${result.nom}`);
    setSearchQuery('');
    setSearchResults([]);

    // Déplier automatiquement la chaîne de parenté
    const newExpanded = new Set(expandedNodes);
    if (result.parentChain.region?.id) {
      newExpanded.add(result.parentChain.region.id);
      if (!prefecturesMap.has(result.parentChain.region.id)) {
        const prefs = await fetchInteractivePrefectures(result.parentChain.region.id);
        setPrefecturesMap((prev) => new Map(prev).set(result.parentChain.region!.id, prefs));
      }
    }
    if (result.parentChain.prefecture?.id) {
      newExpanded.add(result.parentChain.prefecture.id);
      if (!communesMap.has(result.parentChain.prefecture.id)) {
        const comms = await fetchInteractiveCommunes(result.parentChain.prefecture.id);
        setCommunesMap((prev) => new Map(prev).set(result.parentChain.prefecture!.id, comms));
      }
    }
    if (result.parentChain.commune?.id) {
      newExpanded.add(result.parentChain.commune.id);
      if (!quartiersMap.has(result.parentChain.commune.id)) {
        const qtrs = await fetchInteractiveQuartiersWith3DCount(result.parentChain.commune.id);
        setQuartiersMap((prev) => new Map(prev).set(result.parentChain.commune!.id, qtrs));
      }
    }
    setExpandedNodes(newExpanded);

    // Sélectionner l'entité
    handleSelect({
      id: result.id,
      nom: result.nom,
      level: result.level,
      code: result.code,
      geom: result.geom,
      centroid: result.centroid,
      totalBatiments3D: result.totalBatiments3D,
      parentChain: result.parentChain,
    });
  }, [expandedNodes, prefecturesMap, communesMap, quartiersMap, handleSelect]);

  // Tout replier
  const handleCollapseAll = () => {
    console.log('[InteractiveMap:UI] Repliement de tous les tiroirs.');
    setExpandedNodes(new Set());
    if (onResetSelection) onResetSelection();
  };

  return (
    <div id="interactive-territory-tree" className={`flex flex-col gap-3 font-sans ${className}`}>
      
      {/* 1. BARRE DE RECHERCHE TERRITORIALE */}
      <div className="relative">
        <div className="relative flex items-center">
          <Search className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            id="interactive-search-input"
            type="text"
            placeholder="Rechercher une région, commune, quartier..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-sans"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setSearchResults([]); }}
              className="absolute right-2.5 p-1 rounded-md text-slate-400 hover:text-white transition-colors"
              title="Effacer la recherche"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {isSearching && (
            <Loader2 className="absolute right-8 w-3.5 h-3.5 text-amber-400 animate-spin" />
          )}
        </div>

        {/* LISTE DES RÉSULTATS DE RECHERCHE FLOTTANTE */}
        <AnimatePresence>
          {searchResults.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute left-0 right-0 top-full mt-1.5 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-xl overflow-hidden shadow-2xl z-30 max-h-60 overflow-y-auto divide-y divide-slate-800/60"
            >
              <div className="p-2 text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold bg-slate-950/60 flex items-center justify-between">
                <span>{searchResults.length} correspondance(s)</span>
                <span className="text-amber-400 font-normal">Clic pour déplier</span>
              </div>
              {searchResults.map((res) => {
                const isSelected = activeIdSet.has(res.id);
                return (
                  <button
                    key={`search-res-${res.level}-${res.id}`}
                    onClick={() => handleSearchResultClick(res)}
                    className={`w-full text-left p-2.5 hover:bg-slate-800/80 transition-colors flex items-center justify-between group cursor-pointer ${
                      isSelected ? 'bg-amber-500/15 border-l-2 border-amber-500' : ''
                    }`}
                  >
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-100 group-hover:text-amber-300 transition-colors">
                          {res.nom}
                        </span>
                        {res.code && (
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400">
                            {res.code}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {res.parentChain.commune?.nom ? `${res.parentChain.commune.nom} • ` : ''}
                        {res.parentChain.region?.nom ? `Région ${res.parentChain.region.nom}` : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {res.level === 'quartier' && typeof res.totalBatiments3D === 'number' && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 font-bold">
                          {res.totalBatiments3D} 3D
                        </span>
                      )}
                      <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded font-bold ${
                        res.level === 'region' ? 'bg-sky-950 text-sky-300 border border-sky-800/60' :
                        res.level === 'prefecture' ? 'bg-indigo-950 text-indigo-300 border border-indigo-800/60' :
                        res.level === 'commune' ? 'bg-amber-950 text-amber-300 border border-amber-800/60' :
                        'bg-slate-800 text-slate-300'
                      }`}>
                        {res.level}
                      </span>
                    </div>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 2. EN-TÊTE DU PANNEAU : STATS & ACTIONS RAPIDES */}
      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-1 pt-1 border-b border-slate-800/60 pb-2">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 font-bold text-slate-300">
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            8 RÉGIONS
          </span>
          {activeIdSet.size > 0 && (
            <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold animate-pulse">
              {activeIdSet.size} actif{activeIdSet.size > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeIdSet.size > 0 && onResetSelection && (
            <button
              onClick={onResetSelection}
              className="flex items-center gap-1 text-[10px] text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
              title="Désactiver toutes les frontières affichées"
            >
              <X className="w-3 h-3" />
              <span>Effacer</span>
            </button>
          )}
          {expandedNodes.size > 0 && (
            <button
              onClick={handleCollapseAll}
              className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-amber-300 transition-colors cursor-pointer"
              title="Refermer tous les tiroirs"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Replier</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. ARBORESCENCE EN CASOLETTE / ACCORDÉONS */}
      {loadingRegions ? (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
          <span>Chargement de la hiérarchie territoriale...</span>
        </div>
      ) : (
        <div className="space-y-1.5 overflow-y-auto max-h-[460px] pr-1 no-scrollbar">
          {regions.map((region) => {
            const isRegExpanded = expandedNodes.has(region.id);
            const isRegSelected = activeIdSet.has(region.id);
            const isRegLoading = loadingNodeIds.has(region.id);
            const prefectures = prefecturesMap.get(region.id) || [];

            return (
              <div 
                key={`reg-${region.id}`} 
                className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                  isRegSelected 
                    ? 'border-sky-500/80 bg-sky-950/20 shadow-sm shadow-sky-500/10' 
                    : 'border-slate-800/90 bg-slate-950/40 hover:border-slate-700/80'
                }`}
              >
                {/* LIGNE NIVEAU 1 : RÉGION */}
                <div className="flex items-center justify-between p-2.5 gap-2">
                  <button
                    type="button"
                    onClick={() => toggleRegion(region)}
                    className="flex items-center gap-2 text-left flex-1 min-w-0 group cursor-pointer"
                    title={isRegExpanded ? 'Fermer la région' : 'Ouvrir les préfectures'}
                  >
                    <div className="w-4 h-4 flex items-center justify-center shrink-0 text-slate-400 group-hover:text-amber-400 transition-colors">
                      {isRegLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                      ) : isRegExpanded ? (
                        <ChevronDown className="w-4 h-4 text-amber-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 min-w-0">
                      {isRegExpanded ? (
                        <FolderOpen className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      ) : (
                        <Folder className="w-3.5 h-3.5 text-slate-400 group-hover:text-sky-400 shrink-0 transition-colors" />
                      )}
                      <span className="text-xs font-bold text-slate-100 font-display truncate group-hover:text-white">
                        {region.nom}
                      </span>
                      <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800/80 text-slate-400 shrink-0">
                        {region.code}
                      </span>
                    </div>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] font-mono text-slate-400">
                      {region.totalCommunes || 0} com.
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSelect({
                        id: region.id,
                        nom: region.nom,
                        level: 'region',
                        code: region.code,
                        geom: region.geom,
                        centroid: region.centroid,
                        parentChain: {},
                      })}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer ${
                        isRegSelected
                          ? 'bg-sky-500 text-slate-950 shadow shadow-sky-500/30 ring-1 ring-sky-300'
                          : 'bg-slate-850 hover:bg-sky-950 hover:text-sky-300 text-slate-400 border border-slate-700/60'
                      }`}
                      title={isRegSelected ? 'Masquer la frontière de cette région' : `Afficher la région ${region.nom} sur la carte`}
                    >
                      {isRegSelected ? 'ACTIF' : 'VOIR'}
                    </button>
                  </div>
                </div>

                {/* TIROIR NIVEAU 2 : PRÉFECTURES */}
                <AnimatePresence>
                  {isRegExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-slate-800/60 bg-slate-900/30 pl-3 pr-2 py-1.5 space-y-1"
                    >
                      {prefectures.length === 0 && !isRegLoading ? (
                        <div className="p-2 text-[10px] text-slate-400 italic">
                          Aucune préfecture rattachée
                        </div>
                      ) : (
                        prefectures.map((pref) => {
                          const isPrefExpanded = expandedNodes.has(pref.id);
                          const isPrefSelected = activeIdSet.has(pref.id);
                          const isPrefLoading = loadingNodeIds.has(pref.id);
                          const communes = communesMap.get(pref.id) || [];

                          return (
                            <div 
                              key={`pref-${pref.id}`} 
                              className={`rounded-lg border transition-all ${
                                isPrefSelected 
                                  ? 'border-indigo-500/80 bg-indigo-950/20' 
                                  : 'border-slate-800/60 bg-slate-950/30 hover:border-slate-700/60'
                              }`}
                            >
                              {/* LIGNE PRÉFECTURE */}
                              <div className="flex items-center justify-between p-2 gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => togglePrefecture(pref)}
                                  className="flex items-center gap-1.5 text-left flex-1 min-w-0 group cursor-pointer"
                                  title={isPrefExpanded ? 'Fermer la préfecture' : 'Ouvrir les communes'}
                                >
                                  <div className="w-3.5 h-3.5 flex items-center justify-center shrink-0 text-slate-400 group-hover:text-indigo-400 transition-colors">
                                    {isPrefLoading ? (
                                      <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                                    ) : isPrefExpanded ? (
                                      <ChevronDown className="w-3.5 h-3.5 text-indigo-400" />
                                    ) : (
                                      <ChevronRight className="w-3.5 h-3.5" />
                                    )}
                                  </div>
                                  <span className="text-[11px] font-semibold text-slate-200 truncate group-hover:text-white">
                                    {pref.nom}
                                  </span>
                                </button>

                                <div className="flex items-center gap-1 shrink-0">
                                  <span className="text-[9px] font-mono text-slate-400">
                                    {pref.totalCommunes || communes.length} com.
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleSelect({
                                      id: pref.id,
                                      nom: pref.nom,
                                      level: 'prefecture',
                                      code: pref.code,
                                      geom: pref.geom,
                                      centroid: pref.centroid,
                                      parentChain: {
                                        region: { id: region.id, nom: region.nom },
                                      },
                                    })}
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-all cursor-pointer ${
                                      isPrefSelected
                                        ? 'bg-indigo-500 text-slate-950 shadow shadow-indigo-500/30 ring-1 ring-indigo-300'
                                        : 'bg-slate-800/80 hover:bg-indigo-950 hover:text-indigo-300 text-slate-400 border border-slate-700/50'
                                    }`}
                                    title={isPrefSelected ? 'Masquer la frontière de cette préfecture' : `Afficher la préfecture ${pref.nom} sur la carte`}
                                  >
                                    {isPrefSelected ? 'ACTIF' : 'VOIR'}
                                  </button>
                                </div>
                              </div>

                              {/* TIROIR NIVEAU 3 : COMMUNES */}
                              <AnimatePresence>
                                {isPrefExpanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="border-t border-slate-800/40 bg-slate-900/40 pl-3 pr-2 py-1 space-y-1"
                                  >
                                    {communes.length === 0 && !isPrefLoading ? (
                                      <div className="p-1 text-[10px] text-slate-400 italic">
                                        Aucune commune répertoriée
                                      </div>
                                    ) : (
                                      communes.map((commune) => {
                                        const isComExpanded = expandedNodes.has(commune.id);
                                        const isComSelected = activeIdSet.has(commune.id);
                                        const isComLoading = loadingNodeIds.has(commune.id);
                                        const quartiers = quartiersMap.get(commune.id) || [];
                                        const activeQuartiersCount = quartiers.filter((q) => activeIdSet.has(q.id)).length;
                                        const allQuartiersActive = quartiers.length > 0 && activeQuartiersCount === quartiers.length;

                                        return (
                                          <div
                                            key={`commune-${commune.id}`}
                                            className={`rounded-md border transition-all ${
                                              isComSelected
                                                ? 'border-amber-500/80 bg-amber-950/20'
                                                : 'border-slate-800/50 bg-slate-950/40 hover:border-slate-700/50'
                                            }`}
                                          >
                                            {/* LIGNE COMMUNE */}
                                            <div className="flex items-center justify-between p-1.5 gap-1.5">
                                              <button
                                                type="button"
                                                onClick={() => toggleCommune(commune)}
                                                className="flex items-center gap-1.5 text-left flex-1 min-w-0 group cursor-pointer"
                                                title={isComExpanded ? 'Fermer la commune' : 'Ouvrir les quartiers'}
                                              >
                                                <div className="w-3 h-3 flex items-center justify-center shrink-0 text-slate-400 group-hover:text-amber-400 transition-colors">
                                                  {isComLoading ? (
                                                    <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                                                  ) : isComExpanded ? (
                                                    <ChevronDown className="w-3 h-3 text-amber-400" />
                                                  ) : (
                                                    <ChevronRight className="w-3 h-3" />
                                                  )}
                                                </div>
                                                <span className="text-[11px] font-medium text-slate-200 truncate group-hover:text-amber-300">
                                                  {commune.nom}
                                                </span>
                                              </button>

                                              <div className="flex items-center gap-1 shrink-0">
                                                {commune.totalQuartiers > 0 && (
                                                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400">
                                                    {commune.totalQuartiers} qtr
                                                  </span>
                                                )}
                                                <button
                                                  type="button"
                                                  onClick={() => handleSelect({
                                                    id: commune.id,
                                                    nom: commune.nom,
                                                    level: 'commune',
                                                    code: commune.code,
                                                    geom: commune.geom,
                                                    centroid: commune.centroid,
                                                    parentChain: {
                                                      region: { id: region.id, nom: region.nom },
                                                      prefecture: { id: pref.id, nom: pref.nom },
                                                    },
                                                  })}
                                                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-all cursor-pointer ${
                                                    isComSelected
                                                      ? 'bg-amber-500 text-slate-950 shadow shadow-amber-500/30 ring-1 ring-amber-300'
                                                      : 'bg-slate-800/80 hover:bg-amber-950 hover:text-amber-300 text-slate-400 border border-slate-700/50'
                                                  }`}
                                                  title={isComSelected ? 'Masquer la commune' : `Afficher la commune ${commune.nom} sur la carte`}
                                                >
                                                  {isComSelected ? 'ACTIF' : 'VOIR'}
                                                </button>
                                              </div>
                                            </div>

                                            {/* TIROIR NIVEAU 4 (DERNIER MAILLON) : QUARTIERS AVEC BÂTIMENTS 3D */}
                                            <AnimatePresence>
                                              {isComExpanded && (
                                                <motion.div
                                                  initial={{ height: 0, opacity: 0 }}
                                                  animate={{ height: 'auto', opacity: 1 }}
                                                  exit={{ height: 0, opacity: 0 }}
                                                  className="border-t border-slate-800/40 bg-slate-950/60 pl-3 pr-2 py-1 space-y-1 divide-y divide-slate-800/30"
                                                >
                                                  {quartiers.length === 0 && !isComLoading ? (
                                                    <div className="p-1.5 text-[10px] text-slate-500 italic flex items-center gap-1.5">
                                                      <Building2 className="w-3 h-3 text-slate-500" />
                                                      <span>Données quartiers en cours de consolidation</span>
                                                    </div>
                                                  ) : (
                                                    <>
                                                      {/* BARRE D'ACTION RAPIDE POUR TOUS LES QUARTIERS DE LA COMMUNE */}
                                                      {quartiers.length > 0 && (
                                                        <div className="pt-0.5 pb-1 flex items-center justify-between text-[9px] font-mono text-slate-400">
                                                          <span className="text-slate-400">
                                                            {quartiers.length} quartiers {activeQuartiersCount > 0 ? `(${activeQuartiersCount} actifs)` : ''}
                                                          </span>
                                                          <button
                                                            type="button"
                                                            onClick={() => handleToggleAllQuartiersOfCommune(commune, region, pref, quartiers)}
                                                            className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold transition-all cursor-pointer ${
                                                              allQuartiersActive
                                                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                                                                : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
                                                            }`}
                                                            title={allQuartiersActive ? 'Masquer tous les quartiers' : 'Afficher toutes les frontières des quartiers de cette commune simultanément'}
                                                          >
                                                            {allQuartiersActive ? 'Tout masquer' : `Tout afficher (${quartiers.length})`}
                                                          </button>
                                                        </div>
                                                      )}

                                                      {quartiers.map((quartier) => {
                                                        const isQtrSelected = activeIdSet.has(quartier.id);
                                                        return (
                                                          <div
                                                            key={`qtr-${quartier.id}`}
                                                            className={`flex items-center justify-between py-1 px-1 rounded transition-colors ${
                                                              isQtrSelected ? 'bg-emerald-950/40 text-emerald-300 ring-1 ring-emerald-500/30' : 'hover:bg-slate-850/60'
                                                            }`}
                                                          >
                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                              <MapPin className={`w-3 h-3 shrink-0 ${isQtrSelected ? 'text-emerald-400' : 'text-slate-400'}`} />
                                                              <span className="text-[10px] font-medium text-slate-200 truncate">
                                                                {quartier.nom}
                                                              </span>
                                                            </div>

                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                              {/* BADGE DERNIER MAILLON : NOMBRE DE BÂTIMENTS 3D */}
                                                              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold ${
                                                                quartier.totalBatiments3D > 0 
                                                                  ? 'bg-emerald-950 border border-emerald-500/30 text-emerald-300 shadow-sm' 
                                                                  : 'bg-slate-850 border border-slate-700/40 text-slate-400'
                                                              }`}>
                                                                {quartier.totalBatiments3D} 3D
                                                              </span>

                                                              <button
                                                                type="button"
                                                                onClick={() => handleSelect({
                                                                  id: quartier.id,
                                                                  nom: quartier.nom,
                                                                  level: 'quartier',
                                                                  code: quartier.code,
                                                                  geom: quartier.geom,
                                                                  centroid: quartier.centroid,
                                                                  totalBatiments3D: quartier.totalBatiments3D,
                                                                  parentChain: {
                                                                    region: { id: region.id, nom: region.nom },
                                                                    prefecture: { id: pref.id, nom: pref.nom },
                                                                    commune: { id: commune.id, nom: commune.nom },
                                                                  },
                                                                })}
                                                                className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold transition-all cursor-pointer ${
                                                                  isQtrSelected
                                                                    ? 'bg-emerald-500 text-slate-950 shadow shadow-emerald-500/30 ring-1 ring-emerald-300'
                                                                    : 'bg-slate-800 hover:bg-emerald-950 hover:text-emerald-300 text-slate-400 border border-slate-700/50'
                                                                }`}
                                                                title={isQtrSelected ? 'Masquer la frontière de ce quartier' : `Afficher le quartier ${quartier.nom} sur la carte`}
                                                              >
                                                                {isQtrSelected ? 'ACTIF' : 'VOIR'}
                                                              </button>
                                                            </div>
                                                          </div>
                                                        );
                                                      })}
                                                    </>
                                                  )}
                                                </motion.div>
                                              )}
                                            </AnimatePresence>
                                          </div>
                                        );
                                      })
                                    )}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. PIED DU COMPOSANT : LÉGENDE DU DERNIER MAILLON */}
      <div className="p-2 rounded-xl bg-slate-950/40 border border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
        <span className="flex items-center gap-1 text-slate-400">
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>Dernier maillon : Bâtiments 3D par quartier</span>
        </span>
        <span className="font-mono text-emerald-400 font-semibold">PostGIS 3D</span>
      </div>
    </div>
  );
};

export default InteractiveTerritoryTree;
