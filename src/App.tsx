/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import { 
  Info,
  EyeOff,
  } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { actorId } from './lib/actor';
import GridPanel from './components/GridPanel';
import InteractiveBuildingForm from './components/InteractiveBuildingForm';
import { Building3DDetailModal } from './components/Building3DDetailModal';
import type { View, Building, Zone, BuildingType, Custom3DBuilding, HiddenBuildingData, EntrancePickerConfig } from './types';
import {
  loadRealBuildings,
  insertBuildingInSupabase,
  saveZoneInSupabase,
  } from './lib/supabase';
import { computeDualAddressing } from './lib/administrativeAddressingService';
import { sanitizeGeometry, safeJsonStringify, safeCalculateArea } from './utils/safeJson';
import * as turf from '@turf/turf';
import { AtelierTopBar, ModuleRail, AtelierStatusBar, AtelierToolbar, AssistantAside, TOOLS, type AtelierTool } from './shell/AtelierShell';
import { AtelierLeftPanel } from './v2/atelier/LeftPanel';
import { CandidateCard, BuildingCard } from './v2/atelier/FloatingCards';
import { MapStyleControl, SatelliteOptions, ZoomCluster, PanelHandle } from './shell/MapControls';
import { CommandPalette } from './v2/atelier/CommandPalette';
import { ActivityPanel, type ActivityEntry } from './v2/atelier/Activity';
import { RevueView } from './v2/views/RevueView';
import { RegistreView } from './v2/views/RegistreView';
import { PilotageView } from './v2/views/PilotageView';
import { TerritoireView } from './v2/views/TerritoireView';
import InteractiveTerritoryTree, { type SelectedTerritoryPayload } from './components/InteractiveTerritoryTree';
import {
  setupInteractiveTerritoryLayers,
  applyTerritoriesHighlight,
  zoomToTerritory,
  zoomToTerritories,
  setLOD3DForLevel,
  clearTerritoryHighlight,
  
} from './lib/interactiveMapEngine';
import { calculateDistance, calculatePolygonArea, generateSquarePolygon } from './map/geometry';
import { generate200mGridGeoJSON, detect200mZoneFromCoords } from './map/grid';
import { BUILDING_TYPE_3D_COLORS, createCourtyardWall3DEntities, generate3DEntitiesFromBuildingList } from './map/buildings3d';
import { DEFAULT_MAPBOX_TOKEN, CUSTOM_STYLE_URL,  } from './map/constants';
import { setRegisteredMask, applyHiddenBuildingsFilter, enforceBuildingsAboveCourtyardsOrder, syncCourtyardsLayer, syncEntryPointsLayer, syncCustom3DBuildingsLayer, syncFixedGpsCentroidsLayer } from './map/layers';
import type { LayerEnv } from './map/layers';
import { useRegistry } from './hooks/useRegistry';
import { registeredMaskZone } from './map/registered';
import { declarationPoint, linkDeclaration, loadAdminCodes, saveUnits, type Declaration } from './lib/attachment';
import { BuildingSheet } from './v2/atelier/BuildingSheet';
import { RegistrationBanner } from './v2/atelier/RegistrationBanner';
import { findRegisteredAt } from './map/registered';
import { SettingsModal } from './shell/SettingsModal';
import { handleMapLoad, handleMapClick, handleMapMouseMove } from './map/handlers';

/**
 * Récupère dynamiquement tous les calques polygonaux de la carte actifs
 * pour s'assurer que chaque polygone (bâtiment, parcelle, etc.) soit cliquable / sélectionnable.
 */
/**
 * Simplification de polygone via l'algorithme classique de Douglas-Peucker
 * Réduit le bruit de crénelage de pixels pour donner un rendu géométrique propre (droites de toitures).
 */
export default function App() {
  // Notifications algorithmiques de détourage ou de superposition
  const [mapNotification, setMapNotification] = useState<{
    type: 'success' | 'info' | 'warning';
    title: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (mapNotification) {
      const timer = setTimeout(() => {
        setMapNotification(null);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [mapNotification]);

  const { buildings, setBuildings, zones, setZones, validations, profiles, loadError, loading, syncData, handleApproveBuilding, handleRejectBuilding, handleRequestVisit, declarations, occupancy, attachmentError, syncAttachments, handleLinkDeclaration, handleRefuseRequest } = useRegistry(setMapNotification);
  const [assistantStarted, setAssistantStarted] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [activitySeen, setActivitySeen] = useState(0);
  const [cursorPos, setCursorPos] = useState<{ lng: number; lat: number } | null>(null);
  const [activeAdminView, setActiveAdminView] = useState<View>('carte');
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [selectedGridCell, setSelectedGridCell] = useState<any | null>(null);
  const [selectedGridBuildings, setSelectedGridBuildings] = useState<Building[]>([]);
  const [isGridPanelOpen, setIsGridPanelOpen] = useState(false);
  
  // Journalisation automatique du bâtiment sélectionné
  useEffect(() => {
    if (selectedBuilding) {
      console.log("Bâtiment sélectionné :", selectedBuilding.id, selectedBuilding.hailand_code || selectedBuilding.landmark_note);
    }
  }, [selectedBuilding]);

  // Ouvre l'Atelier centré sur un point (déclaration d'un résident) : vue satellite proche, sans sélection.
  const handleOpenPointOnMap = (lng: number, lat: number) => {
    setSelectedBuilding(null);
    setActiveAdminView('carte');
    setTimeout(() => {
      try {
        mapRef.current?.flyTo({ center: [lng, lat], zoom: 19, pitch: 0, bearing: 0, duration: 1250, essential: true });
        markerRef.current?.remove();
        markerRef.current = new mapboxgl.Marker({ color: '#f5b83d' }).setLngLat([lng, lat]).addTo(mapRef.current!);
      } catch (e) {
        console.warn('Centrage impossible :', e);
      }
    }, 350);
  };

  const handleSelectBuildingFromAdmin = (b: Building) => {
    setSelectedBuilding(b);
    setActiveAdminView('carte');
    setIsSidebarOpen(true);
    
    // Fly to the building's centroid on map using standard longitude/latitude
    if (mapRef.current && b.centroid?.coordinates) {
      const [lon, lat] = b.centroid.coordinates;
      setTimeout(() => {
        try {
          mapRef.current!.flyTo({
            center: [lon, lat],
            zoom: 18.5,
            pitch: 0, // locked 2D satellite view as requested
            bearing: 0,
            duration: 1250,
            essential: true
          });
        } catch (e) {
          console.warn("Could not fly to building centroid:", e);
        }
      }, 350);
    }
  };

  

  
    
  
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const isSelectionModeRef = useRef<boolean>(true);
  const isDrawModeRef = useRef<boolean>(false);
  const drawPointsRef = useRef<[number, number][]>([]);
  const currentCenterRef = useRef<[number, number] | null>(null);
  const currentZoomRef = useRef<number | null>(null);
  const currentPitchRef = useRef<number | null>(null);
  const currentBearingRef = useRef<number | null>(null);
  const clickedCoordsRef = useRef<any>(null);
  const selectionTargetNatureRef = useRef<'single' | 'courtyard'>('single');
  const detectedOsmFeaturesRef = useRef<any[]>([]);
  const buildingsRef = useRef<Building[]>([]);

  useEffect(() => {
    buildingsRef.current = buildings;
  }, [buildings]);

  // Refs de suivi de livraison professionnel et cinématographie réelle
    const entranceMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const entrancePickerConfigRef = useRef<EntrancePickerConfig | null>(null);
  const previewEntranceMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const snappedCoordsRef = useRef<{ lng: number; lat: number } | null>(null);
  const wallLineCacheRef = useRef<any>(null);

  // États pour le dessin personnalisé de zone libre
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]);
  const childMapClickHandlerRef = useRef<((lng: number, lat: number, geom?: any, area?: number) => void) | null>(null);
  const childDrawCompleteHandlerRef = useRef<((points?: [number, number][]) => void) | null>(null);

  // ===== ÉTATS POUR LE MODE ÉDITION 3D — TRACÉ MANUEL, MASQUAGE OSM & COULEURS =====
  const [custom3DBuildings, setCustom3DBuildings] = useState<Custom3DBuilding[]>(() => {
    try {
      // Les anciens tracés 3D manuels gardés dans le navigateur ne sont plus lus (fonction retirée) ; on les efface.
      localStorage.removeItem('hailandmap_custom_3d_buildings');
    } catch (e) {}
    return [];
  });

  // Volumes 3D combinés : Bâtiments Supabase calculés automatiquement + tracés 3D manuels locaux
  const all3DBuildings = useMemo(() => {
    const db3DEntities = generate3DEntitiesFromBuildingList(buildings);
    return db3DEntities;
  }, [buildings]);

  const custom3DBuildingsRef = useRef<Custom3DBuilding[]>([]);
  const lastMouseCoordRef = useRef<{ lng: number; lat: number; point: mapboxgl.Point } | null>(null);
  const drawRafRef = useRef<number | null>(null);
  const renderDrawRubberbandPreviewRef = useRef<((lng?: number, lat?: number, point?: mapboxgl.Point) => void) | null>(null);
  const handleFinalizeCustomDrawRef = useRef<(() => void) | null>(null);
  const [selected3DBuilding, setSelected3DBuilding] = useState<Custom3DBuilding | null>(null);
  const [currentPitch, setCurrentPitch] = useState<number>(45);

  const [highlighted3DBuildingId, setHighlighted3DBuildingId] = useState<string | null>(null);

  // Masquage dynamique de polygones / bâtiments
  const [hiddenBuildingsList, setHiddenBuildingsList] = useState<HiddenBuildingData[]>(() => {
    try {
      const saved = localStorage.getItem('hailandmap_hidden_buildings_list');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });
  const hiddenBuildingsListRef = useRef<HiddenBuildingData[]>([]);

  // Action contextuelle discrète "Masquer" à côté du curseur
  const [selectedPolygonHideAction, setSelectedPolygonHideAction] = useState<{
    buildingId: string | number;
    hideData?: HiddenBuildingData;
    lngLat: [number, number];
    isCustom: boolean;
    screenPos: { x: number; y: number };
  } | null>(null);
  const selectedPolygonHideActionRef = useRef<typeof selectedPolygonHideAction>(null);

  useEffect(() => {
    selectedPolygonHideActionRef.current = selectedPolygonHideAction;
  }, [selectedPolygonHideAction]);

  // La sélection suit le registre relu (code public, révision…) ; la fiche se ferme quand plus rien n'est sélectionné.
  useEffect(() => {
    if (!selectedBuilding) {
      setSheetOpen(false);
      return;
    }
    const fresh = buildings.find((b) => b.id === selectedBuilding.id);
    if (fresh && fresh !== selectedBuilding) setSelectedBuilding(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildings, selectedBuilding?.id]);

  // Bâtiments OSM masqués automatiquement sous tout bâtiment ou concession enregistré (zone recalculée à chaque changement du registre).
  useEffect(() => {
    setRegisteredMask(registeredMaskZone(buildings));
    if (mapRef.current) applyHiddenBuildingsFilter(mapRef.current, hiddenBuildingsListRef.current);
  }, [buildings]);

  useEffect(() => {
    hiddenBuildingsListRef.current = hiddenBuildingsList;
    try {
      localStorage.setItem('hailandmap_hidden_buildings_list', safeJsonStringify(hiddenBuildingsList, 0));
    } catch (e) {}
    if (mapRef.current) {
      applyHiddenBuildingsFilter(mapRef.current, hiddenBuildingsList);
    }
  }, [hiddenBuildingsList]);

  useEffect(() => {
    custom3DBuildingsRef.current = all3DBuildings;
  }, [all3DBuildings]);

  const selectedBuildingRef = useRef<Building | null>(null);
  const highlighted3DBuildingIdRef = useRef<string | null>(null);
  const refreshViewportDataRef = useRef<((mapInstance: mapboxgl.Map) => void) | null>(null);

  useEffect(() => {
    selectedBuildingRef.current = selectedBuilding;
  }, [selectedBuilding]);

  useEffect(() => {
    highlighted3DBuildingIdRef.current = highlighted3DBuildingId;
  }, [highlighted3DBuildingId]);

  useEffect(() => {
    isDrawModeRef.current = isDrawMode;
  }, [isDrawMode]);

  // ===== ÉTATS & HANDLERS DU MODE CARTE INTERACTIVE (ÉTAPES 1-4 MULTI-SÉLECTION) =====
  const [isInteractiveMapActive, setIsInteractiveMapActive] = useState<boolean>(false);
  const isInteractiveMapActiveRef = useRef<boolean>(false);
  const [selectedTerritories, setSelectedTerritories] = useState<SelectedTerritoryPayload[]>([]);
  const selectedTerritoriesRef = useRef<SelectedTerritoryPayload[]>([]);
  const selectedTerritory = selectedTerritories[selectedTerritories.length - 1] || null;
  const selectedTerritoryRef = useRef<SelectedTerritoryPayload | null>(null);

  useEffect(() => {
    isInteractiveMapActiveRef.current = isInteractiveMapActive;
  }, [isInteractiveMapActive]);

  useEffect(() => {
    selectedTerritoriesRef.current = selectedTerritories;
    selectedTerritoryRef.current = selectedTerritories[selectedTerritories.length - 1] || null;
  }, [selectedTerritories]);

  const handleToggleInteractiveMap = useCallback(() => {
    setIsInteractiveMapActive((prev) => {
      const nextState = !prev;
      console.log(`[InteractiveMap:App] Mode Carte Interactive ${nextState ? 'activé' : 'désactivé'}`);

      if (!nextState) {
        setSelectedTerritories([]);
        if (mapRef.current) {
          clearTerritoryHighlight(mapRef.current);
        }
      } else {
        if (mapRef.current) {
          setupInteractiveTerritoryLayers(mapRef.current);
          if (selectedTerritoriesRef.current.length > 0) {
            applyTerritoriesHighlight(mapRef.current, selectedTerritoriesRef.current);
          }
        }
      }
      return nextState;
    });
  }, []);

  const handleToggleTerritory = useCallback((payload: SelectedTerritoryPayload) => {
    setSelectedTerritories((prev) => {
      const exists = prev.some((t) => t.id === payload.id);
      let updated: SelectedTerritoryPayload[];
      if (exists) {
        updated = prev.filter((t) => t.id !== payload.id);
        console.log(`[InteractiveMap:App] Territoire retiré : level=${payload.level}, nom="${payload.nom}"`);
      } else {
        updated = [...prev, payload];
        console.log(`[InteractiveMap:App] Territoire ajouté : level=${payload.level}, nom="${payload.nom}" (total: ${updated.length})`);
      }


      if (mapRef.current) {
        if (updated.length === 0) {
          clearTerritoryHighlight(mapRef.current);
        } else {
          applyTerritoriesHighlight(mapRef.current, updated);
          if (!exists) {
            // Animation logique, simpliste et efficace : zoom dédié vers l'entité cliquée "VOIR"
            zoomToTerritory(mapRef.current, payload);
            setLOD3DForLevel(mapRef.current, payload.level);
          }
        }
      }

      return updated;
    });
  }, []);

  const handleToggleBatchTerritories = useCallback((payloads: SelectedTerritoryPayload[], action: 'select' | 'deselect') => {
    setSelectedTerritories((prev) => {
      let updated: SelectedTerritoryPayload[];
      const targetIds = new Set(payloads.map((p) => p.id));
      if (action === 'deselect') {
        updated = prev.filter((t) => !targetIds.has(t.id));
      } else {
        const existingIds = new Set(prev.map((t) => t.id));
        const newPayloads = payloads.filter((p) => !existingIds.has(p.id));
        updated = [...prev, ...newPayloads];
      }

      console.log(`[InteractiveMap:App] Action groupée ${action} (${payloads.length} éléments) -> Total actifs: ${updated.length}`);

      if (mapRef.current) {
        if (updated.length === 0) {
          clearTerritoryHighlight(mapRef.current);
        } else {
          applyTerritoriesHighlight(mapRef.current, updated);
          if (action === 'select') {
            // Cadrage fluide du groupe activé
            zoomToTerritories(mapRef.current, payloads);
            if (payloads.length > 0) {
              setLOD3DForLevel(mapRef.current, payloads[0].level);
            }
          }
        }
      }

      return updated;
    });
  }, []);

  const handleClearTerritorySelection = useCallback(() => {
    setSelectedTerritories([]);
    console.log('[InteractiveMap:App] Réinitialisation de toutes les sélections territoriales.');
    if (mapRef.current) {
      clearTerritoryHighlight(mapRef.current);
    }
  }, []);

  
  useEffect(() => {
    const handleMapMathError = (event: ErrorEvent) => {
      const msg = [
        event.message,
        event.error?.message,
        event.error?.stack,
        event.error?.toString()
      ].filter(Boolean).join(' | ').toLowerCase();

      if (
        msg.includes('invert matrix') || 
        msg.includes('failed to invert matrix') || 
        msg.includes('lnglat') || 
        msg.includes('matrix') || 
        msg.includes('unproject') || 
        msg.includes('project') ||
        msg.includes('listimages') ||
        msg.includes('imagemanager')
      ) {
        try {
          event.preventDefault();
          event.stopImmediatePropagation();
        } catch (e) {}
        console.warn("Caught and suppressed external Mapbox math/style projection exception:", msg);
      }
    };

    const handleMapMathRejection = (event: PromiseRejectionEvent) => {
      const msg = [
        event.reason?.message,
        event.reason?.stack,
        event.reason?.toString()
      ].filter(Boolean).join(' | ').toLowerCase();

      if (
        msg.includes('invert matrix') || 
        msg.includes('failed to invert matrix') || 
        msg.includes('lnglat') || 
        msg.includes('matrix') || 
        msg.includes('unproject') || 
        msg.includes('project') ||
        msg.includes('listimages') ||
        msg.includes('imagemanager')
      ) {
        try {
          event.preventDefault();
          event.stopPropagation();
        } catch (e) {}
        console.warn("Caught and suppressed external Mapbox math/style promise rejection:", msg);
      }
    };

    const originalOnError = window.onerror;
    window.onerror = function (message, source, lineno, colno, error) {
      const msg = String(message || (error && error.message) || '').toLowerCase();
      if (
        msg.includes('invert matrix') || 
        msg.includes('failed to invert matrix') || 
        msg.includes('lnglat') || 
        msg.includes('matrix') || 
        msg.includes('unproject') ||
        msg.includes('project') ||
        msg.includes('listimages') ||
        msg.includes('imagemanager')
      ) {
        console.warn("Caught and suppressed via window.onerror Mapbox math/style exception:", msg);
        return true; 
      }
      if (originalOnError) {
        return originalOnError.apply(window, arguments as any);
      }
      return false;
    };

    window.addEventListener('error', handleMapMathError, true);
    window.addEventListener('unhandledrejection', handleMapMathRejection, true);
    return () => {
      window.removeEventListener('error', handleMapMathError, true);
      window.removeEventListener('unhandledrejection', handleMapMathRejection, true);
      window.onerror = originalOnError;
    };
  }, []);

  useEffect(() => {
    drawPointsRef.current = drawPoints;
  }, [drawPoints]);

  // Désactiver le zoom double-clic de Mapbox pendant le dessin pour permettre la fermeture rapide par double-clic
  useEffect(() => {
    if (!mapRef.current) return;
    if (isDrawMode) {
      mapRef.current.doubleClickZoom.disable();
    } else {
      mapRef.current.doubleClickZoom.enable();
    }
  }, [isDrawMode]);

  // États de configuration Mapbox
  const [accessToken, setAccessToken] = useState(() => {
    return localStorage.getItem('hailandmap_token') || DEFAULT_MAPBOX_TOKEN;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    
  // Styles de carte disponibles
  const styles = [
    { id: 'custom', name: 'Original Perso (3D)', url: CUSTOM_STYLE_URL },
    { id: 'satellite', name: 'Image Satellite', url: 'mapbox://styles/mapbox/satellite-streets-v12' },
    { id: 'standard-3d', name: 'Standard 3D Mapbox', url: 'mapbox://styles/mapbox/streets-v12' }
  ];
  const [currentStyle, setCurrentStyle] = useState('custom');
  const hasAttemptedStyleFallbackRef = useRef(false);
  
  // États de l'application
  const [zoomLevel, setZoomLevel] = useState(13.5);
  // Atelier v2 : panneau gauche (repliable, onglet piloté par le bouton Couches de la carte) et centre de la carte (pastille de progression)
  const [leftOpen, setLeftOpen] = useState(true);
  const [leftTab, setLeftTab] = useState<'territoire' | 'couches'>('territoire');
  const [isHdEnhanceForce, setIsHdEnhanceForce] = useState(true);
  const isHdEnhanceForceRef = useRef(true);

  useEffect(() => {
    isHdEnhanceForceRef.current = isHdEnhanceForce;
  }, [isHdEnhanceForce]);

  const [is200mGridActive, setIs200mGridActive] = useState(true);
  const is200mGridActiveRef = useRef(true);

  useEffect(() => {
    is200mGridActiveRef.current = is200mGridActive;
  }, [is200mGridActive]);

  // Mode de ciblage pour le clic (Bâtiment unique vs Carreau de grille 200m)
  const [clickSelectionTarget, setClickSelectionTarget] = useState<'building' | 'grid_cell'>('grid_cell');
  const clickSelectionTargetRef = useRef<'building' | 'grid_cell'>('grid_cell');

  useEffect(() => {
    clickSelectionTargetRef.current = clickSelectionTarget;
  }, [clickSelectionTarget]);

    
  // Position utilisateur (Réelle)
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isLocating] = useState(false);
  const [isRecentering, setIsRecentering] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Mode Sélection de Zone
  const [isSelectionMode, setIsSelectionMode] = useState(true);
  // Nature de la sélection (Bâtiment Unique vs Cour / Concession)
  const [selectionTargetNature, setSelectionTargetNature] = useState<'single' | 'courtyard'>('single');

  // Synchronisation de la ref pour éviter le "stale pattern" dans les callbacks tiers
  useEffect(() => {
    isSelectionModeRef.current = isSelectionMode;
  }, [isSelectionMode]);

  useEffect(() => {
    selectionTargetNatureRef.current = selectionTargetNature;
  }, [selectionTargetNature]);

  // Clic temporaire de maison / zone
  const [clickedCoords, setClickedCoords] = useState<{ latitude: number; longitude: number; buildingId?: string | number; geometry?: any; area?: number; source?: 'osm' | 'trace' } | null>(null);

  // Fiche détaillée du bâtiment ENREGISTRÉ sélectionné (historique, modification contrôlée).
  const [sheetOpen, setSheetOpen] = useState(false);
  // Retraçage du contour d'un bâtiment enregistré (modification contrôlée) : tracé en cours, puis contour en attente de justification.
  const [contourTracing, setContourTracing] = useState(false);
  const contourTracingRef = useRef(false);
  const [pendingContour, setPendingContour] = useState<GeoJSON.Polygon | null>(null);
  const [sheetTab, setSheetTab] = useState<'fiche' | 'historique' | 'modifier' | undefined>(undefined);
  useEffect(() => {
    contourTracingRef.current = contourTracing;
  }, [contourTracing]);
  // Certification demandée par un résident (NavigationX) : parcours distinct d'un enregistrement ordinaire.
  const [certification, setCertification] = useState<Declaration | null>(null);
  
  useEffect(() => {
    clickedCoordsRef.current = clickedCoords;
  }, [clickedCoords]);

  const [, setNewOccupantName] = useState('');
  const [, setNewDeliveryNotes] = useState('');
  const [, setNewBuildingType] = useState<BuildingType>('R');
  const [, setNewFloorLevel] = useState<string>('');
  const [, setNewUnitCode] = useState<string>('');

  // Itinéraire
        
  // Système de suivi d'itinéraire professionnel réel (Live GPS ou Clics d'Émulation)
        // Aide au test par clics de souris sur carte sur PC
  
  // Télémétrie en temps réel
          
  // Logs API pour l'aspect de développeur expert Full-Stack
  

  useEffect(() => {
    localStorage.setItem('hailandmap_token', accessToken);
  }, [accessToken]);

  // Ajouter un log API
  

  // Initialisation de la carte
  useEffect(() => {
    if (!mapContainerRef.current) return;

    mapboxgl.accessToken = accessToken;

    try {
      const activeStyle = styles.find(s => s.id === currentStyle)?.url || CUSTOM_STYLE_URL;
      
      let initialCenter = currentCenterRef.current || [-13.678, 9.537];
      if (!initialCenter || !Array.isArray(initialCenter) || isNaN(initialCenter[0]) || isNaN(initialCenter[1])) {
        initialCenter = [-13.678, 9.537];
      }

      const maxZoomLvl = 22; // Permet de zoomer au maximum demandé
      let initialZoom = currentZoomRef.current 
        ? Math.min(currentZoomRef.current, maxZoomLvl) 
        : (currentStyle === 'satellite' ? 16 : 13.5);
      if (typeof initialZoom !== 'number' || isNaN(initialZoom)) {
        initialZoom = currentStyle === 'satellite' ? 16 : 13.5;
      }

      let initialPitch = currentStyle === 'satellite' ? 0 : (currentPitchRef.current !== null ? currentPitchRef.current : 60);
      if (typeof initialPitch !== 'number' || isNaN(initialPitch)) {
        initialPitch = currentStyle === 'satellite' ? 0 : 60;
      }

      let initialBearing = currentStyle === 'satellite' ? 0 : (currentBearingRef.current !== null ? currentBearingRef.current : -20);
      if (typeof initialBearing !== 'number' || isNaN(initialBearing)) {
        initialBearing = currentStyle === 'satellite' ? 0 : -20;
      }

      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: activeStyle,
        center: initialCenter as [number, number],
        zoom: initialZoom,
        maxZoom: maxZoomLvl,
        pitch: initialPitch,
        bearing: initialBearing,
        antialias: true,
        preserveDrawingBuffer: true
      });

      // Capture et désamorçage préventif des erreurs de style (ex: modèles 3D, tilesets absents)
      const attachStyleErrorHandler = () => {
        try {
          const style = (map as any).style;
          if (style && typeof style.on === 'function') {
            style.on('error', (e: any) => {
              const errMsg = e?.message || e?.error?.message || String(e || '');
              if (
                errMsg.includes("source 'composite' does not exist") ||
                errMsg.includes("does not exist in the map's style") ||
                false
              ) {
                return;
              }
              console.warn("Mapbox style internal event caught gracefully:", errMsg);
            });
          }
        } catch (e) {}
      };
      map.on('style.load', attachStyleErrorHandler);

      map.on('error', (e) => {
        const errMsg = (e as any)?.message || (e as any)?.error?.message || String(e || '');
        if (
          errMsg.includes("source 'composite' does not exist") ||
          errMsg.includes("does not exist in the map's style") ||
          false
        ) {
          return;
        }
        console.warn("Mapbox error caught gracefully:", errMsg);

        // Fallback automatique UNIQUEMENT si le style personnalisé est réellement inaccessible (HTTP 401, 403, 404)
        const isStyleFetchFailure =
          (e as any)?.status === 401 ||
          (e as any)?.status === 403 ||
          (e as any)?.status === 404 ||
          (e as any)?.error?.status === 401 ||
          (e as any)?.error?.status === 403 ||
          (e as any)?.error?.status === 404 ||
          errMsg.toLowerCase().includes('failed to fetch style') ||
          errMsg.toLowerCase().includes('could not load style') ||
          (errMsg.includes('401') && !errMsg.includes('tile')) ||
          (errMsg.includes('403') && !errMsg.includes('tile')) ||
          (errMsg.includes('404') && errMsg.toLowerCase().includes('style'));

        if (currentStyle === 'custom' && !hasAttemptedStyleFallbackRef.current && isStyleFetchFailure) {
          hasAttemptedStyleFallbackRef.current = true;
          console.warn("Style personnalisé introuvable ou inaccessible. Repli sur le style standard Mapbox...");
          setCurrentStyle('standard-3d');
        }
      });

      mapRef.current = map;

      // Force la vue Nadir à plat (0 d'inclinaison) et orientée Nord pour éliminer la perspective en satellite
      if (currentStyle === 'satellite') {
        if (map.dragRotate) map.dragRotate.disable();
        if (map.touchZoomRotate) {
          try {
            map.touchZoomRotate.disableRotation();
          } catch (e) {
            map.touchZoomRotate.disable();
          }
        }
        if (map.keyboard) {
          try {
            map.keyboard.disableRotation();
          } catch (e) {}
        }
        try {
          map.setPitch(0);
          map.setBearing(0);
        } catch (e) {}
      } else {
        if (map.dragRotate) map.dragRotate.enable();
        if (map.touchZoomRotate) {
          try {
            map.touchZoomRotate.enableRotation();
          } catch (e) {
            map.touchZoomRotate.enable();
          }
        }
        if (map.keyboard) {
          try {
            map.keyboard.enableRotation();
          } catch (e) {}
        }
      }

      const updateCameraRefs = () => {
        if (!map) return;
        const center = map.getCenter();
        const currentZoom = map.getZoom();
        if (center && typeof center.lng === 'number' && typeof center.lat === 'number' && !isNaN(center.lng) && !isNaN(center.lat)) {
          currentCenterRef.current = [center.lng, center.lat];
        }
        if (typeof currentZoom === 'number' && !isNaN(currentZoom)) {
          currentZoomRef.current = currentZoom;
          setZoomLevel(currentZoom);
        }
        const pitch = map.getPitch();
        if (typeof pitch === 'number' && !isNaN(pitch)) {
          currentPitchRef.current = pitch;
          setCurrentPitch(pitch);
        }
        const bearing = map.getBearing();
        if (typeof bearing === 'number' && !isNaN(bearing)) {
          currentBearingRef.current = bearing;
        }

        // Rafraîchir dynamiquement les concessions et volumes 3D selon le viewport et le seuil de 200m (zoom >= 15.0)
        if (refreshViewportDataRef.current) {
          refreshViewportDataRef.current(map);
        }

        // Mettre à jour dynamiquement la grille de 200m si elle est active et qu'on est suffisamment zoomé
        if (is200mGridActiveRef.current && currentZoom >= 11) {
          try {
            const bounds = map.getBounds();
            const source = map.getSource('grid-200m') as mapboxgl.GeoJSONSource;
            if (bounds && source) {
              source.setData(generate200mGridGeoJSON({
                minLng: bounds.getWest() - 0.05,
                maxLng: bounds.getEast() + 0.05,
                minLat: bounds.getSouth() - 0.05,
                maxLat: bounds.getNorth() + 0.05
              }));
            }
          } catch (e) {
            console.warn("Erreur mise à jour dynamique grille:", e);
          }
        }
      };

      let moveThrottleTimer: any = null;
      const handleMapMove = () => {
        if (selectedPolygonHideActionRef.current && map) {
          const p = map.project(selectedPolygonHideActionRef.current.lngLat);
          setSelectedPolygonHideAction(prev => prev ? { ...prev, screenPos: { x: p.x, y: p.y } } : null);
        }
        if (!moveThrottleTimer) {
          moveThrottleTimer = setTimeout(() => {
            moveThrottleTimer = null;
            if (mapRef.current && refreshViewportDataRef.current) {
              refreshViewportDataRef.current(mapRef.current);
            }
          }, 120);
        }
      };

      map.on('move', handleMapMove);
      map.on('moveend', updateCameraRefs);
      map.on('zoomend', updateCameraRefs);
      map.on('pitchend', updateCameraRefs);
      map.on('rotateend', updateCameraRefs);

      // Contrôles de navigation classiques Mapbox désactivés pour une interface personnalisée ultra-premium et épurée (en bas à droite)

      // Ajouter l'échelle
      map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }));

      const ctx = { buildings, buildingsRef, childDrawCompleteHandlerRef, childMapClickHandlerRef, clickSelectionTargetRef, clickedCoordsRef, currentStyle, custom3DBuildingsRef, detectOsmBuildingsInZone, detectedOsmFeaturesRef, drawPointsRef, drawRafRef, entrancePickerConfigRef, handleFinalizeCustomDrawRef, hiddenBuildingsListRef, is200mGridActive, is200mGridActiveRef, isDrawModeRef, isSelectionModeRef, lastMouseCoordRef, map, markerRef, previewEntranceMarkerRef, renderDrawRubberbandPreviewRef, selectedBuildingRef, selectedTerritoriesRef, selectionTargetNatureRef, setClickedCoords, setDrawPoints, setIsGridPanelOpen, setMapNotification, setSelected3DBuilding, setSelectedBuilding, setSelectedGridBuildings, setSelectedGridCell, setSelectedPolygonHideAction, snappedCoordsRef, wallLineCacheRef };
      map.on('load', () => handleMapLoad(ctx));

      // Événement clic sur la carte
      map.on('click', (e) => handleMapClick(e, ctx));

      // Événement déplacement de souris (curseur interactif sur toutes les structures 3D OSM, perso et custom)
      map.on('mousemove', (e) => handleMapMouseMove(e, ctx));

      // Événement sortie de carte
      map.on('mouseleave', () => {
        map.getCanvas().style.cursor = '';
        if (drawRafRef.current !== null) {
          cancelAnimationFrame(drawRafRef.current);
          drawRafRef.current = null;
        }
        lastMouseCoordRef.current = null;
        if (isDrawModeRef.current) {
          renderDrawRubberbandPreviewRef.current?.();
        }
        const hoverSource = map.getSource('hovered-building') as mapboxgl.GeoJSONSource;
        if (hoverSource) {
          hoverSource.setData({
            type: 'FeatureCollection',
            features: []
          });
        }
      });

      // Double-clic pour finaliser et refermer le tracé OSM directement
      map.on('dblclick', (e) => {
        if (isDrawModeRef.current && drawPointsRef.current.length >= 3) {
          e.preventDefault();
          handleFinalizeCustomDrawRef.current?.();
          return;
        }
      });

      return () => {
        map.remove();
        mapRef.current = null;
        markerRef.current = null;
        userMarkerRef.current = null;
      };
    } catch (err) {
      console.error("Erreur d'initialisation de la carte Mapbox:", err);
    }
  }, [accessToken, currentStyle]);

  // Redimensionner automatiquement la carte quand la barre latérale s'ouvre ou se ferme ou quand l'onglet change
  useEffect(() => {
    if (mapRef.current) {
      const resizeTimer = setTimeout(() => {
        if (mapRef.current) {
          try {
            mapRef.current.resize();
          } catch (e) {
            console.warn("Resize error:", e);
          }
        }
      }, 350);
      return () => clearTimeout(resizeTimer);
    }
  }, [isSidebarOpen, activeAdminView]);

  
    // ===== CAS 2 : SUPPRESSION GÉOJSON IMMÉDIATE (Bâtiments CRÉÉS HailandMap) =====
  const handleDeleteCustom3DBuilding = (targetId: string) => {
    const updatedFeatures = custom3DBuildings.filter(f => f.id !== targetId);
    setCustom3DBuildings(updatedFeatures);

    if (mapRef.current && (typeof mapRef.current.isStyleLoaded !== 'function' || mapRef.current.isStyleLoaded())) {
      try {
        const src = (mapRef.current.getSource('custom-3d-buildings') || mapRef.current.getSource('custom-buildings-source')) as mapboxgl.GeoJSONSource;
        if (src) {
          src.setData({
            type: 'FeatureCollection',
            features: updatedFeatures.map(b => ({
              type: 'Feature' as const,
              id: b.id,
              properties: {
                id: b.id,
                name: b.name,
                floors: b.floors,
                height: b.height,
                base_height: b.base_height || 0,
                color: b.color || '#f0eee9',
                opacity: b.opacity || 1.0,
                area_m2: b.area_m2
              },
              geometry: {
                type: 'Polygon' as const,
                coordinates: b.coordinates
              }
            }))
          });
        }
      } catch (e) {}
    }

  };

  const handleHideSelectedPolygon = () => {
    if (!selectedPolygonHideAction) return;

    const { buildingId, hideData, isCustom } = selectedPolygonHideAction;

    if (isCustom) {
      // CAS 2 : Suppression GeoJSON immédiate du bâtiment créé
      handleDeleteCustom3DBuilding(String(buildingId));
    } else {
      // CAS 1 : Masquage par filtre du bâtiment natif Mapbox / OSM
      const itemToHide: HiddenBuildingData = hideData || {
        id: buildingId,
        rawFeatureId: typeof buildingId === 'number' ? buildingId : (isNaN(Number(buildingId)) ? null : Number(buildingId)),
        geometry: selectedBuilding?.geom,
        centroid: selectedBuilding?.centroid?.coordinates as [number, number]
      };

      setHiddenBuildingsList(prev => {
        if (prev.some(b => String(b.id) === String(itemToHide.id) || (itemToHide.rawFeatureId && b.rawFeatureId === itemToHide.rawFeatureId))) {
          return prev;
        }
        const updated = [...prev, itemToHide];
        if (mapRef.current) {
          applyHiddenBuildingsFilter(mapRef.current, updated);
        }
        return updated;
      });

    }

    // Effacer la surbrillance orange de sélection
    if (mapRef.current && (typeof mapRef.current.isStyleLoaded !== 'function' || mapRef.current.isStyleLoaded())) {
      try {
        const selectionSource = mapRef.current.getSource('selected-building') as mapboxgl.GeoJSONSource;
        if (selectionSource) {
          selectionSource.setData({
            type: 'FeatureCollection',
            features: []
          });
        }
      } catch (e) {}
    }

    // Réinitialiser la sélection et le bouton flottant
    setSelectedBuilding(null);
    setSelected3DBuilding(null);
    setClickedCoords(null);
    setSelectedPolygonHideAction(null);

    setMapNotification({
      type: 'info',
      title: isCustom ? 'Bâtiment Supprimé' : 'Bâtiment Masqué',
      message: isCustom
        ? 'Le volume 3D a été supprimé de la source GeoJSON.'
        : 'Le bâtiment natif a été masqué via la règle de filtrage Mapbox.'
    });
  };

  // ===== ÉTAPE 1 : DÉTECTION SPATIALE AUTOMATIQUE DES BÂTIMENTS OSM DANS UNE ZONE/COUR =====
  const [detectedOsmBuildingsInZone, setDetectedOsmBuildingsInZone] = useState<string[]>([]);

  const detectOsmBuildingsInZone = useCallback((zoneGeometry: any, mapInstance?: mapboxgl.Map | null): string[] => {
    const map = mapInstance || mapRef.current;
    if (!map || !zoneGeometry) return [];

    try {
      // 1. Nettoyer et valider la géométrie de la zone / cour
      const cleanGeom = sanitizeGeometry(zoneGeometry);
      if (!cleanGeom || !cleanGeom.coordinates || cleanGeom.coordinates.length === 0) return [];

      const zoneFeature: any = {
        type: 'Feature',
        properties: {},
        geometry: cleanGeom
      };

      // 2. Calculer le Bounding Box avec Turf.js
      const bbox = turf.bbox(zoneFeature); // [minLng, minLat, maxLng, maxLat]

      // Projeter les 4 coins du BBox en coordonnées pixels écran
      const p1 = map.project([bbox[0], bbox[1]]);
      const p2 = map.project([bbox[2], bbox[1]]);
      const p3 = map.project([bbox[2], bbox[3]]);
      const p4 = map.project([bbox[0], bbox[3]]);

      // Ajouter une grande marge (250px) pour inclure la hauteur 3D des bâtiments (toits)
      const MARGIN = 250;
      const minPxX = Math.min(p1.x, p2.x, p3.x, p4.x) - MARGIN;
      const maxPxX = Math.max(p1.x, p2.x, p3.x, p4.x) + MARGIN;
      const minPxY = Math.min(p1.y, p2.y, p3.y, p4.y) - MARGIN;
      const maxPxY = Math.max(p1.y, p2.y, p3.y, p4.y) + MARGIN;

      // 3. Interroger les entités rendues sur la carte dans le rectangle projeté
      const renderedFeatures = map.queryRenderedFeatures([
        [minPxX, minPxY],
        [maxPxX, maxPxY]
      ]);

      // 4. Filtrer les bâtiments natifs Mapbox / OSM (en excluant nos couches internes)
      const candidateFeatures = renderedFeatures.filter(f => {
        const layerId = f.layer?.id || '';
        const srcLayer = f['source-layer'] || '';
        if (
          layerId.includes('selected-') ||
          layerId.includes('hovered-') ||
          layerId.includes('draw-') ||
          layerId.includes('courtyard-') ||
          layerId.includes('grid-200m') ||
          layerId.includes('custom-3d') ||
          layerId.includes('osm-detected') ||
          layerId.includes('route') ||
          layerId.includes('circle')
        ) {
          return false;
        }
        return (
          srcLayer === 'building' ||
          layerId === '3d-buildings' ||
          layerId === '3d-buildings-invisible' ||
          layerId === 'building' ||
          (f.properties && (f.properties.extrude === 'true' || f.properties.building || f.properties.type === 'building'))
        );
      });

      // 5. Analyse spatiale Turf.js : vérifier l'inclusion stricte dans le polygone de la cour
      const detectedFeatures: any[] = [];
      const detectedIdsSet = new Set<string>();

      candidateFeatures.forEach(f => {
        if (!f.geometry) return;
        const firstCoord = Array.isArray(f.geometry.coordinates?.[0]?.[0])
          ? `${f.geometry.coordinates[0][0][0]}_${f.geometry.coordinates[0][0][1]}`
          : (Array.isArray(f.geometry.coordinates?.[0]) ? `${f.geometry.coordinates[0][0]}_${f.geometry.coordinates[0][1]}` : '0_0');
        const featId = String(f.id || f.properties?.id || f.properties?.mapbox_id || f.properties?.osm_id || `${f.geometry.type}-${firstCoord}`);
        if (detectedIdsSet.has(featId)) return;

        let isInside = false;
        let centroidPt: any = null;
        try {
          // A. Test via centroïde du bâtiment
          centroidPt = turf.centroid(f as any);
          if (centroidPt && turf.booleanPointInPolygon(centroidPt, zoneFeature)) {
            isInside = true;
          } else if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') {
            // B. Test robuste: vérifier si au moins un des points du contour est dans la zone
            // Cela évite les erreurs de topologie de Turf.js sur les polygones découpés par les tuiles Mapbox
            const rings = f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates?.[0];
            if (rings && rings.length > 0) {
              const outerRing = rings[0];
              if (Array.isArray(outerRing)) {
                for (let i = 0; i < outerRing.length; i += 2) { // Tester un point sur deux pour la performance
                  if (outerRing[i] && Array.isArray(outerRing[i]) && outerRing[i].length >= 2) {
                    const pt = turf.point(outerRing[i] as any);
                    if (turf.booleanPointInPolygon(pt, zoneFeature)) {
                      isInside = true;
                      break;
                    }
                  }
                }
                // Si toujours pas trouvé, on teste tous les points
                if (!isInside) {
                  for (let i = 0; i < outerRing.length; i++) {
                    if (outerRing[i] && Array.isArray(outerRing[i]) && outerRing[i].length >= 2) {
                      const pt = turf.point(outerRing[i] as any);
                      if (turf.booleanPointInPolygon(pt, zoneFeature)) {
                        isInside = true;
                        break;
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          // Ignorer les erreurs de calcul géométrique
        }

        if (isInside) {
          detectedIdsSet.add(featId);
          const rawNum = typeof f.id === 'number' ? f.id : (typeof f.properties?.id === 'number' ? f.properties.id : (!isNaN(Number(featId)) ? Number(featId) : null));
          let centroidCoords: [number, number] | undefined = centroidPt ? [centroidPt.geometry.coordinates[0], centroidPt.geometry.coordinates[1]] : undefined;
          if (!centroidCoords && f.geometry) {
            try {
              const c = turf.centroid(f as any);
              if (c?.geometry?.coordinates) {
                centroidCoords = [c.geometry.coordinates[0], c.geometry.coordinates[1]];
              }
            } catch (e) {}
          }
          detectedFeatures.push({
            type: 'Feature',
            id: featId,
            properties: {
              id: featId,
              rawFeatureId: rawNum,
              original_layer: f.layer?.id || '3d-buildings',
              source: f.source || 'composite',
              sourceLayer: f['source-layer'] || 'building',
              osm_id: f.properties?.osm_id || f.properties?.mapbox_id || f.properties?.id,
              centroid: centroidCoords
            },
            geometry: f.geometry
          });
        }
      });

      const detectedBuildingIds = Array.from(detectedIdsSet);

      // 6. Log console clair et net (Exigence stricte de l'étape 1 & 2)
      console.log("Bâtiments OSM détectés dans la zone :", detectedBuildingIds);

      setDetectedOsmBuildingsInZone(detectedBuildingIds);

      // 7. Enregistrer et afficher la surbrillance jaune/ambre persistante sur la carte
      detectedOsmFeaturesRef.current = detectedFeatures;
      const detectedSource = map.getSource('osm-detected-in-zone') as mapboxgl.GeoJSONSource;
      if (detectedSource) {
        detectedSource.setData({
          type: 'FeatureCollection',
          features: detectedFeatures
        });
      }

      // 8. ÉTAPE 2 : Masquage automatique immédiat en bloc de tous les bâtiments OSM identifiés
      if (detectedFeatures.length > 0) {
        const itemsToHide: HiddenBuildingData[] = detectedFeatures.map(f => {
          const fid = f.id || f.properties?.id;
          const rawNum = f.properties?.rawFeatureId !== undefined ? f.properties.rawFeatureId : (typeof fid === 'number' ? fid : (!isNaN(Number(fid)) ? Number(fid) : null));
          return {
            id: fid,
            rawFeatureId: rawNum,
            layerId: f.properties?.original_layer || '3d-buildings',
            source: f.properties?.source || 'composite',
            sourceLayer: f.properties?.sourceLayer || 'building',
            osmId: f.properties?.osm_id || f.properties?.mapbox_id || f.properties?.id || fid,
            geometry: f.geometry,
            centroid: f.properties?.centroid
          };
        });

        setHiddenBuildingsList(prev => {
          const existingIds = new Set(prev.map(b => String(b.id)));
          const existingRawIds = new Set(prev.filter(b => b.rawFeatureId !== null && b.rawFeatureId !== undefined).map(b => Number(b.rawFeatureId)));

          const newItems = itemsToHide.filter(item => {
            const idStr = String(item.id);
            if (existingIds.has(idStr)) return false;
            if (item.rawFeatureId && existingRawIds.has(Number(item.rawFeatureId))) return false;
            return true;
          });

          if (newItems.length === 0) return prev;

          const updatedList = [...prev, ...newItems];
          applyHiddenBuildingsFilter(map, updatedList);
          return updatedList;
        });

        console.log(`[Étape 2] Masquage automatique en bloc de ${itemsToHide.length} bâtiments OSM dans la zone :`, detectedBuildingIds);
      }

      // 9. Notification / Toast UI
      setMapNotification({
        type: detectedBuildingIds.length > 0 ? 'success' : 'info',
        title: 'Détection & Masquage OSM',
        message: `${detectedBuildingIds.length} bâtiment(s) OSM détecté(s) et masqué(s) automatiquement dans la zone.`
      });


      return detectedBuildingIds;
    } catch (err) {
      console.warn("Erreur détection spatiale OSM dans la zone:", err);
      return [];
    }
  }, []);

  // ===== ÉTAPE 2 : FONCTION DÉDIÉE DE MASQUAGE EN BLOC DES BÂTIMENTS OSM DANS LA ZONE =====
  const maskOsmBuildingsInZoneBulk = useCallback((zoneGeometry?: any, customFeatures?: any[]): number => {
    const map = mapRef.current;
    if (!map) return 0;

    let featuresToProcess = customFeatures || detectedOsmFeaturesRef.current;

    if ((!featuresToProcess || featuresToProcess.length === 0) && zoneGeometry) {
      detectOsmBuildingsInZone(zoneGeometry, map);
      featuresToProcess = detectedOsmFeaturesRef.current;
    }

    if (!featuresToProcess || featuresToProcess.length === 0) {
      return 0;
    }

    const itemsToHide: HiddenBuildingData[] = featuresToProcess.map(f => {
      const featId = f.id || f.properties?.id;
      const rawNum = f.properties?.rawFeatureId !== undefined ? f.properties.rawFeatureId : (typeof featId === 'number' ? featId : (!isNaN(Number(featId)) ? Number(featId) : null));

      return {
        id: featId || `osm-masked-${Math.random().toString(36).substr(2, 9)}`,
        rawFeatureId: rawNum,
        layerId: f.properties?.original_layer || '3d-buildings',
        source: f.properties?.source || 'composite',
        sourceLayer: f.properties?.sourceLayer || 'building',
        osmId: f.properties?.osm_id || f.properties?.mapbox_id || f.properties?.id || featId,
        geometry: f.geometry,
        centroid: f.properties?.centroid
      };
    });

    setHiddenBuildingsList(prev => {
      const existingIds = new Set(prev.map(b => String(b.id)));
      const existingRawIds = new Set(prev.filter(b => b.rawFeatureId !== null && b.rawFeatureId !== undefined).map(b => Number(b.rawFeatureId)));

      const newItems = itemsToHide.filter(item => {
        const idStr = String(item.id);
        if (existingIds.has(idStr)) return false;
        if (item.rawFeatureId && existingRawIds.has(Number(item.rawFeatureId))) return false;
        return true;
      });

      if (newItems.length === 0) return prev;

      const updatedList = [...prev, ...newItems];
      applyHiddenBuildingsFilter(map, updatedList);
      return updatedList;
    });

    const maskedIds = itemsToHide.map(b => b.id);
    console.log(`[Étape 2] Masquage automatique en bloc de ${itemsToHide.length} bâtiment(s) OSM dans la zone :`, maskedIds);

    setMapNotification({
      type: 'success',
      title: 'Masquage Automatique OSM (Étape 2)',
      message: `${itemsToHide.length} ancien(s) bâtiment(s) OSM masqué(s) dans la zone pour faire place nette.`
    });


    return itemsToHide.length;
  }, [detectOsmBuildingsInZone]);

  // ===== LOGIQUE DE CHARGEMENT PAR VIEWPORT & SEUIL D'ALTITUDE 200M =====
                  const layerEnv: LayerEnv = {
    selectedBuildingId: () => selectedBuildingRef.current?.id,
    detectedOsmFeatures: () => detectedOsmFeaturesRef.current,
  };

  // Rafraîchisseur unifié de toutes les couches de concessions et volumes dans le viewport
  const refreshViewportConcessionsAndBuildings = useCallback((mapInstance: mapboxgl.Map) => {
    if (!mapInstance) return;
    syncCourtyardsLayer(mapInstance, buildingsRef.current, layerEnv);
    syncCustom3DBuildingsLayer(mapInstance, custom3DBuildingsRef.current, highlighted3DBuildingIdRef.current);
    enforceBuildingsAboveCourtyardsOrder(mapInstance);
    syncEntryPointsLayer(mapInstance, buildingsRef.current);
    syncFixedGpsCentroidsLayer(
      mapInstance,
      buildingsRef.current,
      custom3DBuildingsRef.current,
      selectedBuildingRef.current?.id || clickedCoordsRef.current?.buildingId,
      layerEnv
    );
  }, []);

  useEffect(() => {
    refreshViewportDataRef.current = refreshViewportConcessionsAndBuildings;
  }, [refreshViewportConcessionsAndBuildings]);

  // Synchroniser les bâtiments 3D et les centroïdes fixes GPS sur la carte Mapbox
  useEffect(() => {
    if (mapRef.current) {
      refreshViewportConcessionsAndBuildings(mapRef.current);
    }
  }, [all3DBuildings, highlighted3DBuildingId, currentStyle, buildings, selectedBuilding, clickedCoords, detectedOsmBuildingsInZone, refreshViewportConcessionsAndBuildings]);

  // Synchronisation dynamique de la surbrillance 3D lors de la sélection d'un bâtiment
  useEffect(() => {
    if (selectedBuilding) {
      setHighlighted3DBuildingId(`3d-auto-${selectedBuilding.id}`);
    } else {
      setHighlighted3DBuildingId(null);
    }
  }, [selectedBuilding]);

  // Fonction de rendu dynamique du contour élastique et des sommets style OpenStreetMap
  const renderDrawRubberbandPreview = useCallback((cursorLng?: number, cursorLat?: number, screenPoint?: mapboxgl.Point) => {
    if (!mapRef.current) return;
    if (typeof mapRef.current.isStyleLoaded === 'function' && !mapRef.current.isStyleLoaded()) return;

    try {
      const drawSource = mapRef.current.getSource('draw-source') as mapboxgl.GeoJSONSource;
      if (!drawSource) return;

      if (!isDrawModeRef.current) {
        drawSource.setData({
          type: 'FeatureCollection',
          features: []
        });
        return;
      }

      const points = drawPointsRef.current;
      if (points.length === 0) {
        drawSource.setData({
          type: 'FeatureCollection',
          features: []
        });
        return;
      }

      let activeCursorCoord: [number, number] | null = null;
      if (cursorLng !== undefined && cursorLat !== undefined && !isNaN(cursorLng) && !isNaN(cursorLat)) {
        activeCursorCoord = [cursorLng, cursorLat];
      } else if (lastMouseCoordRef.current) {
        activeCursorCoord = [lastMouseCoordRef.current.lng, lastMouseCoordRef.current.lat];
        if (!screenPoint) {
          screenPoint = lastMouseCoordRef.current.point;
        }
      }

      let isNearFirstPoint = false;
      if (points.length >= 3 && activeCursorCoord && screenPoint && mapRef.current) {
        try {
          const p0Screen = mapRef.current.project(points[0]);
          const dx = p0Screen.x - screenPoint.x;
          const dy = p0Screen.y - screenPoint.y;
          const distPx = Math.sqrt(dx * dx + dy * dy);
          if (distPx < 18) {
            isNearFirstPoint = true;
            activeCursorCoord = [points[0][0], points[0][1]];
            if (mapRef.current.getCanvas()) {
              mapRef.current.getCanvas().style.cursor = 'pointer';
            }
          } else if (mapRef.current.getCanvas()) {
            mapRef.current.getCanvas().style.cursor = 'crosshair';
          }
        } catch (err) {}
      }

      const features: any[] = [];

      // 1. Sommets posés : uniquement les vrais points cliqués (petits cercles blancs nets sans contour noir)
      points.forEach((pt, idx) => {
        features.push({
          type: 'Feature',
          properties: {
            index: idx,
            isClosingTarget: idx === 0 && isNearFirstPoint
          },
          geometry: {
            type: 'Point',
            coordinates: pt
          }
        });
      });

      // STRICTEMENT AUCUN POINT SOUS LE CURSEUR (comme sur OpenStreetMap : uniquement la ligne élastique)

      // 2. Polygone élastique intérieur translucide (effet élastique en direct OSM)
      if (points.length >= 2 && activeCursorCoord && !isNearFirstPoint) {
        features.push({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [[...points, activeCursorCoord, points[0]]]
          }
        });
      } else if (points.length >= 3) {
        features.push({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [[...points, points[0]]]
          }
        });
      }

      // 3. Ligne élastique fine continue qui suit le curseur en temps réel
      if (points.length === 1 && activeCursorCoord) {
        features.push({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [points[0], activeCursorCoord]
          }
        });
      } else if (points.length >= 2) {
        let lineCoords: [number, number][];
        if (activeCursorCoord && !isNearFirstPoint) {
          lineCoords = [...points, activeCursorCoord, points[0]];
        } else {
          lineCoords = [...points, points[0]];
        }
        features.push({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: lineCoords
          }
        });
      }

      drawSource.setData({
        type: 'FeatureCollection',
        features
      });
    } catch (err) {
      console.warn("Erreur affichage tracé élastique OSM:", err);
    }
  }, []);

  useEffect(() => {
    renderDrawRubberbandPreviewRef.current = renderDrawRubberbandPreview;
  }, [renderDrawRubberbandPreview]);

  // Synchronisation de la délimitation libre OSM lors du changement de points
  useEffect(() => {
    if (isDrawMode) {
      renderDrawRubberbandPreview();
    }
  }, [drawPoints, isDrawMode, renderDrawRubberbandPreview]);

  // Nettoyage de la source de dessin lorsque les modes sont quittés
  useEffect(() => {
    if (!isDrawMode && mapRef.current) {
      try {
        const drawSource = mapRef.current.getSource('draw-source') as mapboxgl.GeoJSONSource;
        if (drawSource) {
          drawSource.setData({
            type: 'FeatureCollection',
            features: []
          });
        }
      } catch (e) {}
    }
  }, [isDrawMode]);

  // Finalisation et validation du dessin libre personnalisé
  const handleFinalizeCustomDraw = useCallback(() => {
    const points = drawPointsRef.current;
    if (points.length < 3) return;

    // Retraçage du contour d'un bâtiment enregistré : le polygone revient à la fiche (justification), rien n'est créé.
    if (contourTracingRef.current) {
      setPendingContour({ type: 'Polygon', coordinates: [[...points, points[0]]] });
      setContourTracing(false);
      setSheetTab('modifier');
      setIsDrawMode(false);
      setDrawPoints([]);
      const drawSource = mapRef.current?.getSource('draw-source') as mapboxgl.GeoJSONSource | undefined;
      drawSource?.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    // Convertir drawPoints en polygone GeoJSON (avec point initial refermé en fin)
    const coordinates = [...points, points[0]];
    const customPolygonGeometry = {
      type: 'Polygon' as const,
      coordinates: [coordinates]
    };

    // Calculer la surface en m2 de la zone dessinée
    const areaVal = calculatePolygonArea([coordinates]);

    // Calculer le centre de gravité approximatif du dessin
    const lats = points.map(p => p[1]);
    const lngs = points.map(p => p[0]);
    const centerLat = lats.reduce((a, b) => a + b, 0) / points.length;
    const centerLng = lngs.reduce((a, b) => a + b, 0) / points.length;

    let finalGeometry: any = customPolygonGeometry;
            let finalLat = centerLat;
    let finalLng = centerLng;

    // Étape 0 : Prévenir les superpositions avec les bâtiments déjà enregistrés par l'utilisateur
    const existingBuilding = buildings.find(b => {
      const dist = calculateDistance(centerLat, centerLng, b.centroid.coordinates[1], b.centroid.coordinates[0]);
      return dist < 22; // Seuil d'évitement
    });

    if (existingBuilding) {
      setSelectedBuilding(existingBuilding);
      const existingArea = safeCalculateArea(existingBuilding.geom, 80);
      setClickedCoords({
        latitude: existingBuilding.centroid.coordinates[1],
        longitude: existingBuilding.centroid.coordinates[0],
        buildingId: existingBuilding.id,
        geometry: sanitizeGeometry(existingBuilding.geom),
        area: existingArea
      });

      if (mapRef.current) {
        const isCourtyard = selectionTargetNatureRef.current === 'courtyard' || Boolean(existingBuilding.has_courtyard);
        const selSource = mapRef.current.getSource('selected-building') as mapboxgl.GeoJSONSource;
        if (selSource && existingBuilding.geom) {
          selSource.setData({
            type: 'Feature',
            properties: {
              is_courtyard: isCourtyard
            },
            geometry: existingBuilding.geom
          });
        }
        if (isCourtyard) {
          if (markerRef.current) {
            markerRef.current.remove();
            markerRef.current = null;
          }
        } else {
          if (markerRef.current) {
            markerRef.current.setLngLat([existingBuilding.centroid.coordinates[0], existingBuilding.centroid.coordinates[1]]);
          } else {
            const el = document.createElement('div');
            el.className = 'custom-house-marker';
            el.innerHTML = `
              <div class="flex items-center justify-center w-10 h-10 bg-orange-500 rounded-full border-2 border-slate-900 shadow-xl shadow-orange-500/30 transform transition-transform duration-200 hover:scale-110 cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-5 h-5 text-slate-950">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                  <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
              </div>
              <div class="w-2.5 h-2.5 bg-orange-500 border border-slate-900 rounded-full mx-auto -mt-1 shadow-md animate-ping"></div>
            `;
            const marker = new mapboxgl.Marker({ element: el })
              .setLngLat([existingBuilding.centroid.coordinates[0], existingBuilding.centroid.coordinates[1]])
              .addTo(mapRef.current);
            markerRef.current = marker;
          }
        }
        if (existingBuilding && typeof existingBuilding.centroid.coordinates[0] === 'number' && typeof existingBuilding.centroid.coordinates[1] === 'number' && !isNaN(existingBuilding.centroid.coordinates[0]) && !isNaN(existingBuilding.centroid.coordinates[1])) {
          try {
            mapRef.current.easeTo({ center: [existingBuilding.centroid.coordinates[0], existingBuilding.centroid.coordinates[1]], duration: 400 });
          } catch (e) {
            console.warn("easeTo failed:", e);
          }
        }
      }

      setIsDrawMode(false);
      setDrawPoints([]);

      setMapNotification({
        type: 'warning',
        title: 'Superposition Évitée - Déjà Enregistré',
        message: `Un polygone d'habitation pré-existant (${existingArea}m²) a déjà été enregistré à cet endroit sous le nom "${existingBuilding.landmark_note || 'Bâtiment'}". Il a été automatiquement sélectionné.`
      });
      return;
    }

    const customDrawUniqueId = `custom-draw-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // Validation directe du tracé utilisateur
    setClickedCoords({
      latitude: finalLat,
      longitude: finalLng,
      buildingId: customDrawUniqueId,
      geometry: sanitizeGeometry(customPolygonGeometry),
      area: areaVal
    });

    if (mapRef.current) {
      const isCourtyard = selectionTargetNatureRef.current === 'courtyard';
      const selSource = mapRef.current.getSource('selected-building') as mapboxgl.GeoJSONSource;
      if (selSource) {
        selSource.setData({
          type: 'Feature',
          properties: {
            is_courtyard: isCourtyard
          },
          geometry: customPolygonGeometry
        });
      }

      if (isCourtyard) {
        if (markerRef.current) {
          markerRef.current.remove();
          markerRef.current = null;
        }
      } else {
        if (markerRef.current) {
          markerRef.current.setLngLat([finalLng, finalLat]);
        } else {
          const el = document.createElement('div');
          el.className = 'custom-house-marker';
          el.innerHTML = `
            <div class="flex items-center justify-center w-10 h-10 bg-orange-500 rounded-full border-2 border-slate-900 shadow-xl shadow-orange-500/30 transform transition-transform duration-200 hover:scale-110 cursor-pointer">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-5 h-5 text-slate-950">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
            </div>
            <div class="w-2.5 h-2.5 bg-orange-500 border border-slate-900 rounded-full mx-auto -mt-1 shadow-md animate-ping"></div>
          `;
          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([finalLng, finalLat])
            .addTo(mapRef.current);
          markerRef.current = marker;
        }
      }
      if (typeof finalLng === 'number' && typeof finalLat === 'number' && !isNaN(finalLng) && !isNaN(finalLat)) {
        try {
          mapRef.current.easeTo({ center: [finalLng, finalLat], duration: 400 });
        } catch (e) {
          console.warn("easeTo failed:", e);
        }
      }

      const drawSource = mapRef.current.getSource('draw-source') as mapboxgl.GeoJSONSource;
      if (drawSource) {
        drawSource.setData({
          type: 'FeatureCollection',
          features: []
        });
      }
    }

    // Étape 1 : Détection spatiale automatique des bâtiments OSM dans la zone dessinée
    detectOsmBuildingsInZone(finalGeometry, mapRef.current);

    setMapNotification({
      type: 'success',
      title: 'Contour Enregistré !',
      message: `Votre contour personnalisé (${areaVal.toFixed(0)} m²) a été sélectionné pour l'enregistrement.`
    });


    setIsDrawMode(false);
    setDrawPoints([]);
  }, [buildings, detectOsmBuildingsInZone]);

  useEffect(() => {
    handleFinalizeCustomDrawRef.current = handleFinalizeCustomDraw;
  }, [handleFinalizeCustomDraw]);

  // Gérer le changement de style
   const handleStyleChange = (styleId: string) => {
    if (mapRef.current) {
      const center = mapRef.current.getCenter();
      if (center && typeof center.lng === 'number' && typeof center.lat === 'number' && !isNaN(center.lng) && !isNaN(center.lat)) {
        currentCenterRef.current = [center.lng, center.lat];
      }
      const zoom = mapRef.current.getZoom();
      if (typeof zoom === 'number' && !isNaN(zoom)) {
        currentZoomRef.current = styleId === 'satellite' ? Math.min(zoom, 22) : zoom;
      }
      if (styleId === 'satellite') {
        currentPitchRef.current = 0;
        currentBearingRef.current = 0;
      } else {
        const pitch = mapRef.current.getPitch();
        if (typeof pitch === 'number' && !isNaN(pitch)) {
          currentPitchRef.current = pitch;
        }
        const bearing = mapRef.current.getBearing();
        if (typeof bearing === 'number' && !isNaN(bearing)) {
          currentBearingRef.current = bearing;
        }
      }
    }
    hasAttemptedStyleFallbackRef.current = false;
    setCurrentStyle(styleId);
  };

  // Gérer le filtre satellite HD super-résolution en temps réel sur le canvas Mapbox
  useEffect(() => {
    if (!mapRef.current) return;
    try {
      const canvas = mapRef.current.getCanvas();
      if (!canvas) return;
      
      // L'utilisateur veut éradiquer le flou si le mode super-netteté est activé
      if (currentStyle === 'satellite' && isHdEnhanceForce) {
        canvas.classList.add('satellite-hd-sharpen');
      } else {
        canvas.classList.remove('satellite-hd-sharpen');
      }
    } catch (e) {
      console.warn("Erreur d'application du filtre CSS de de-blurring", e);
    }
  }, [currentStyle, isHdEnhanceForce]);

  // Synchroniser la visibilité de la grille de 200m en temps réel
  useEffect(() => {
    if (!mapRef.current) return;
    if (typeof mapRef.current.isStyleLoaded === 'function' && !mapRef.current.isStyleLoaded()) return;
    try {
      const visibility = (currentStyle === 'satellite' && is200mGridActive) ? 'visible' : 'none';
      if (mapRef.current.getLayer('grid-200m-line-casing')) {
        mapRef.current.setLayoutProperty('grid-200m-line-casing', 'visibility', visibility);
      }
      if (mapRef.current.getLayer('grid-200m-line')) {
        mapRef.current.setLayoutProperty('grid-200m-line', 'visibility', visibility);
      }
      if (mapRef.current.getLayer('grid-200m-label')) {
        mapRef.current.setLayoutProperty('grid-200m-label', 'visibility', visibility);
      }
      
      // Mettre à jour immédiatement la source de données de la grille pour le viewport actuel si elle devient active
      if (currentStyle === 'satellite' && is200mGridActive) {
        const bounds = mapRef.current.getBounds();
        const source = mapRef.current.getSource('grid-200m') as mapboxgl.GeoJSONSource;
        if (bounds && source) {
          source.setData(generate200mGridGeoJSON({
            minLng: bounds.getWest() - 0.05,
            maxLng: bounds.getEast() + 0.05,
            minLat: bounds.getSouth() - 0.05,
            maxLat: bounds.getNorth() + 0.05
          }));
        }
      }
    } catch (e) {
      console.warn("Erreur mise à jour visibilité de la grille 200m:", e);
    }
  }, [currentStyle, is200mGridActive]);

  // Synchroniser la visibilité des bâtiments OSM détectés : Masqués en vue Satellite (pour un tracé épuré), Visibles dans Carte Original Perso (3D)
  useEffect(() => {
    if (!mapRef.current) return;
    if (typeof mapRef.current.isStyleLoaded === 'function' && !mapRef.current.isStyleLoaded()) return;
    try {
      const isSatellite = currentStyle === 'satellite';
      const visibility = isSatellite ? 'none' : 'visible';
      
      if (mapRef.current.getLayer('osm-detected-in-zone-fill')) {
        mapRef.current.setLayoutProperty('osm-detected-in-zone-fill', 'visibility', visibility);
      }
      if (mapRef.current.getLayer('osm-detected-in-zone-outline')) {
        mapRef.current.setLayoutProperty('osm-detected-in-zone-outline', 'visibility', visibility);
      }

      // Si on repasse en vue Original Perso (non-satellite) et que des bâtiments OSM ont été détectés, restaurer les données
      if (!isSatellite && detectedOsmFeaturesRef.current && detectedOsmFeaturesRef.current.length > 0) {
        const detectedSource = mapRef.current.getSource('osm-detected-in-zone') as mapboxgl.GeoJSONSource;
        if (detectedSource) {
          detectedSource.setData({
            type: 'FeatureCollection',
            features: detectedOsmFeaturesRef.current
          });
        }
      }
    } catch (e) {
      console.warn("Erreur mise à jour visibilité osm-detected-in-zone:", e);
    }
  }, [currentStyle]);

  // Synchronisation dynamique du style de délimitation (Pointillés sans fond pour les cours vs Remplissage orange pour bâtiment unique)
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) return;

    const isCourtyard = selectionTargetNature === 'courtyard' || Boolean(selectedBuilding?.has_courtyard);

    try {
      if (map.getLayer('selected-building-fill')) {
        map.setPaintProperty('selected-building-fill', 'fill-opacity', isCourtyard ? 0 : 0.35);
      }
      if (map.getLayer('selected-building-outline')) {
        map.setLayoutProperty('selected-building-outline', 'visibility', isCourtyard ? 'none' : 'visible');
      }
      if (map.getLayer('selected-courtyard-outline')) {
        map.setLayoutProperty('selected-courtyard-outline', 'visibility', isCourtyard ? 'visible' : 'none');
      }
      if (map.getLayer('selected-courtyard-outline-casing')) {
        map.setLayoutProperty('selected-courtyard-outline-casing', 'visibility', isCourtyard ? 'visible' : 'none');
      }

      // Si une géométrie est actuellement sélectionnée, synchroniser la propriété is_courtyard
      const selSource = map.getSource('selected-building') as mapboxgl.GeoJSONSource;
      if (selSource && clickedCoords?.geometry) {
        selSource.setData({
          type: 'Feature',
          properties: {
            is_courtyard: isCourtyard
          },
          geometry: clickedCoords.geometry
        });
      }

      // Pour une cour/concession, ne pas encombrer le centre avec un gros marqueur orange,
      // afin de laisser le champ totalement libre pour tracer les bâtiments intérieurs
      if (isCourtyard && markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
    } catch (e) {
      console.warn("Erreur synchronisation layer cour/bâtiment:", e);
    }
  }, [selectionTargetNature, selectedBuilding, clickedCoords?.geometry]);

  // Mettre à jour l'affichage de notre position d'utilisateur (Point bleu officiel Google Maps)
  useEffect(() => {
    if (!mapRef.current) return;

    if (!userLocation) {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      return;
    }

    if (userMarkerRef.current) {
      userMarkerRef.current.setLngLat([userLocation.longitude, userLocation.latitude]);
    } else {
      const el = document.createElement('div');
      el.className = 'google-maps-user-marker';
      el.innerHTML = `
        <div class="relative flex items-center justify-center pointer-events-none select-none" style="width: 32px; height: 32px;">
          <!-- Halo de pulsation radar / onde de précision GPS -->
          <div class="absolute w-8 h-8 rounded-full bg-blue-500/25 animate-ping pointer-events-none"></div>
          <div class="absolute w-6 h-6 rounded-full bg-blue-500/20 pointer-events-none"></div>
          
          <!-- Point bleu compact Google Maps -->
          <div class="relative w-[16px] h-[16px] bg-[#1a73e8] rounded-full border-[2.5px] border-white shadow-[0_1px_4px_rgba(0,0,0,0.35),0_0_8px_rgba(26,115,232,0.5)] z-10 flex items-center justify-center">
            <div class="w-1.5 h-1.5 bg-white/40 rounded-full"></div>
          </div>
        </div>
      `;

      const marker = new mapboxgl.Marker({ 
        element: el,
        anchor: 'center'
      })
        .setLngLat([userLocation.longitude, userLocation.latitude])
        .addTo(mapRef.current);
      userMarkerRef.current = marker;
    }
  }, [userLocation]);

  // Événement Ma Position GPS
  
  // Recherche dynamique des adresses nationales HailandCode
  
  // Sélectionner un bâtiment depuis les suggestions de recherche
  
  const detectCommuneFromCoords = (lng: number, lat: number): string => {
    // Si on est dans la région élargie de Conakry / Grand Conakry
    if (lng >= -14.0 && lng <= -13.4) {
      if (lng < -13.68) return 'Kaloum';
      if (lng < -13.64) return 'Dixinn';
      if (lng < -13.60) return 'Matam';
      if (lng < -13.55) return 'Ratoma';
      if (lng < -13.45) return 'Matoto';
      return 'Coyah';
    }
    // Si on est plus à l'ouest (Boké / Kamsar / Fria / Boffa)
    if (lng < -14.0) {
      if (lat > 10.5) return 'Boké';
      if (lat > 10.1) return 'Fria';
      return 'Boffa';
    }
    // Si on est à Kindia / Forécariah
    if (lng >= -13.4 && lng < -12.5) {
      if (lat < 9.5) return 'Forécariah';
      return 'Kindia';
    }
    // Si on est au Fouta (Mamou / Labé)
    if (lng >= -12.5 && lng < -11.5) {
      if (lat > 11.0) return 'Labé';
      return 'Mamou';
    }
    // Haute-Guinée Ouest (Faranah / Dabola)
    if (lng >= -11.5 && lng < -10.5) {
      return 'Faranah';
    }
    // Haute-Guinée Est (Kankan / Siguiri / Mandiana)
    if (lng >= -10.5 && lng < -9.0) {
      if (lat > 11.2) return 'Siguiri';
      return 'Kankan';
    }
    // Guinée Forestière (Nzérékoré / Macenta / Lola)
    return 'Nzérékoré';
  };

  // Création / Enregistrement du bâtiment / Adresse Nationale HailandCode & Administrative (Module 1)
  const handleCreateBuilding = async (newBuildingData: Building | Building[]) => {
    const rawList = Array.isArray(newBuildingData) ? newBuildingData : [newBuildingData];
    if (rawList.length === 0) return;

    // Résolution systématique du double adressage pour chaque concession ou bâtiment
    const listToInsert: Building[] = rawList.map((b) => {
      try {
        const dual = computeDualAddressing(b);
        return {
          ...b,
          commune: dual.adminAddress.communeNom || b.commune,
          commune_id: dual.adminAddress.communeId || b.commune_id,
          quartier: b.quartier || dual.adminAddress.quartierNom,
          quartier_id: b.quartier_id || dual.adminAddress.quartierId,
          region: b.region || dual.adminAddress.regionNom,
          region_id: b.region_id || dual.adminAddress.regionId,
          prefecture: b.prefecture || dual.adminAddress.prefectureNom,
          prefecture_id: b.prefecture_id || dual.adminAddress.prefectureId,
          admin_address_code: b.admin_address_code || dual.adminAddress.adminAddressCode,
          formatted_address: b.formatted_address || dual.adminAddress.formattedAddress,
        };
      } catch (e) {
        console.warn(`[handleCreateBuilding] Erreur calcul double adressage pour ${b.id}:`, e);
        return b;
      }
    });

    // Enregistrer localement et dans l'état de l'application immédiatement sans doublons d'IDs
    setBuildings(prev => {
      const newIds = new Set(listToInsert.map(b => b.id));
      return [...listToInsert, ...prev.filter(b => !newIds.has(b.id))];
    });
    setSelectedBuilding(listToInsert[0]);

    // Ensemble des zones déjà créées ou confirmées durant cette opération
    const handledZoneCodes = new Set<string>();

    for (const newBuilding of listToInsert) {
      // Payload de l'API POST v3.0 pour nos logs
      

      // Éviter l'erreur d'intégrité de clé étrangère (FK) zone_id : pré-création sécurisée de la zone
      const zoneId = newBuilding.zone_id;
      const zoneCode = newBuilding.zone_code;
      const isZoneKnown = zoneCode && (handledZoneCodes.has(zoneCode) || zones.some(z => z.id === zoneId || z.zone_code === zoneCode));

      try {
        if (!isZoneKnown && zoneCode && newBuilding.centroid?.coordinates) {
          console.log(`[Supabase DEBUG] La zone "${zoneCode}" n'existe pas localement. Pré-création de la zone pour éviter une violation FK.`);
          
          const minLng = -13.75;
          const minLat = 9.45;
          const stepLng = 0.001825;
          const stepLat = 0.0018;

          const [lng, lat] = newBuilding.centroid.coordinates;
          const colIdx = Math.floor((lng - minLng) / stepLng);
          const rowIdx = Math.floor((lat - minLat) / stepLat);

          const w = minLng + colIdx * stepLng;
          const e = w + stepLng;
          const s = minLat + rowIdx * stepLat;
          const n = s + stepLat;

          const newZone: Zone = {
            id: zoneId || `z-${zoneCode}`,
            zone_code: zoneCode,
            commune: newBuilding.commune || 'Ratoma',
            geom: {
              type: 'Polygon',
              coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]]
            },
            centroid: {
              type: 'Point',
              coordinates: [(w + e) / 2, (s + n) / 2]
            },
            created_at: new Date().toISOString()
          };

          const zoneRes = await saveZoneInSupabase(newZone);
          handledZoneCodes.add(zoneCode);
          if (zoneRes.success) {
            setZones(prev => [...prev.filter(z => z.id !== newZone.id && z.zone_code !== newZone.zone_code), newZone]);
            console.log(`[Supabase DEBUG] Zone "${zoneCode}" pré-insérée avec succès.`);
          }
        }

        // Insertion séquentielle du bâtiment
        const res = (newBuilding as any)._saved ? { success: true, localOnly: false } : await insertBuildingInSupabase(newBuilding);
        const units = (newBuilding as any).units;
        if (res.success && !res.localOnly && Array.isArray(units) && units.length) {
          try {
            await saveUnits(newBuilding.id, units);
          } catch (e: any) {
            setMapNotification({ type: 'warning', title: 'Unités non enregistrées', message: `${newBuilding.hailand_code || newBuilding.id} : ${e?.message || e}` });
          }
        }
      } catch (err: any) {
      }
    }
    // Le serveur a attribué les codes publics et rattaché les personnes déjà déclarées dans ces bâtiments.
    syncAttachments();
    loadAdminCodes(listToInsert.map((b) => b.id))
      .then((codes) => setBuildings((prev) => prev.map((b) => (b.id in codes ? { ...b, admin_code: codes[b.id] } : b))))
      .catch(() => {});

    // =========================================================================
    // ÉTAPE 3 : EXTRUSION 3D VOLUMÉTRIQUE + MUR D'ENCEINTE DE CONCESSION (SUBMIT)
    // =========================================================================
    const buildingsToExtrude = listToInsert.filter(b => {
      // Si c'est une concession/cour avec des bâtiments enfants, on extrude les toitures physiques des enfants
      // Sinon si c'est un bâtiment direct, on extrude son polygone direct
      const hasChildrenInList = listToInsert.some(other => other.parent_building_id === b.id);
      if (hasChildrenInList && b.has_courtyard) return false;
      return Boolean(b.geom && b.geom.coordinates && b.geom.coordinates.length > 0);
    });

    const new3DGenerated: Custom3DBuilding[] = [];
    let wallSectionsCount = 0;

    // 1. Extrusion des volumes de toiture des bâtiments
    buildingsToExtrude.forEach(b => {
      const rawFloors = typeof b.floor_count === 'number' ? b.floor_count : 0;
      // RDC (rawFloors === 0) = 1 niveau physique = 3.2m
      // R+1 = 2 niveaux = 6.4m, R+2 = 3 niveaux = 9.6m, etc.
      const physicalFloors = rawFloors === 0 ? 1 : rawFloors + 1;
      const heightMeters = parseFloat((physicalFloors * 3.2).toFixed(1));
      const typeColor = BUILDING_TYPE_3D_COLORS[b.building_type] || '#f0eee9';
      const floorLabel = rawFloors === 0 ? 'RDC' : `R+${rawFloors}`;

      let centroidCoords: [number, number] = [0, 0];
      if (b.centroid?.coordinates && Array.isArray(b.centroid.coordinates)) {
        centroidCoords = [b.centroid.coordinates[0], b.centroid.coordinates[1]];
      } else {
        try {
          const c = turf.centroid(b.geom as any);
          centroidCoords = [c.geometry.coordinates[0], c.geometry.coordinates[1]];
        } catch (e) {
          centroidCoords = (b.geom.coordinates[0]?.[0] as [number, number]) || [-13.6, 9.6];
        }
      }

      const custom3DEntity: Custom3DBuilding = {
        id: `3d-auto-${b.id || Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        name: b.hailand_code || b.landmark_note || `Bâtiment ${b.building_type} (${floorLabel})`,
        floors: physicalFloors,
        height: heightMeters,
        base_height: 0,
        color: typeColor,
        opacity: 1.0,
        coordinates: b.geom.coordinates as [number, number][][],
        centroid: centroidCoords,
        area_m2: safeCalculateArea(b.geom, 120),
        created_at: new Date().toISOString()
      };

      new3DGenerated.push(custom3DEntity);
    });

    // 2. Génération automatique du Mur d'Enceinte 3D (Clôture 2.2m) pour les cours/concessions
    const courtyardsToEnclose = listToInsert.filter(b => {
      return b.has_courtyard && (b.courtyard_geom || (b.parent_building_id === null && b.geom));
    });

    const handledCourtyardGeoms = new Set<string>();
    courtyardsToEnclose.forEach(courtyardBldg => {
      const geomToUse = courtyardBldg.courtyard_geom || courtyardBldg.geom;
      if (!geomToUse || !geomToUse.coordinates || geomToUse.coordinates.length === 0) return;

      const firstPt = geomToUse.coordinates?.[0]?.[0];
      const geomKey = Array.isArray(firstPt) ? `${firstPt[0]}_${firstPt[1]}_${geomToUse.coordinates.length}` : String(courtyardBldg.id);
      if (handledCourtyardGeoms.has(geomKey)) return;
      handledCourtyardGeoms.add(geomKey);

      const walls = createCourtyardWall3DEntities(courtyardBldg, geomToUse);
      if (walls.length > 0) {
        wallSectionsCount += walls.length;
        new3DGenerated.push(...walls);
      }
    });

    if (new3DGenerated.length > 0) {
      setCustom3DBuildings(prev => {
        const updated = [...new3DGenerated, ...prev];
        try {
          localStorage.setItem('hailandmap_custom_3d_buildings', safeJsonStringify(updated, 0));
        } catch (e) {}

        if (mapRef.current) {
          syncCustom3DBuildingsLayer(mapRef.current, updated, new3DGenerated[0]?.id);
        }

        return updated;
      });

      // Inclinaison douce de la caméra si elle est plate pour apprécier le volume 3D
      if (mapRef.current && mapRef.current.getPitch() < 25) {
        mapRef.current.easeTo({
          pitch: 50,
          duration: 800
        });
        setCurrentPitch(50);
      }

      console.log(`[Rendu 3D Global] ${new3DGenerated.length} entités 3D générées (${buildingsToExtrude.length} bâtiments, ${wallSectionsCount} section(s) de clôture) :`, new3DGenerated);

      // Feedback Visuel UI adapté
      if (wallSectionsCount > 0) {
        setMapNotification({
          type: 'success',
          title: "Concession & Mur d'Enceinte 3D Générés",
          message: `Clôture 3D (2.2m) érigée autour de la cour avec ${buildingsToExtrude.length} bâtiment(s) modélisé(s).`
        });
      } else if (buildingsToExtrude.length === 1) {
        const firstLabel = buildingsToExtrude[0].floor_count === 0 ? 'RDC' : `R+${buildingsToExtrude[0].floor_count}`;
        setMapNotification({
          type: 'success',
          title: 'Extrusion 3D Automatique',
          message: `Bâtiment 3D généré & enregistré (${firstLabel} · ${(buildingsToExtrude[0].floor_count === 0 ? 1 : buildingsToExtrude[0].floor_count + 1) * 3.2}m).`
        });
      } else {
        setMapNotification({
          type: 'success',
          title: 'Modélisation 3D Complète',
          message: `${new3DGenerated.length} entités 3D générées et enregistrées avec succès.`
        });
      }
    } else {
      // Notification globale pour l'utilisateur
      if (listToInsert.length === 1) {
        setMapNotification({
          type: 'success',
          title: 'Bâtiment Enregistré',
          message: `Bâtiment ${listToInsert[0].hailand_code || listToInsert[0].id} enregistré avec succès.`
        });
      } else {
        setMapNotification({
          type: 'success',
          title: 'Concession / Cour Enregistrée',
          message: `Cour mère et ${listToInsert.length - 1} bâtiments enfants enregistrés avec succès.`
        });
      }
    }

    setClickedCoords(null);
    setNewOccupantName('');
    setNewDeliveryNotes('');
    setNewBuildingType('R');
    setNewFloorLevel('');
    setNewUnitCode('');

  };

                  // Démarrer le suivi d'itinéraire réel (Live GPS Watcher)
  
  // Arrêter le suivi GPS
  
  // Réinitialiser le suivi et tracer de nouveau depuis la dernière position
  
  // Réinitialiser complètement le tracé et stopper tous les trackers GPS
  
  // Fonction de recentrage sur la position GPS en temps réel style Google Maps (Zoom 18 & FlyTo)
  const recenterMap = useCallback(() => {
    if (isRecentering) return;

    if (!navigator.geolocation) {
      setMapNotification({
        type: 'warning',
        title: 'Géolocalisation non supportée',
        message: "L'API de géolocalisation n'est pas prise en charge par votre navigateur."
      });
      return;
    }

    setIsRecentering(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, heading } = position.coords;
        const validHeading = (heading !== null && typeof heading === 'number' && !isNaN(heading)) ? heading : 0;

        // 1. Mettre à jour l'état de localisation utilisateur (affiche automatiquement le point bleu Google Maps)
        setUserLocation({ latitude, longitude });

        // 3. Effectuer un recentrage fluide de la vue de la carte sur cette position avec zoom 18
        if (mapRef.current && typeof longitude === 'number' && typeof latitude === 'number' && !isNaN(longitude) && !isNaN(latitude)) {
          try {
            mapRef.current.flyTo({
              center: [longitude, latitude],
              zoom: 18,
              pitch: currentStyle === 'satellite' ? 0 : 45,
              bearing: validHeading || 0,
              duration: 1500,
              essential: true
            });
          } catch (e) {
            console.warn("Erreur lors du recentrage flyTo:", e);
          }
        }

        setIsRecentering(false);

        setMapNotification({
          type: 'success',
          title: 'Position actualisée',
          message: `Carte recentrée sur votre position GPS (${latitude.toFixed(5)}, ${longitude.toFixed(5)}).`
        });
      },
      (error) => {
        setIsRecentering(false);
        console.warn("Erreur d'acquisition GPS:", error);

        let errorMessage = `Impossible d'obtenir la position GPS (${error.message}).`;
        if (error.code === error.PERMISSION_DENIED || error.code === 1) {
          errorMessage = "Accès à la géolocalisation refusé. Veuillez autoriser l'accès GPS dans les paramètres de votre navigateur.";
        } else if (error.code === error.POSITION_UNAVAILABLE || error.code === 2) {
          errorMessage = "Signal GPS indisponible. Vérifiez vos paramètres réseau ou de localisation.";
        } else if (error.code === error.TIMEOUT || error.code === 3) {
          errorMessage = "Délai d'acquisition GPS dépassé. Veuillez réessayer.";
        }


        setMapNotification({
          type: 'warning',
          title: 'Erreur Géolocalisation',
          message: errorMessage
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }, [isRecentering, currentStyle]);

  // Gestionnaire pour le mode interactif de sélection d'entrée (verrouillage / snapping mur de cour)
  const handleEntrancePickerModeChange = useCallback((config: EntrancePickerConfig | null) => {
    entrancePickerConfigRef.current = config;
    if (!mapRef.current) return;
    const map = mapRef.current;

    if (config && config.active) {
      map.getCanvas().style.cursor = 'crosshair';

      // Si cour avec mur, pré-calculer la LineString et initialiser le point
      if (config.type === 'courtyard' && config.wallGeometry) {
        try {
          const wallLine = turf.polygonToLine(config.wallGeometry);
          wallLineCacheRef.current = wallLine;
          let firstCoord: [number, number] | null = null;
          if (wallLine.type === 'Feature' && wallLine.geometry.type === 'LineString') {
            firstCoord = wallLine.geometry.coordinates[0] as [number, number];
          } else if (wallLine.type === 'FeatureCollection' && wallLine.features[0]?.geometry?.type === 'LineString') {
            firstCoord = wallLine.features[0].geometry.coordinates[0] as [number, number];
          }
          if (firstCoord) {
            snappedCoordsRef.current = { lng: firstCoord[0], lat: firstCoord[1] };
            if (!previewEntranceMarkerRef.current) {
              const el = document.createElement('div');
              el.className = 'entrance-snap-dot pointer-events-none';
              el.style.width = '10px';
              el.style.height = '10px';
              el.style.borderRadius = '50%';
              el.style.backgroundColor = '#00e5ff';
              el.style.border = '2px solid #ffffff';
              el.style.boxShadow = '0 0 0 2px rgba(0, 229, 255, 0.4), 0 0 10px rgba(0, 229, 255, 0.95)';
              el.style.boxSizing = 'border-box';

              previewEntranceMarkerRef.current = new mapboxgl.Marker({ 
                element: el,
                anchor: 'center'
              });
            }
            previewEntranceMarkerRef.current.setLngLat(firstCoord);
            if (!previewEntranceMarkerRef.current.getElement().parentElement) {
              previewEntranceMarkerRef.current.addTo(map);
            }
          }
        } catch (err) {
          wallLineCacheRef.current = null;
        }
      } else {
        wallLineCacheRef.current = null;
      }
    } else {
      map.getCanvas().style.cursor = '';
      wallLineCacheRef.current = null;
      if (previewEntranceMarkerRef.current) {
        previewEntranceMarkerRef.current.remove();
        previewEntranceMarkerRef.current = null;
      }
      snappedCoordsRef.current = null;
    }
  }, []);

  // ── Atelier v2 : outil actif déduit des réglages existants de la carte (aucun nouvel état) ──
  const [v2Tool, setV2Tool] = useState<AtelierTool | null>('selection');
  const activeTool: AtelierTool | null = isDrawMode ? 'trace' : v2Tool === 'trace' ? 'selection' : v2Tool;

  const selectAtelierTool = (t: AtelierTool) => {
    setV2Tool(t);
    setIsSelectionMode(true);
    setSelectedBuilding(null);
    setDrawPoints([]);
    setIsDrawMode(t === 'trace');
    if (t === 'carreau') {
      setClickSelectionTarget('grid_cell');
    } else if (t === 'selection' || t === 'batiment') {
      setClickSelectionTarget('building');
      setSelectionTargetNature('single');
    } else if (t === 'concession') {
      setClickSelectionTarget('building');
      setSelectionTargetNature('courtyard');
    }
  };

  // L'assistant s'ouvre tout de suite avec les outils de création ; avec l'outil Sélection, l'inspecteur propose d'abord les actions.
  useEffect(() => {
    setAssistantStarted(!!clickedCoords && v2Tool !== 'selection');
  }, [clickedCoords]);

  // Atelier v2 : les messages d'opération vont dans la boîte « Activité » et dans la barre d'état, jamais en fenêtre flottante.
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!mapNotification) return;
    const entry: ActivityEntry = { id: Date.now(), at: Date.now(), tone: (mapNotification.type as any) || 'info', title: mapNotification.title, message: mapNotification.message };
    setActivity((prev) => [entry, ...prev].slice(0, 50));
    setStatusMsg(mapNotification.title);
    const t = setTimeout(() => setStatusMsg(null), 8000);
    return () => clearTimeout(t);
  }, [mapNotification]);

  // La carte suit la largeur disponible quand les panneaux latéraux apparaissent ou disparaissent (Atelier v2).
  useEffect(() => {
    
    const t = setTimeout(() => mapRef.current?.resize(), 60);
    return () => clearTimeout(t);
  }, [true, activeAdminView, clickedCoords, assistantStarted, selectedBuilding, selectedGridCell, isGridPanelOpen, leftOpen]);

  // Coordonnées du curseur dans la barre d'état (Atelier v2).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || activeAdminView !== 'carte') return;
    let raf = 0;
    const move = (e: mapboxgl.MapMouseEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setCursorPos({ lng: e.lngLat.lng, lat: e.lngLat.lat });
      });
    };
    map.on('mousemove', move);
    return () => {
      map.off('mousemove', move);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [true, activeAdminView]);

  // Ctrl K : recherche universelle.
  useEffect(() => {
    
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [true]);

  // Certification demandée par un résident : ouvre l'atelier sur le bâtiment déclaré, demande affichée et pré-remplie.
  const handleCertify = (declarationId: string) => {
    const d = declarations.find((x) => x.id === declarationId);
    const p = d ? declarationPoint(d) : null;
    if (!d || !p) return;
    const geometry = d.osm_polygon_geom ? sanitizeGeometry(d.osm_polygon_geom) : sanitizeGeometry(generateSquarePolygon(p[0], p[1], 5));
    setSelectedBuilding(null);
    setSheetOpen(false);
    setCertification(d);
    setActiveAdminView('carte');
    setClickedCoords({ latitude: p[1], longitude: p[0], buildingId: `decl-${d.id}`, geometry, area: safeCalculateArea(geometry, 100) });
    startAssistant('single');
    setTimeout(() => {
      try {
        mapRef.current?.flyTo({ center: p, zoom: 19, pitch: 0, bearing: 0, duration: 1100, essential: true });
        const sel = mapRef.current?.getSource('selected-building') as mapboxgl.GeoJSONSource | undefined;
        sel?.setData({ type: 'Feature', properties: { is_courtyard: false }, geometry });
      } catch (e) {
        console.warn('Centrage impossible :', e);
      }
    }, 350);
  };

  // Fin de certification : rattachement officiel garanti (même si l'agent a tracé un contour qui ne contient pas le point).
  const completeCertification = async (d: Declaration, created: Building[]) => {
    const p = declarationPoint(d);
    const target = (p && findRegisteredAt(created, p[0], p[1])) || created.find((b) => !b.parent_building_id) || created[0];
    try {
      if (target) await linkDeclaration(d.id, target.id);
      await syncAttachments();
      setMapNotification({ type: 'success', title: 'Certification terminée', message: 'Le bâtiment est certifié (niveau 3) et le résident y est rattaché officiellement.' });
    } catch (e: any) {
      setMapNotification({ type: 'warning', title: 'Rattachement à vérifier', message: e?.message || 'Le bâtiment est enregistré ; vérifiez le rattachement dans Revue → Demandes.' });
    }
  };

  const startAssistant = (nature: 'single' | 'courtyard') => {
    setSelectionTargetNature(nature);
    setV2Tool(nature === 'courtyard' ? 'concession' : 'batiment');
    setAssistantStarted(true);
  };

  const quitFreeDraw = () => {
    setIsDrawMode(false);
    setDrawPoints([]);
    const drawSource = mapRef.current?.getSource('draw-source') as mapboxgl.GeoJSONSource | undefined;
    if (drawSource) drawSource.setData({ type: 'FeatureCollection', features: [] });
  };

  // Raccourcis clavier de l'Atelier v2 (V, B, C, P) : seulement sur la carte, hors champs de saisie.
  useEffect(() => {
    if (activeAdminView !== 'carte') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (paletteOpen) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
      if (t) {
        e.preventDefault();
        selectAtelierTool(t.id);
      } else if (e.key === 'Escape' && isDrawMode) {
        quitFreeDraw();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // L'utilisateur affiché est l'agent réellement connecté (et non un profil de démonstration).
  const currentAdmin = profiles.find((p) => p.id === actorId()) || profiles.find((p) => p.role === 'admin') || profiles[0];
  const pendingCount = buildings.filter((b) => b.status === 'en_attente').length;
  const conflictCount = buildings.filter((b) => b.status === 'conteste').length;


  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100">
      <AtelierTopBar
          view={activeAdminView}
          adminName={currentAdmin?.full_name ?? 'Agent'}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onSearch={() => setPaletteOpen(true)}
          onBell={() => { setActivityOpen((o) => !o); setActivitySeen(activity.length); }}
          unread={activity.length > activitySeen}
        />
      {loadError && (
        <div role="alert" className="flex shrink-0 items-center gap-3 border-b border-hx-bad/30 bg-hx-bad/10 px-4 py-2 text-[13px] text-hx-text">
          <span className="h-2 w-2 shrink-0 rounded-full bg-hx-bad" />
          <span className="flex-1">Impossible de charger le registre ({loadError}). Les listes peuvent être vides ou incomplètes : rien n'a été modifié.</span>
          <button type="button" onClick={() => void syncData()} disabled={loading} className="h-8 rounded-lg border border-hx-line2 bg-hx-hover px-3 font-semibold transition hover:bg-hx-card disabled:opacity-50">
            {loading ? 'Chargement…' : 'Réessayer'}
          </button>
        </div>
      )}
      

      {/* CONTAINER MAÎTRE DES VUES (rail des modules en v2) */}
      <div className="flex min-h-0 flex-1 max-md:pb-14">
        <ModuleRail
            view={activeAdminView}
            onViewChange={(v) => {
              setActiveAdminView(v);
              setSelectedBuilding(null);
            }}
            pendingCount={pendingCount}
            conflictCount={conflictCount}
          />
      <div className="flex-1 relative overflow-hidden flex">
        
        {/* VUE DE LA CARTE COMPLÈTE (Préservation de l'arbre et du chargement Mapbox) */}
        <div className={`flex-1 relative ${activeAdminView === 'carte' ? 'flex' : 'hidden'}`}>
            <div className="relative w-full h-full flex overflow-hidden">
              {/* Filtres de Convolution GPU réutilisés via CSS filters */}
              <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
                <defs>
                  <filter id="satellite-super-resolution-sharpen">
                    <feConvolveMatrix 
                      order="3" 
                      preserveAlpha="true" 
                      kernelMatrix="
                         0   -1.3    0 
                        -1.3  6.2   -1.3 
                         0   -1.3    0" 
                    />
                  </filter>
                </defs>
              </svg>
              <style>{`
                /* Filtre satellite HD super-résolution et de-blurring en CSS */
                .satellite-hd-sharpen {
                  filter: url(#satellite-super-resolution-sharpen) contrast(1.15) saturate(1.05) brightness(1.02) !important;
                }
              `}</style>
              
              {/* Overlay Backdrop de mise au point pour Mobile */}
              

              {leftOpen && !(clickedCoords && assistantStarted) && (
                <AtelierLeftPanel
                  buildings={buildings}
                  selectedId={selectedBuilding?.id ?? null}
                  onSelectBuilding={handleSelectBuildingFromAdmin}
                  gridOn={is200mGridActive}
                  onToggleGrid={() => setIs200mGridActive(!is200mGridActive)}
                  interactiveOn={isInteractiveMapActive}
                  onToggleInteractive={handleToggleInteractiveMap}
                  is3D={currentPitch > 15}
                  onToggle3D={() => {
                    if (!mapRef.current) return;
                    const nextPitch = mapRef.current.getPitch() > 15 ? 0 : 50;
                    mapRef.current.easeTo({ pitch: nextPitch, duration: 800 });
                    setCurrentPitch(nextPitch);
                  }}
                  mapStyle={currentStyle}
                  onMapStyle={handleStyleChange}
                  tab={leftTab}
                  onTab={setLeftTab}
                  onCollapse={() => setLeftOpen(false)}
                  interactiveTree={
                    <InteractiveTerritoryTree
                      selectedTerritories={selectedTerritories}
                      selectedTerritoryIds={selectedTerritories.map((t) => t.id)}
                      selectedTerritoryId={selectedTerritory?.id || null}
                      selectedEntityId={selectedTerritory?.id || null}
                      onToggleTerritory={handleToggleTerritory}
                      onToggleBatchTerritories={handleToggleBatchTerritories}
                      onSelectTerritory={handleToggleTerritory}
                      onSelectEntity={handleToggleTerritory}
                      onResetSelection={handleClearTerritorySelection}
                    />
                  }
                />
              )}

              

      {/* 3. CAPTURE DE LA CARTE MAPBOX EN PLEIN ÉCRAN */}
      <div className="flex-1 relative h-full w-full">
        
        {/* LE CONTENEUR DE LA CARTE */}
        <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" id="mapbox-viewport" />

              <AtelierToolbar
                  tool={activeTool}
                  onTool={selectAtelierTool}
                  is3D={currentPitch > 15}
                  onToggle3D={() => {
                    if (!mapRef.current) return;
                    const nextPitch = mapRef.current.getPitch() > 15 ? 0 : 50;
                    mapRef.current.easeTo({ pitch: nextPitch, duration: 800 });
                    setCurrentPitch(nextPitch);
                  }}
                  drawing={
                    isDrawMode
                      ? {
                          points: drawPoints.length,
                          areaM2: drawPoints.length >= 3 ? Math.round(calculatePolygonArea([[...drawPoints, drawPoints[0]]])) : null,
                          onFinish: handleFinalizeCustomDraw,
                          onUndo: () => setDrawPoints((prev) => prev.slice(0, -1)),
                          onQuit: quitFreeDraw,
                        }
                      : null
                  }
                />


        {/* BARRE D'OUTILS SUPÉRIEURE GAUCHE (Atelier + Mode Édition 3D Tracé) */}
        <div className={`absolute left-4 z-20 flex items-center gap-2 ${"top-16"}`}>
          

        </div>

        {/* BOUTON FLOTTANT DISCRET "MASQUER" À CÔTÉ DU CURSEUR LORSQU'UN POLYGONE EST SÉLECTIONNÉ */}
        <AnimatePresence>
          {selectedPolygonHideAction && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 3 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 3 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              style={{
                position: 'absolute',
                left: `${Math.max(8, Math.min(window.innerWidth - 110, selectedPolygonHideAction.screenPos.x + 10))}px`,
                top: `${Math.max(8, Math.min(window.innerHeight - 45, selectedPolygonHideAction.screenPos.y - 12))}px`,
                zIndex: 40,
                pointerEvents: 'auto'
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleHideSelectedPolygon();
                }}
                className="group flex items-center gap-1.5 px-2.5 py-1 bg-slate-900/95 hover:bg-rose-600 text-white rounded-full border border-slate-700/90 hover:border-rose-500 shadow-xl backdrop-blur-md text-[11px] font-semibold tracking-wide transition-all duration-150 cursor-pointer active:scale-95 ring-1 ring-white/10"
                title="Masquer ou supprimer ce polygone"
              >
                <EyeOff className="w-3 h-3 text-slate-400 group-hover:text-white transition-colors" />
                <span>Masquer</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* MODALE D'INSPECTION / MODIFICATION DU BÂTIMENT 3D */}
        <Building3DDetailModal
          building={selected3DBuilding}
          onClose={() => setSelected3DBuilding(null)}
          onUpdate={(updated) => {
            setCustom3DBuildings(prev => prev.map(b => b.id === updated.id ? updated : b));
            setSelected3DBuilding(null);
            setMapNotification({
              type: 'success',
              title: 'Bâtiment 3D Mis à Jour',
              message: `Propriétés volumétriques enregistrées (${updated.floors} étages, ${updated.height}m).`
            });
          }}
          onDelete={(bId) => {
            handleDeleteCustom3DBuilding(bId);
            setSelected3DBuilding(null);
            setMapNotification({
              type: 'warning',
              title: 'Bâtiment 3D Supprimé',
              message: 'Le volume 3D a été retiré de la carte.'
            });
          }}
          onFlyTo={(b) => {
            if (mapRef.current) {
              mapRef.current.flyTo({
                center: b.centroid,
                zoom: 17.5,
                pitch: 60,
                bearing: -25,
                duration: 1200
              });
              setCurrentPitch(60);
            }
          }}
        />

        {/* ENCART DE NOTIFICATION DES OPÉRATIONS DE DÉTOURAGE ET DE VALIDATION ALGORITHMIQUE */}
        <AnimatePresence>
          
        </AnimatePresence>

        {/* Atelier v2 : fond de carte et réglages du satellite en haut à droite */}
        {activeAdminView === 'carte' && (
          <div className="absolute right-3.5 top-3.5 z-20 flex flex-col items-end gap-2">
            <MapStyleControl current={currentStyle} onChange={handleStyleChange} onOpenLayers={() => { setLeftTab('couches'); setLeftOpen(true); }} />
            {currentStyle === 'satellite' && (
              <SatelliteOptions
                hd={isHdEnhanceForce}
                onToggleHd={() => { setIsHdEnhanceForce(!isHdEnhanceForce);}}
                grid={is200mGridActive}
                onToggleGrid={() => { setIs200mGridActive(!is200mGridActive);}}
                zoom={zoomLevel}
              />
            )}
          </div>
        )}

        

        

        {activeAdminView === 'carte' && (
          <div className="absolute bottom-4 right-3.5 z-20 max-md:bottom-auto max-md:top-[64px]">
            <ZoomCluster
              onZoomIn={() => mapRef.current?.zoomIn()}
              onZoomOut={() => mapRef.current?.zoomOut()}
              onNorth={() => mapRef.current?.easeTo({ bearing: 0, pitch: 45, duration: 800 })}
              onLocate={recenterMap}
              locating={isRecentering || isLocating}
              located={!!userLocation}
            />
          </div>
        )}

        

        {/* Atelier v2 : fiche flottante près du bâtiment sélectionné (remplace l'ancien panneau de droite) */}
        {activeAdminView === 'carte' && !assistantStarted && clickedCoords && (
          <CandidateCard
            map={mapRef.current}
            coords={clickedCoords}
            zone={detect200mZoneFromCoords(clickedCoords.longitude, clickedCoords.latitude) || ''}
            commune={detectCommuneFromCoords(clickedCoords.longitude, clickedCoords.latitude) || ''}
            buildings={buildings}
            onCreate={() => startAssistant('single')}
            onConcession={() => startAssistant('courtyard')}
            onRedraw={() => { setClickedCoords(null); selectAtelierTool('trace'); }}
            onClose={() => setClickedCoords(null)}
          />
        )}
        {activeAdminView === 'carte' && !assistantStarted && !clickedCoords && selectedBuilding && (
          !sheetOpen && <BuildingCard map={mapRef.current} building={selectedBuilding} residents={occupancy[selectedBuilding.id]?.residents ?? 0} onClose={() => setSelectedBuilding(null)} onOpenSheet={() => setSheetOpen(true)} />
        )}
        {activeAdminView === 'carte' && !assistantStarted && selectedBuilding && (sheetOpen || contourTracing) && (
          <div className={contourTracing ? 'hidden' : undefined}>
            <BuildingSheet
              building={selectedBuilding}
              residents={occupancy[selectedBuilding.id]?.residents ?? 0}
              profiles={profiles}
              onClose={() => { setSheetOpen(false); setPendingContour(null); setSheetTab(undefined); }}
              onOpenRegistre={() => setActiveAdminView('batiments')}
              onChanged={() => syncData()}
              pendingContour={pendingContour}
              initialTab={sheetTab}
              onClearContour={() => setPendingContour(null)}
              onStartContour={() => {
                setPendingContour(null);
                setContourTracing(true);
                setIsSelectionMode(true);
                setDrawPoints([]);
                setIsDrawMode(true);
              }}
            />
          </div>
        )}
        {contourTracing && selectedBuilding && (
          <div role="status" className="absolute left-1/2 top-16 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-hx-warn/50 bg-hx-panel px-4 py-2.5 text-[13px] text-hx-text shadow-2xl">
            <span><b className="text-hx-warn">Retraçage du contour</b> · {selectedBuilding.landmark_note || selectedBuilding.admin_code || selectedBuilding.id} — un clic par angle, double-clic pour terminer</span>
            <button type="button" onClick={() => { setContourTracing(false); setIsDrawMode(false); setDrawPoints([]); setSheetTab('modifier'); }} className="h-8 rounded-md border border-hx-line2 px-3 text-[12.5px]">Annuler</button>
          </div>
        )}

        {/* Atelier v2 : où je suis et où en est le registre (haut gauche) */}
        {activeAdminView === 'carte' && !leftOpen && !(clickedCoords && assistantStarted) && (
          <div className="absolute left-3.5 top-3.5 z-20 max-md:hidden">
            <PanelHandle onOpen={() => setLeftOpen(true)} />
          </div>
        )}

        {/* RUSTINE DE BIENVENUE & CONSEIL GPS */}
        <div className={`absolute bottom-6 left-4 z-20 pointer-events-none max-w-sm ${"hidden"}`}>
          <div className="bg-slate-950/90 border border-slate-800 backdrop-blur-md p-3 rounded-2xl shadow-2xl pointer-events-auto flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-orange-500/15 flex items-center justify-center text-orange-400 mt-0.5 pointer-events-none shrink-0 border border-orange-500/15 flex-shrink-0">
              <Info className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-100 font-display">Conseil d'utilisation</h4>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed font-sans">
                Activez votre départ de livraison en utilisant votre <span className="text-emerald-400 font-bold">GPS Réel</span> (bouton vert/boussole) puis cliquez sur un bâtiment sur la carte pour tracer l'itinéraire instantanément.
              </p>
            </div>
          </div>
            </div>
          </div>
        </div>

        {/* Panneau latéral droit pour l'administration de bâtiment sélectionné masqué temporairement */}

        {/* Encart flottant discret pour le carreau de grille 200m sélectionné sans ouvrir le grand volet */}
        

        {activeAdminView === 'carte' && clickedCoords && assistantStarted && (
          <AssistantAside>
              <RegistrationBanner
                origin={certification ? 'certification' : clickedCoords.source === 'osm' ? 'osm' : 'nouveau'}
                declaration={certification}
                onCancelCertification={() => {
                  setCertification(null);
                  setClickedCoords(null);
                  setActiveAdminView('validations');
                }}
              />
              <InteractiveBuildingForm
                clickedCoords={clickedCoords}
                buildings={buildings}
                prefill={certification ? {
                  buildingType: certification.declared_building_type,
                  // NavigationX compte les niveaux RDC compris ; HailandMap compte les étages au-dessus du RDC.
                  floorsCount: certification.declared_floor_count != null ? Math.max(0, certification.declared_floor_count - 1) : null,
                  landmarkNote: certification.declared_label || certification.declared_landmark,
                } : null}
                onCancel={() => {
                  setCertification(null);
                  setClickedCoords(null);
                  detectedOsmFeaturesRef.current = [];
                  setDetectedOsmBuildingsInZone([]);
                  handleEntrancePickerModeChange(null);
                  if (entranceMarkerRef.current) {
                    entranceMarkerRef.current.remove();
                    entranceMarkerRef.current = null;
                  }
                  if (mapRef.current) {
                    try {
                      const motherSrc = mapRef.current.getSource('courtyard-mother-perimeter') as mapboxgl.GeoJSONSource;
                      if (motherSrc) motherSrc.setData({ type: 'FeatureCollection', features: [] });
                      const childSrc = mapRef.current.getSource('courtyard-children') as mapboxgl.GeoJSONSource;
                      if (childSrc) childSrc.setData({ type: 'FeatureCollection', features: [] });
                      const actSrc = mapRef.current.getSource('courtyard-active-child') as mapboxgl.GeoJSONSource;
                      if (actSrc) actSrc.setData({ type: 'FeatureCollection', features: [] });
                      const osmDetSrc = mapRef.current.getSource('osm-detected-in-zone') as mapboxgl.GeoJSONSource;
                      if (osmDetSrc) osmDetSrc.setData({ type: 'FeatureCollection', features: [] });
                      const selSrc = mapRef.current.getSource('selected-building') as mapboxgl.GeoJSONSource;
                      if (selSrc) selSrc.setData({ type: 'FeatureCollection', features: [] });
                    } catch (e) {}
                  }
                }}
                onSubmit={(newB) => {
                  // Origine de l'enregistrement, tracée dans la révision de création.
                  const list = Array.isArray(newB) ? newB : [newB];
                  const origin = certification ? 'certification' : clickedCoords.source === 'osm' ? 'osm' : 'nouveau';
                  const ref = certification ? certification.id : clickedCoords.source === 'osm' ? String(clickedCoords.buildingId ?? '') || null : null;
                  list.forEach((b) => Object.assign(b, { registration_origin: origin, registration_ref: ref }));
                  const cert = certification;
                  setCertification(null);
                  handleCreateBuilding(newB).then(() => cert && completeCertification(cert, list));
                  detectedOsmFeaturesRef.current = [];
                  setDetectedOsmBuildingsInZone([]);
                  handleEntrancePickerModeChange(null);
                  if (entranceMarkerRef.current) {
                    entranceMarkerRef.current.remove();
                    entranceMarkerRef.current = null;
                  }
                  if (mapRef.current) {
                    try {
                      const motherSrc = mapRef.current.getSource('courtyard-mother-perimeter') as mapboxgl.GeoJSONSource;
                      if (motherSrc) motherSrc.setData({ type: 'FeatureCollection', features: [] });
                      const childSrc = mapRef.current.getSource('courtyard-children') as mapboxgl.GeoJSONSource;
                      if (childSrc) childSrc.setData({ type: 'FeatureCollection', features: [] });
                      const actSrc = mapRef.current.getSource('courtyard-active-child') as mapboxgl.GeoJSONSource;
                      if (actSrc) actSrc.setData({ type: 'FeatureCollection', features: [] });
                      const osmDetSrc = mapRef.current.getSource('osm-detected-in-zone') as mapboxgl.GeoJSONSource;
                      if (osmDetSrc) osmDetSrc.setData({ type: 'FeatureCollection', features: [] });
                      const selSrc = mapRef.current.getSource('selected-building') as mapboxgl.GeoJSONSource;
                      if (selSrc) selSrc.setData({ type: 'FeatureCollection', features: [] });
                    } catch (e) {}
                  }
                }}
                detect200mZoneFromCoords={detect200mZoneFromCoords}
                detectCommuneFromCoords={detectCommuneFromCoords}
                currentStyle={currentStyle}
                handleStyleChange={handleStyleChange}
                initialHasCourtyard={selectionTargetNature === 'courtyard'}
                targetNature={selectionTargetNature}
                isDrawMode={isDrawMode}
                setIsDrawMode={setIsDrawMode}
                drawPoints={drawPoints}
                setDrawPoints={setDrawPoints}
                onChildMapClickRegistration={(handler) => {
                  childMapClickHandlerRef.current = handler;
                }}
                onChildDrawCompleteRegistration={(handler) => {
                  childDrawCompleteHandlerRef.current = handler;
                }}
                onEntrancePointChange={(pt) => {
                  if (!mapRef.current) return;
                  if (entranceMarkerRef.current) {
                    entranceMarkerRef.current.remove();
                    entranceMarkerRef.current = null;
                  }
                  if (pt) {
                    const el = document.createElement('div');
                    el.className = 'custom-entrance-marker relative flex items-center justify-center pointer-events-none select-none';
                    el.innerHTML = `
                      <div class="absolute bottom-full mb-1.5 px-2 py-0.5 bg-cyan-600 border border-white text-white rounded-full text-[9px] font-bold shadow-lg whitespace-nowrap flex items-center gap-1">
                        🚪 Entrée
                      </div>
                      <div class="w-3.5 h-3.5 bg-cyan-400 border-2 border-white rounded-full shadow-md flex items-center justify-center">
                        <div class="w-1.5 h-1.5 bg-slate-950 rounded-full"></div>
                      </div>
                    `;
                    const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
                      .setLngLat([pt.lng, pt.lat])
                      .addTo(mapRef.current);
                    entranceMarkerRef.current = marker;
                  }
                }}
                onEntrancePickerModeChange={handleEntrancePickerModeChange}
                onDetectOsmBuildings={detectOsmBuildingsInZone}
                onMaskOsmBuildings={maskOsmBuildingsInZoneBulk}
                onUpdateCourtyardGeometries={(motherGeom, children, activeChildId, currentTracingGeom) => {
                  if (!mapRef.current) return;
                  const map = mapRef.current;

                  // 1. Mettre à jour l'enceinte de la cour mère (aucune couleur de fond, pointillés sur le contour)
                  // Reste visible pendant tout le processus jusqu'à la validation de la cour
                  const motherPerimeterSrc = map.getSource('courtyard-mother-perimeter') as mapboxgl.GeoJSONSource;
                  if (motherPerimeterSrc && motherGeom) {
                    motherPerimeterSrc.setData({
                      type: 'FeatureCollection',
                      features: [
                        {
                          type: 'Feature',
                          properties: {
                            is_courtyard_mother: true
                          },
                          geometry: motherGeom
                        }
                      ]
                    });
                  }

                  // Vider la source selected-building pour éviter toute couleur orange résiduelle
                  const selSource = map.getSource('selected-building') as mapboxgl.GeoJSONSource;
                  if (selSource) {
                    selSource.setData({
                      type: 'FeatureCollection',
                      features: []
                    });
                  }

                  // Retirer tout marqueur orange encombrant le centre de la cour
                  if (markerRef.current) {
                    markerRef.current.remove();
                    markerRef.current = null;
                  }

                  // 2. Mettre à jour les bâtiments enfants tracés (conservent tous leur fond bleu et contour bleu comme avant)
                  const childrenSource = map.getSource('courtyard-children') as mapboxgl.GeoJSONSource;
                  if (childrenSource) {
                    const features = children
                      .filter(c => c.geom)
                      .map(c => ({
                        type: 'Feature' as const,
                        properties: {
                          id: c.id,
                          index: c.index,
                          isConfigured: c.isConfigured,
                          area: c.area
                        },
                        geometry: c.geom
                      }));
                    childrenSource.setData({
                      type: 'FeatureCollection',
                      features
                    });
                  }

                  // 3. Mettre à jour le bâtiment enfant actif / en cours de tracé
                  const activeSource = map.getSource('courtyard-active-child') as mapboxgl.GeoJSONSource;
                  if (activeSource) {
                    let activeGeomToRender = currentTracingGeom;
                    if (!activeGeomToRender && activeChildId) {
                      const found = children.find(c => c.id === activeChildId);
                      if (found) activeGeomToRender = found.geom;
                    }

                    if (activeGeomToRender) {
                      activeSource.setData({
                        type: 'FeatureCollection',
                        features: [
                          {
                            type: 'Feature',
                            properties: { active: true },
                            geometry: activeGeomToRender
                          }
                        ]
                      });
                    } else {
                      activeSource.setData({
                        type: 'FeatureCollection',
                        features: []
                      });
                    }
                  }
                }}
              />
              
          </AssistantAside>
        )}

        {/* Panneau latéral droit pour le carreau de grille 200m sélectionné */}
        {!selectedBuilding && selectedGridCell && isGridPanelOpen && (
          <GridPanel
            gridCell={selectedGridCell}
            buildings={selectedGridBuildings}
            profiles={profiles}
            isDark={true}
            onClose={() => {
              setIsGridPanelOpen(false);
            }}
            onSelectBuilding={(b) => setSelectedBuilding(b)}
          />
        )}
      </div>

      {/* VUES ADMINISTRATIVES SATELLITES */}
      <AnimatePresence mode="wait">
          {activeAdminView === 'validations' && (
            <motion.div
              key="validations"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={"absolute inset-0 overflow-hidden bg-hx-base"}
            >
              <RevueView
                  buildings={buildings}
                  profiles={profiles}
                  onOpenOnMap={handleSelectBuildingFromAdmin}
                  onApprove={handleApproveBuilding}
                  onReject={handleRejectBuilding}
                  onRequestVisit={handleRequestVisit}
                  declarations={declarations}
                  declarationsError={attachmentError}
                  onOpenPoint={handleOpenPointOnMap}
                  onLinkDeclaration={handleLinkDeclaration}
                  onCertify={handleCertify}
                  onRefuseRequest={handleRefuseRequest}
                  onRegistryChanged={() => syncData()}
                />
            </motion.div>
          )}

          {activeAdminView === 'batiments' && (
            <motion.div
              key="batiments"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={"absolute inset-0 overflow-hidden bg-hx-base"}
            >
              <RegistreView
                  buildings={buildings}
                  profiles={profiles}
                  onOpenOnMap={handleSelectBuildingFromAdmin}
                  focusId={selectedBuilding?.id ?? null}
                  onShowMap={() => setActiveAdminView('carte')}
                  onRefresh={async () => {
                    const refreshed = await loadRealBuildings();
                    setBuildings(refreshed);
                  }}
                  onNotify={(title, message, tone) => setMapNotification({ type: (tone ?? 'info') as any, title, message })}
                />
            </motion.div>
          )}

          {activeAdminView === 'zones' && (
            <motion.div
              key="zones"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={"absolute inset-0 overflow-hidden bg-hx-base"}
            >
              <TerritoireView zones={zones} buildings={buildings} />
            </motion.div>
          )}

          {activeAdminView === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={"absolute inset-0 overflow-hidden bg-hx-base"}
            >
              <PilotageView buildings={buildings} zones={zones} validations={validations} profiles={profiles} onGoRevue={() => setActiveAdminView('validations')} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </div>

      {activityOpen && (
        <ActivityPanel
          entries={activity}
          onClear={() => {
            setActivity([]);
            setActivitySeen(0);
          }}
          onClose={() => setActivityOpen(false)}
        />
      )}
      <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          buildings={buildings}
          onSelectBuilding={handleSelectBuildingFromAdmin}
          commands={[
            ...TOOLS.map((t) => ({ id: `tool-${t.id}`, label: `Outil : ${t.label}`, hint: t.key, run: () => { setActiveAdminView('carte'); selectAtelierTool(t.id); } })),
            { id: 'go-atelier', label: 'Aller à l’Atelier', run: () => setActiveAdminView('carte') },
            { id: 'go-revue', label: 'Aller à la Revue', run: () => setActiveAdminView('validations') },
            { id: 'go-registre', label: 'Aller au Registre', run: () => setActiveAdminView('batiments') },
            { id: 'go-territoire', label: 'Aller au Territoire', run: () => setActiveAdminView('zones') },
            { id: 'go-pilotage', label: 'Aller au Pilotage', run: () => setActiveAdminView('dashboard') },
          ]}
        />

      <SettingsModal
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        accessToken={accessToken}
        setAccessToken={setAccessToken}
        onSaved={() => setMapNotification({ type: 'success', title: 'Configuration Enregistrée', message: "Le jeton d'accès public Mapbox a été mis à jour et stocké." })}
      />

      <AtelierStatusBar
          buildingsCount={buildings.length}
          zonesCount={zones.length}
          adminName={currentAdmin?.full_name ?? 'Agent'}
          zoom={activeAdminView === 'carte' ? zoomLevel : undefined}
          cursor={activeAdminView === 'carte' ? cursorPos : null}
          toolHint={activeAdminView === 'carte' && activeTool ? TOOLS.find((t) => t.id === activeTool)?.hint : undefined}
          message={statusMsg}
        />
    </div>
  );
}
