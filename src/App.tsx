/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import { 
  Navigation, 
  Search, 
  Compass, 
  Layers, 
  Check, 
  Code, 
  Clock, 
  X, 
  ChevronRight, 
  Plus, 
  CheckCircle, 
  Truck, 
  Map as MapIcon, 
  RefreshCw,
  Info,
  Sparkles,
  Undo2,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  Menu,
  ChevronLeft,
  Play,
  Pause,
  RotateCcw,
  Camera,
  Eye,
  EyeOff,
  Gauge,
  Building2,
  Home,
  LayoutDashboard,
  Settings,
  Wrench,
  Grid,
  Boxes,
  Crosshair,
  Loader2,
  Locate,
  LocateFixed,
  PenTool
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { actorId } from './lib/actor';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import ValidationsView from './components/ValidationsView';
import BuildingsView from './components/BuildingsView';
import ZonesView from './components/ZonesView';
import BuildingPanel from './components/BuildingPanel';
import GridPanel from './components/GridPanel';
import InteractiveBuildingForm from './components/InteractiveBuildingForm';
import { Building3DModal } from './components/Building3DModal';
import { Building3DDetailModal } from './components/Building3DDetailModal';
import { Edit3DMenu } from './components/Edit3DMenu';
import { Tracing3DHUD } from './components/Tracing3DHUD';
import { getHouseModelUrl } from './utils/houseModelData';
import type { RouteInfo, View, Building, Zone, Validation, Profile, BuildingType, BuildingStatus, Custom3DBuilding, HiddenBuildingData, Placed3DModel, EntrancePickerConfig } from './types';
import {
  MOCK_BUILDINGS,
  MOCK_ZONES,
  MOCK_PROFILES,
  MOCK_VALIDATIONS,
  loadRealBuildings,
  loadRealZones,
  loadRealValidations,
  loadRealProfiles,
  updateBuildingInSupabase,
  insertBuildingInSupabase,
  saveCourtyardWithBuildings,
  saveValidationInSupabase,
  saveZoneInSupabase,
  generateHailandCode,
  getCommuneAbbr,
  verifyAndReassignBuildings,
} from './lib/supabase';
import { computeDualAddressing } from './lib/administrativeAddressingService';
import { sanitizeGeometry, sanitizeObject, safeJsonStringify, safeCalculateArea } from './utils/safeJson';
import * as turf from '@turf/turf';
import { AtelierTopBar, ModuleRail, AtelierStatusBar, AtelierToolbar, TOOLS, type AtelierTool } from './shell/AtelierShell';
import { getUiVersion } from './shell/uiVersion';
import InteractiveTerritoryTree, { type SelectedTerritoryPayload } from './components/InteractiveTerritoryTree';
import {
  setupInteractiveTerritoryLayers,
  applyTerritoryHighlight,
  applyTerritoriesHighlight,
  zoomToTerritory,
  zoomToTerritories,
  setLOD3DForLevel,
  clearTerritoryHighlight,
  TERRITORY_LEVEL_COLORS
} from './lib/interactiveMapEngine';

// Valeur par défaut pour le jeton Mapbox (masquée via variable d'environnement)
const DEFAULT_MAPBOX_TOKEN = (import.meta as any).env?.VITE_MAPBOX_ACCESS_TOKEN || '';
const CUSTOM_STYLE_URL = 'mapbox://styles/hailand/cmqbiiccq000b01qr7ckjeut1';

// Point par défaut à Conakry pour la simulation de départ
const DEFAULT_SIMULATED_GPS = {
  latitude: 9.5180, // Proche Kaloum
  longitude: -13.7050
};

// Palette volumétrique 3D par type d'usage de bâtiment (Étape 3)
const BUILDING_TYPE_3D_COLORS: Record<string, string> = {
  R: '#f0eee9', // Résidentiel (Natif Mapbox 3D élégant)
  C: '#f59e0b', // Commercial (Ambre doré)
  M: '#a855f7', // Mixte (Violet)
  A: '#38bdf8', // Administratif (Cyan / Bleu ciel)
  H: '#ec4899', // Hôtel (Rose)
  P: '#10b981', // Public (Émeraude)
  T: '#64748b', // Transport / Logistique (Ardoise)
};

// ===== GÉNÉRATION DU MUR D'ENCEINTE 3D (CLÔTURE CONCESSION) =====
const createCourtyardWall3DEntities = (
  courtyardBuilding: Building,
  courtyardPolygon: GeoJSON.Polygon | GeoJSON.MultiPolygon
): Custom3DBuilding[] => {
  const wallEntities: Custom3DBuilding[] = [];
  try {
    const polyFeature = turf.feature(courtyardPolygon);
    const line: any = turf.polygonToLine(polyFeature as any);
    if (!line) return [];

    // 0.10 m de rayon = 0.20 m (20 cm) d'épaisseur totale de mur
    const buffered: any = turf.buffer(line, 0.00010, { units: 'kilometers' });
    if (!buffered || !buffered.geometry) return [];

    const wallName = `Mur d'enceinte (${courtyardBuilding.landmark_note || courtyardBuilding.hailand_code || 'Concession'})`;
    const wallColor = '#94a3b8'; // Gris ardoise du mur

    let centroidCoords: [number, number] = [0, 0];
    if (courtyardBuilding.centroid?.coordinates && Array.isArray(courtyardBuilding.centroid.coordinates)) {
      centroidCoords = [courtyardBuilding.centroid.coordinates[0], courtyardBuilding.centroid.coordinates[1]];
    } else {
      try {
        const c = turf.centroid(polyFeature as any);
        centroidCoords = [c.geometry.coordinates[0], c.geometry.coordinates[1]];
      } catch (e) {
        centroidCoords = [-13.6, 9.6];
      }
    }

    if (buffered.geometry.type === 'Polygon') {
      wallEntities.push({
        id: `3d-wall-${courtyardBuilding.id || Date.now()}`,
        name: wallName,
        floors: 1,
        height: 2.2, // 2.2 mètres standard
        base_height: 0,
        color: wallColor,
        opacity: 1.0,
        coordinates: buffered.geometry.coordinates as [number, number][][],
        centroid: centroidCoords,
        area_m2: safeCalculateArea(buffered.geometry, 30),
        created_at: new Date().toISOString()
      });
    } else if (buffered.geometry.type === 'MultiPolygon') {
      buffered.geometry.coordinates.forEach((polyCoords: any, idx: number) => {
        wallEntities.push({
          id: `3d-wall-${courtyardBuilding.id || Date.now()}-${idx}`,
          name: `${wallName} [Tronçon ${idx + 1}]`,
          floors: 1,
          height: 2.2,
          base_height: 0,
          color: wallColor,
          opacity: 1.0,
          coordinates: polyCoords as [number, number][][],
          centroid: centroidCoords,
          area_m2: safeCalculateArea({ type: 'Polygon', coordinates: polyCoords }, 30),
          created_at: new Date().toISOString()
        });
      });
    }
  } catch (err) {
    console.warn("Erreur génération mur d'enceinte 3D:", err);
  }
  return wallEntities;
};

// ===== GÉNÉRATION AUTOMATIQUE DES VOLUMES 3D DEPUIS LA LISTE DES BÂTIMENTS =====
const generate3DEntitiesFromBuildingList = (buildingsList: Building[]): Custom3DBuilding[] => {
  if (!buildingsList || buildingsList.length === 0) return [];

  const buildingsToExtrude = buildingsList.filter(b => {
    // Si c'est une concession/cour avec des bâtiments enfants, on extrude les toitures physiques des enfants
    // Sinon si c'est un bâtiment direct, on extrude son polygone direct
    const hasChildrenInList = buildingsList.some(other => other.parent_building_id === b.id);
    if (hasChildrenInList && b.has_courtyard) return false;
    return Boolean(b.geom && b.geom.coordinates && b.geom.coordinates.length > 0);
  });

  const generated3D: Custom3DBuilding[] = [];

  // 1. Extrusion des toitures et volumes des bâtiments selon leurs informations saisies
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

    // Extraction propre et validation du polygone
    let polyCoords: [number, number][][] = [];
    let rawGeom: any = b.geom;
    if (typeof rawGeom === 'string') {
      try { rawGeom = JSON.parse(rawGeom); } catch(e) {}
    }
    if (rawGeom?.type === 'MultiPolygon' && Array.isArray(rawGeom.coordinates?.[0])) {
      polyCoords = rawGeom.coordinates[0] as [number, number][][];
    } else if (Array.isArray(rawGeom?.coordinates)) {
      polyCoords = rawGeom.coordinates as [number, number][][];
    }

    if (!polyCoords || polyCoords.length === 0 || !polyCoords[0] || polyCoords[0].length < 3) {
      return;
    }

    try {
      // Assurer le bon sens des aiguilles d'une montre (Right Hand Rule) pour Mapbox GL JS 3D extrusion
      const poly = turf.polygon(polyCoords);
      const rewinded = turf.rewind(poly);
      polyCoords = (rewinded as any).geometry.coordinates as [number, number][][];
    } catch (e) {}

    const custom3DEntity: Custom3DBuilding = {
      id: `3d-auto-${b.id}`,
      name: b.hailand_code || b.landmark_note || `Bâtiment ${b.building_type} (${floorLabel})`,
      floors: physicalFloors,
      height: heightMeters,
      base_height: 0,
      color: typeColor,
      opacity: 1.0,
      coordinates: polyCoords,
      centroid: centroidCoords,
      area_m2: safeCalculateArea(b.geom, 120),
      created_at: b.created_at || new Date().toISOString()
    };

    generated3D.push(custom3DEntity);
  });

  // 2. Génération automatique du mur d'enceinte 3D (clôture 2.2m) pour les cours / concessions
  const courtyardsToEnclose = buildingsList.filter(b => {
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
      generated3D.push(...walls);
    }
  });

  return generated3D;
};

/**
 * Génère un quadrillage de 200m x 200m sous forme de polygones GeoJSON couvrant l'ensemble du territoire guinéen.
 * Implémente le SYSTÈME HAILANDCODE v3.0 — ADRESSAGE GÉOMÉTRIQUE CENTRALISÉ (ID de carreau géométrique unique -[ZONE]-).
 * Supporte le calcul à la volée basé sur le viewport actuel de la carte pour des performances optimales.
 */
const generate200mGridGeoJSON = (bounds?: { minLng: number; maxLng: number; minLat: number; maxLat: number }) => {
  const features: any[] = [];
  
  // Bornes par défaut (Conakry) si aucune borne n'est spécifiée
  let minLng = bounds ? bounds.minLng : -13.75;
  let maxLng = bounds ? bounds.maxLng : -13.50;
  let minLat = bounds ? bounds.minLat : 9.45;
  let maxLat = bounds ? bounds.maxLat : 9.65;

  // Si l'aire du viewport est trop grande, on centre la génération de la grille
  // autour de la vue pour éviter les ralentissements ou les crashs du navigateur.
  const spanLng = maxLng - minLng;
  const spanLat = maxLat - minLat;
  const maxSpan = 0.08; // Environ 8.8 km, idéal pour une grille dense, fluide et complète localement
  if (spanLng > maxSpan || spanLat > maxSpan) {
    const centerLng = (minLng + maxLng) / 2;
    const centerLat = (minLat + maxLat) / 2;
    minLng = centerLng - maxSpan / 2;
    maxLng = centerLng + maxSpan / 2;
    minLat = centerLat - maxSpan / 2;
    maxLat = centerLat + maxSpan / 2;
  }

  // Équivalences géométriques : 1 degré lat = 111111m -> 200m = 0.0018° lat
  // 1 degré lng = 111111 * cos(9.5°) = 109587m -> 200m = 0.001825° lng
  const stepLng = 0.001825;
  const stepLat = 0.0018;

  // Origine globale immuable pour le quadrillage national (Conakry initial)
  const globalMinLng = -13.75;
  const globalMinLat = 9.45;
  
  // Aligner parfaitement les indices de colonnes/rangées sur la grille globale déterministe
  const startCol = Math.floor((minLng - globalMinLng) / stepLng);
  const endCol = Math.ceil((maxLng - globalMinLng) / stepLng);
  const startRow = Math.floor((minLat - globalMinLat) / stepLat);
  const endRow = Math.ceil((maxLat - globalMinLat) / stepLat);

  for (let col = startCol; col <= endCol; col++) {
    const w = globalMinLng + col * stepLng;
    const e = w + stepLng;
    for (let row = startRow; row <= endRow; row++) {
      const s = globalMinLat + row * stepLat;
      const n = s + stepLat;
      
      // Assurer la cohérence stricte avec les maquettes d'origine
      let label = '';
      if (w <= -13.621 && -13.621 <= e && s <= 9.590 && 9.590 <= n) {
        label = 'Z014';
      } else if (w <= -13.625 && -13.625 <= e && s <= 9.592 && 9.592 <= n) {
        label = 'Z015';
      } else {
        // Formule déterministe globale pour un ID de carreau unique Zxxxx ou Z_Xcol_Yrow
        const cellNum = col * 115 + row + 1;
        let finalNum = cellNum;
        if (finalNum === 14 || finalNum === 15) {
          finalNum += 10000;
        }
        if (finalNum < 0) {
          label = `Z_X${Math.abs(col)}_Y${Math.abs(row)}`;
        } else {
          label = `Z${String(finalNum).padStart(3, '0')}`;
        }
      }
      
      features.push({
        type: 'Feature',
        properties: {
          id: label,
          col: col,
          row: row
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [w, s],
            [e, s],
            [e, n],
            [w, n],
            [w, s]
          ]]
        }
      });
    }
  }
  
  return {
    type: 'FeatureCollection' as const,
    features: features
  };
};

/**
 * Génère un UUID v4 standard pour garantir la compatibilité de type UUID dans Supabase.
 */
const generateUUID = (): string => {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    try {
      return window.crypto.randomUUID();
    } catch (e) {
      // fallback if any issue
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/**
 * Détecte de manière déterministe le carreau de 200m x 200m (l'ID unique de la ZONE)
 * à partir de coordonnées géographiques (longitude, latitude) sur tout le territoire.
 */
const detect200mZoneFromCoords = (lng: number, lat: number): string => {
  const minLng = -13.75;
  const minLat = 9.45;
  const stepLng = 0.001825;
  const stepLat = 0.0018;

  const colIdx = Math.floor((lng - minLng) / stepLng);
  const rowIdx = Math.floor((lat - minLat) / stepLat);

  const w = minLng + colIdx * stepLng;
  const e = w + stepLng;
  const s = minLat + rowIdx * stepLat;
  const n = s + stepLat;

  if (w <= -13.621 && -13.621 <= e && s <= 9.590 && 9.590 <= n) {
    return 'Z014';
  }
  if (w <= -13.625 && -13.625 <= e && s <= 9.592 && 9.592 <= n) {
    return 'Z015';
  }

  const cellNum = colIdx * 115 + rowIdx + 1;
  let finalNum = cellNum;
  if (finalNum === 14 || finalNum === 15) {
    finalNum += 10000;
  }
  if (finalNum < 0) {
    return `Z_X${Math.abs(colIdx)}_Y${Math.abs(rowIdx)}`;
  }
  return `Z${String(finalNum).padStart(3, '0')}`;
};

/**
 * Calcule la distance entre deux coordonnées géographiques en mètres (formule de Haversine).
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Rayon de la Terre en mètres
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calcule l'aire d'un polygone de coordonnées en mètres carrés (m²) de façon plane locale.
 */
function calculatePolygonArea(coordinates: [number, number][][]): number {
  if (!coordinates || coordinates.length === 0 || coordinates[0].length < 3) return 0;
  const ring = coordinates[0];
  const n = ring.length;
  if (n < 3) return 0;
  
  // Barycentre pour la projection locale plane
  let sumLng = 0;
  let sumLat = 0;
  ring.forEach(pt => {
    sumLng += pt[0];
    sumLat += pt[1];
  });
  const refLng = sumLng / n;
  const refLat = sumLat / n;
  
  const radLat = (refLat * Math.PI) / 180;
  const kx = 111320 * Math.cos(radLat); // mètres par degré de long
  const ky = 110540; // mètres par degré de lat
  
  // Formule de Shoelace
  let area = 0;
  for (let i = 0; i < n; i++) {
    const pt1 = ring[i];
    const pt2 = ring[(i + 1) % n];
    
    const x1 = (pt1[0] - refLng) * kx;
    const y1 = (pt1[1] - refLat) * ky;
    const x2 = (pt2[0] - refLng) * kx;
    const y2 = (pt2[1] - refLat) * ky;
    
    area += (x1 * y2) - (x2 * y1);
  }
  
  return Math.round(Math.abs(area / 2));
}

/**
 * Génère un polygone carré de dimension donnée autour de coordonnées géographiques (pour simulation de zone).
 */
function generateSquarePolygon(lng: number, lat: number, halfSideMeters: number = 8): { type: "Polygon"; coordinates: [number, number][][] } {
  const radLat = (lat * Math.PI) / 180;
  const deltaLat = halfSideMeters / 110540;
  const deltaLng = halfSideMeters / (111320 * Math.cos(radLat));
  
  const p1: [number, number] = [lng - deltaLng, lat - deltaLat];
  const p2: [number, number] = [lng + deltaLng, lat - deltaLat];
  const p3: [number, number] = [lng + deltaLng, lat + deltaLat];
  const p4: [number, number] = [lng - deltaLng, lat + deltaLat];
  const p5: [number, number] = [lng - deltaLng, lat - deltaLat]; // Refermer
  
  return {
    type: 'Polygon',
    coordinates: [[p1, p2, p3, p4, p5]]
  };
}

/**
 * Récupère dynamiquement tous les calques polygonaux de la carte actifs
 * pour s'assurer que chaque polygone (bâtiment, parcelle, etc.) soit cliquable / sélectionnable.
 */
function getSelectableLayers(map: mapboxgl.Map): string[] {
  try {
    const existingLayers = map.getStyle()?.layers || [];
    return existingLayers
      .filter(l => l.type === 'fill' || l.type === 'fill-extrusion')
      .map(l => l.id)
      .filter(id => 
        id !== 'selected-building-fill' &&
        id !== 'selected-building-outline' &&
        id !== 'selected-courtyard-outline' &&
        id !== 'selected-courtyard-outline-casing' &&
        id !== 'selected-building-3d' &&
        id !== 'hovered-building-fill' &&
        id !== 'hovered-building-outline' &&
        id !== 'hovered-building-3d' &&
        id !== 'draw-fill' &&
        id !== 'draw-line' &&
        id !== 'draw-line-casing' &&
        id !== 'draw-points-shadow' &&
        id !== 'draw-points' &&
        id !== 'courtyard-children-fill' &&
        id !== 'courtyard-children-outline' &&
        id !== 'courtyard-active-child-fill' &&
        id !== 'courtyard-active-child-outline'
      );
  } catch (err) {
    return [];
  }
}

/**
 * Simplification de polygone via l'algorithme classique de Douglas-Peucker
 * Réduit le bruit de crénelage de pixels pour donner un rendu géométrique propre (droites de toitures).
 */
function simplifyPolygon(points: [number, number][], tolerance: number): [number, number][] {
  if (points.length <= 4) return points;
  
  const getSqSegDist = (p: [number, number], p1: [number, number], p2: [number, number]) => {
    let x = p1[0], y = p1[1], dx = p2[0] - x, dy = p2[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = p2[0]; y = p2[1];
      } else if (t > 0) {
        x += dx * t; y += dy * t;
      }
    }
    dx = p[0] - x; dy = p[1] - y;
    return dx * dx + dy * dy;
  };

  const simplifyDPStep = (pts: [number, number][], first: number, last: number, sqTolerance: number, simplified: [number, number][]) => {
    let maxSqDist = sqTolerance, index = -1;
    for (let i = first + 1; i < last; i++) {
      const sqDist = getSqSegDist(pts[i], pts[first], pts[last]);
      if (sqDist > maxSqDist) {
        index = i;
        maxSqDist = sqDist;
      }
    }
    if (index !== -1) {
      if (index - first > 1) simplifyDPStep(pts, first, index, sqTolerance, simplified);
      simplified.push(pts[index]);
      if (last - index > 1) simplifyDPStep(pts, index, last, sqTolerance, simplified);
    }
  };

  const simplified: [number, number][] = [points[0]];
  simplifyDPStep(points, 0, points.length - 1, tolerance * tolerance, simplified);
  simplified.push(points[points.length - 1]);
  return simplified;
}

export default function App() {
  const uiV2 = getUiVersion() === 'v2'; // Atelier v2 (refonte en cours) : coque et thème seulement pour l'instant
  const [activeAdminView, setActiveAdminView] = useState<View>('carte');
  const [isAdminSidebarOpen, setIsAdminSidebarOpen] = useState(true);
  const [buildings, setBuildings] = useState<Building[]>(MOCK_BUILDINGS);
  const [zones, setZones] = useState<Zone[]>(MOCK_ZONES);
  const [validations, setValidations] = useState<Validation[]>(MOCK_VALIDATIONS);
  const [profiles, setProfiles] = useState<Profile[]>(MOCK_PROFILES);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [selectedGridCell, setSelectedGridCell] = useState<any | null>(null);
  const [selectedGridBuildings, setSelectedGridBuildings] = useState<Building[]>([]);
  const [isGridPanelOpen, setIsGridPanelOpen] = useState(false);
  const [isSatelliteOptionsCollapsed, setIsSatelliteOptionsCollapsed] = useState(true);

  // Journalisation automatique du bâtiment sélectionné
  useEffect(() => {
    if (selectedBuilding) {
      console.log("Bâtiment sélectionné :", selectedBuilding.id, selectedBuilding.hailand_code || selectedBuilding.landmark_note);
    }
  }, [selectedBuilding]);

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

  const handleCreateZone = async (zone: Zone) => {
    addApiLog('POST', `/api/zone`, zone, { status: 'Processing' });
    try {
      await saveZoneInSupabase(zone);
      setZones(prev => [...prev, zone]);
      addApiLog('POST_SUCCESS', `/api/zone`, null, {
        zone_code: zone.zone_code,
        message: 'Nouveau quadrillage de 200m géosynchronisé sur Supabase.'
      });
    } catch (err: any) {
      addApiLog('POST_ERROR', `/api/zone`, null, { message: err.message || err });
    }
  };

  const handleApproveBuilding = async (building: Building, newCode: string) => {
    addApiLog('POST', `/api/building/approve/${building.id}`, { newCode }, { status: 'Processing' });
    try {
      await updateBuildingInSupabase(building.id, {
        status: 'actif',
        hailand_code: newCode,
        is_validated: true,
        validation_count: (building.validation_count || 0) + 1,
        validated_at: new Date().toISOString()
      });
      
      const newV: Validation = {
        id: 'val-' + Math.random().toString(36).substring(2, 11),
        building_id: building.id,
        validator_id: actorId(),
        type: 'livreur_validation',
        old_geom: null,
        new_geom: null,
        comment: `Génération officielle HailandCode : ${newCode}`,
        status: 'approved',
        reviewed_by: actorId(),
        created_at: new Date().toISOString()
      };
      
      await saveValidationInSupabase({
        building_id: building.id,
        validator_id: actorId(),
        type: 'livreur_validation',
        comment: `Génération officielle HailandCode : ${newCode}`,
        status: 'approved',
        reviewed_by: actorId()
      });
      
      setBuildings(prev => prev.map(b => b.id === building.id ? {
        ...b,
        status: 'actif',
        hailand_code: newCode,
        is_validated: true,
        validation_count: (b.validation_count || 0) + 1,
        validated_at: new Date().toISOString()
      } : b));
      
      setValidations(prev => [newV, ...prev]);
      
      addApiLog('POST_SUCCESS', `/api/building/approve/${building.id}`, null, {
        hailand_code: newCode,
        status: 'actif',
        message: 'Bâtiment validé, code national actif.'
      });
    } catch (err: any) {
      addApiLog('POST_ERROR', `/api/building/approve/${building.id}`, null, { message: err.message || err });
    }
  };

  const handleRejectBuilding = async (building: Building, comment: string) => {
    addApiLog('POST', `/api/building/reject/${building.id}`, { comment }, { status: 'Processing' });
    try {
      await updateBuildingInSupabase(building.id, {
        status: 'inactif',
        rejection_reason: comment,
        is_validated: false
      });
      
      const newV: Validation = {
        id: 'val-' + Math.random().toString(36).substring(2, 11),
        building_id: building.id,
        validator_id: actorId(),
        type: 'correct_polygon',
        old_geom: null,
        new_geom: null,
        comment: `Rejet : ${comment}`,
        status: 'rejected',
        reviewed_by: actorId(),
        created_at: new Date().toISOString()
      };
      
      await saveValidationInSupabase({
        building_id: building.id,
        validator_id: actorId(),
        type: 'correct_polygon',
        comment: `Rejet : ${comment}`,
        status: 'rejected',
        reviewed_by: actorId()
      });
      
      setBuildings(prev => prev.map(b => b.id === building.id ? {
        ...b,
        status: 'inactif',
        rejection_reason: comment,
        is_validated: false
      } : b));
      
      setValidations(prev => [newV, ...prev]);
      
      addApiLog('POST_SUCCESS', `/api/building/reject/${building.id}`, null, {
        rejection_reason: comment,
        status: 'rejected'
      });
    } catch (err: any) {
      addApiLog('POST_ERROR', `/api/building/reject/${building.id}`, null, { message: err.message || err });
    }
  };

  const handleApproveAllGridBuildings = async (buildingsToApprove: Building[]) => {
    addApiLog('POST_BULK', `/api/building/approve-bulk`, { count: buildingsToApprove.length }, { status: 'Processing' });
    try {
      const approvedCodes: Record<string, string> = {};

      for (const b of buildingsToApprove) {
        const sequence = Math.floor(Math.random() * 800) + 100;
        const code = generateHailandCode(
          'CKY',
          b.commune || 'Kaloum',
          b.zone_code || 'Z014',
          b.building_type || 'M',
          sequence,
          b.floor_level || undefined,
          b.unit_code || undefined
        );
        approvedCodes[b.id] = code;

        await updateBuildingInSupabase(b.id, {
          status: 'actif',
          hailand_code: code,
          is_validated: true,
          validation_count: (b.validation_count || 0) + 1,
          validated_at: new Date().toISOString()
        });

        await saveValidationInSupabase({
          building_id: b.id,
          validator_id: actorId(),
          type: 'livreur_validation',
          comment: `Génération bulk officielle HailandCode : ${code}`,
          status: 'approved',
          reviewed_by: actorId()
        });
      }

      const approvedIds = buildingsToApprove.map(b => b.id);
      setBuildings(prev => prev.map(b => {
        if (approvedIds.includes(b.id)) {
          const code = approvedCodes[b.id];
          return {
            ...b,
            status: 'actif',
            hailand_code: code,
            is_validated: true,
            validation_count: (b.validation_count || 0) + 1,
            validated_at: new Date().toISOString()
          };
        }
        return b;
      }));

      setSelectedGridBuildings(prev => prev.map(b => {
        if (approvedIds.includes(b.id)) {
          const code = approvedCodes[b.id];
          return {
            ...b,
            status: 'actif',
            hailand_code: code,
            is_validated: true,
            validation_count: (b.validation_count || 0) + 1,
            validated_at: new Date().toISOString()
          };
        }
        return b;
      }));

      setMapNotification({
        type: 'success',
        title: 'Validation de Masse Réussie !',
        message: `${buildingsToApprove.length} bâtiments du carreau de 200m ont été approuvés avec succès.`
      });

      addApiLog('POST_BULK_SUCCESS', `/api/building/approve-bulk`, null, {
        approved_count: buildingsToApprove.length,
        message: 'Tout le quadrillage a été validé en masse.'
      });
    } catch (err: any) {
      addApiLog('POST_BULK_ERROR', `/api/building/approve-bulk`, null, { message: err.message || err });
    }
  };

  const handleModifyBuilding = async (building: Building, editForm: any) => {
    addApiLog('PATCH', `/api/building/modify/${building.id}`, editForm, { status: 'Processing' });
    try {
      await updateBuildingInSupabase(building.id, editForm);
      
      setBuildings(prev => prev.map(b => b.id === building.id ? {
        ...b,
        ...editForm,
        updated_at: new Date().toISOString()
      } : b));
      
      addApiLog('PATCH_SUCCESS', `/api/building/modify/${building.id}`, null, {
        updatedFields: Object.keys(editForm),
        message: 'Changements enregistrés avec succès.'
      });
    } catch (err: any) {
      addApiLog('PATCH_ERROR', `/api/building/modify/${building.id}`, null, { message: err.message || err });
    }
  };

  const sidebarScrollRef = useRef<HTMLDivElement | null>(null);
  
  const scrollSidebar = (direction: 'up' | 'down') => {
    if (sidebarScrollRef.current) {
      const scrollAmount = 240;
      sidebarScrollRef.current.scrollBy({
        top: direction === 'down' ? scrollAmount : -scrollAmount,
        behavior: 'smooth'
      });
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
  const buildingsRef = useRef<Building[]>(MOCK_BUILDINGS);

  useEffect(() => {
    buildingsRef.current = buildings;
  }, [buildings]);

  // Refs de suivi de livraison professionnel et cinématographie réelle
  const courierMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const entranceMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const entrancePickerConfigRef = useRef<EntrancePickerConfig | null>(null);
  const previewEntranceMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const snappedCoordsRef = useRef<{ lng: number; lat: number } | null>(null);
  const wallLineCacheRef = useRef<any>(null);
  const orbitAngleRef = useRef<number>(0);
  const gpsWatchIdRef = useRef<number | null>(null);
  const isGpsTrackingActiveRef = useRef<boolean>(false);
  const isVirtualGpsActiveRef = useRef<boolean>(true);
  const handleRealUserLocationChangeRef = useRef<any>(null);

  // États pour le dessin personnalisé de zone libre
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]);
  const childMapClickHandlerRef = useRef<((lng: number, lat: number, geom?: any, area?: number) => void) | null>(null);
  const childDrawCompleteHandlerRef = useRef<((points?: [number, number][]) => void) | null>(null);

  // ===== ÉTATS POUR LE MODE ÉDITION 3D — TRACÉ MANUEL, MASQUAGE OSM & COULEURS =====
  const [custom3DBuildings, setCustom3DBuildings] = useState<Custom3DBuilding[]>(() => {
    try {
      const saved = localStorage.getItem('hailandmap_custom_3d_buildings');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });

  // Volumes 3D combinés : Bâtiments Supabase calculés automatiquement + tracés 3D manuels locaux
  const all3DBuildings = useMemo(() => {
    const db3DEntities = generate3DEntitiesFromBuildingList(buildings);
    const manualOnly = custom3DBuildings.filter(item => !item.id.startsWith('3d-auto-') && !item.id.startsWith('3d-wall-'));
    return [...manualOnly, ...db3DEntities];
  }, [buildings, custom3DBuildings]);

  const custom3DBuildingsRef = useRef<Custom3DBuilding[]>([]);
  const [is3DDrawMode, setIs3DDrawMode] = useState(false);
  const is3DDrawModeRef = useRef<boolean>(false);
  const [drawPoints3D, setDrawPoints3D] = useState<[number, number][]>([]);
  const drawPoints3DRef = useRef<[number, number][]>([]);
  const lastMouseCoordRef = useRef<{ lng: number; lat: number; point: mapboxgl.Point } | null>(null);
  const drawRafRef = useRef<number | null>(null);
  const renderDrawRubberbandPreviewRef = useRef<((lng?: number, lat?: number, point?: mapboxgl.Point) => void) | null>(null);
  const handleFinalizeCustomDrawRef = useRef<(() => void) | null>(null);
  const [is3DConfigModalOpen, setIs3DConfigModalOpen] = useState<boolean>(false);
  const [selected3DBuilding, setSelected3DBuilding] = useState<Custom3DBuilding | null>(null);
  const [currentPitch, setCurrentPitch] = useState<number>(45);

  // ===== ÉTATS POUR LES MODÈLES 3D GLTF/GLB (house.glb) =====
  const [placed3DModels, setPlaced3DModels] = useState<Placed3DModel[]>(() => {
    try {
      const saved = localStorage.getItem('hailandmap_placed_3d_models');
      if (saved) {
        const parsed: Placed3DModel[] = JSON.parse(saved);
        return parsed.map(m => ({
          ...m,
          scale: !m.scale || m.scale < 5 ? 20.0 : m.scale
        }));
      }
    } catch (e) {}
    return [];
  });
  const placed3DModelsRef = useRef<Placed3DModel[]>([]);
  const [is3DModelPlacementActive, setIs3DModelPlacementActive] = useState<boolean>(false);
  const is3DModelPlacementActiveRef = useRef<boolean>(false);

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
    try {
      localStorage.setItem('hailandmap_custom_3d_buildings', safeJsonStringify(custom3DBuildings, 0));
    } catch (e) {}
  }, [custom3DBuildings]);

  useEffect(() => {
    is3DDrawModeRef.current = is3DDrawMode;
  }, [is3DDrawMode]);

  useEffect(() => {
    isDrawModeRef.current = isDrawMode;
  }, [isDrawMode]);

  useEffect(() => {
    placed3DModelsRef.current = placed3DModels;
    try {
      localStorage.setItem('hailandmap_placed_3d_models', safeJsonStringify(placed3DModels, 0));
    } catch (e) {}
    if (mapRef.current) {
      syncPlaced3DModelsLayer(mapRef.current, placed3DModels);
    }
  }, [placed3DModels]);

  useEffect(() => {
    is3DModelPlacementActiveRef.current = is3DModelPlacementActive;
    if (mapRef.current) {
      const canvas = mapRef.current.getCanvas();
      if (is3DModelPlacementActive) {
        canvas.style.cursor = 'crosshair';
      } else if (!is3DDrawMode && !isDrawMode) {
        canvas.style.cursor = '';
      }
    }
  }, [is3DModelPlacementActive, is3DDrawMode, isDrawMode]);

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
      addApiLog('INTERACTIVE_MAP_TOGGLE', `/map/interactive-mode/${nextState}`, null, { active: nextState });

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

      addApiLog('INTERACTIVE_MAP_TOGGLE_TERRITORY', `/map/territory/${payload.level}/${payload.id}`, {
        nom: payload.nom,
        code: payload.code,
        level: payload.level,
        action: exists ? 'removed' : 'added',
        totalActive: updated.length
      }, { status: 'Success' });

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
      addApiLog('INTERACTIVE_MAP_BATCH_TOGGLE', `/map/territories/batch/${action}`, {
        count: payloads.length,
        totalActive: updated.length
      }, { status: 'Success' });

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

  const handleRemoveSingleTerritory = useCallback((id: string) => {
    setSelectedTerritories((prev) => {
      const updated = prev.filter((t) => t.id !== id);
      if (mapRef.current) {
        if (updated.length === 0) {
          clearTerritoryHighlight(mapRef.current);
        } else {
          applyTerritoriesHighlight(mapRef.current, updated);
        }
      }
      return updated;
    });
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

  useEffect(() => {
    drawPoints3DRef.current = drawPoints3D;
  }, [drawPoints3D]);

  // Désactiver le zoom double-clic de Mapbox pendant le dessin pour permettre la fermeture rapide par double-clic
  useEffect(() => {
    if (!mapRef.current) return;
    if (isDrawMode || is3DDrawMode) {
      mapRef.current.doubleClickZoom.disable();
    } else {
      mapRef.current.doubleClickZoom.enable();
    }
  }, [isDrawMode, is3DDrawMode]);

  // États de configuration Mapbox
  const [accessToken, setAccessToken] = useState(() => {
    return localStorage.getItem('hailandmap_token') || DEFAULT_MAPBOX_TOKEN;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isConsoleCollapsed, setIsConsoleCollapsed] = useState(false);
  
  // Styles de carte disponibles
  const styles = [
    { id: 'custom', name: 'Original Perso (3D)', url: CUSTOM_STYLE_URL },
    { id: 'satellite', name: 'Image Satellite', url: 'mapbox://styles/mapbox/satellite-streets-v12' },
    { id: 'standard-3d', name: 'Standard 3D Mapbox', url: 'mapbox://styles/mapbox/streets-v12' }
  ];
  const [currentStyle, setCurrentStyle] = useState('custom');
  const hasAttemptedStyleFallbackRef = useRef(false);
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false);

  // États de l'application
  const [zoomLevel, setZoomLevel] = useState(13.5);
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

  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<Building[]>([]);

  // Position utilisateur (Réelle)
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
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
  const [clickedCoords, setClickedCoords] = useState<{ latitude: number; longitude: number; buildingId?: string | number; geometry?: any; area?: number } | null>(null);
  
  useEffect(() => {
    clickedCoordsRef.current = clickedCoords;
  }, [clickedCoords]);

  const [newOccupantName, setNewOccupantName] = useState('');
  const [newDeliveryNotes, setNewDeliveryNotes] = useState('');
  const [newBuildingType, setNewBuildingType] = useState<BuildingType>('R');
  const [newFloorLevel, setNewFloorLevel] = useState<string>('');
  const [newUnitCode, setNewUnitCode] = useState<string>('');

  // Itinéraire
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [isNavMode, setIsNavMode] = useState(false);

  // Système de suivi d'itinéraire professionnel réel (Live GPS ou Clics d'Émulation)
  const [isGpsTrackingActive, setIsGpsTrackingActive] = useState(false);
  const [trackingCameraMode, setTrackingCameraMode] = useState<'chase' | 'orbit' | 'overhead' | 'free'>('chase');
  const [trackingStatus, setTrackingStatus] = useState<'idle' | 'running' | 'arrived'>('idle');
  const [isVirtualGpsActive, setIsVirtualGpsActive] = useState(true); // Aide au test par clics de souris sur carte sur PC
  
  // Télémétrie en temps réel
  const [telemetrySpeed, setTelemetrySpeed] = useState(0); 
  const [telemetryDistanceLeft, setTelemetryDistanceLeft] = useState(0); 
  const [telemetryTimeLeft, setTelemetryTimeLeft] = useState(0); 
  const [activeGuidanceText, setActiveGuidanceText] = useState("Prêt à démarrer le guidage professionnel.");
  const [guidanceList, setGuidanceList] = useState<string[]>([]);

  // Logs API pour l'aspect de développeur expert Full-Stack
  const [apiLogs, setApiLogs] = useState<{ timestamp: string; method: string; url: string; body?: any; response?: any }[]>([]);

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

  useEffect(() => {
    localStorage.setItem('hailandmap_token', accessToken);
  }, [accessToken]);

  // Ajouter un log API
  const addApiLog = (method: string, url: string, body?: any, response?: any) => {
    const newLog = {
      timestamp: new Date().toLocaleTimeString(),
      method,
      url,
      body: body ? sanitizeObject(body) : undefined,
      response: response ? sanitizeObject(response) : undefined
    };
    setApiLogs(prev => [newLog, ...prev].slice(0, 5));
  };

  // Synchronisation en ligne avec Supabase (avec replis offline-first)
  useEffect(() => {
    async function syncData() {
      addApiLog('GET', '/supabase/init-sync', null, { message: "Connexion et synchronisation en cours..." });
      try {
        const [realB, realZ, realV, realP] = await Promise.all([
          loadRealBuildings(),
          loadRealZones(),
          loadRealValidations(),
          loadRealProfiles(),
        ]);

        // Contrôle spatial automatique des bâtiments (Turf.js) au chargement des données
        // afin de corriger les incohérences de Ratoma et des autres communes
        try {
          const reassignRep = await verifyAndReassignBuildings({ buildings: realB });
          if (reassignRep && reassignRep.reassignedCount > 0) {
            console.log(`[Init:Spatial] 🎯 ${reassignRep.reassignedCount} bâtiment(s) réassigné(s) à leur commune légitime au démarrage.`);
          }
        } catch (e: any) {
          console.warn('[Init:Spatial] Contrôle spatial non-bloquant:', e?.message || e);
        }
        
        // Assurer l'unicité stricte de chaque ID de bâtiment pour React
        const seenBuildingIds = new Set<string>();
        const sanitizedBuildings = realB.map((b, idx) => {
          let cleanId = b.id;
          if (!cleanId || cleanId === "Tracé Personnalisé" || seenBuildingIds.has(cleanId)) {
            cleanId = `b-${b.hailand_code || 'item'}-${idx}-${Date.now()}`;
          }
          seenBuildingIds.add(cleanId);
          return { ...b, id: cleanId };
        });

        setBuildings(sanitizedBuildings);
        setZones(realZ);
        setValidations(realV);
        setProfiles(realP);
        
        addApiLog('SYNC_SUCCESS', '/supabase/synced', null, {
          buildings: realB.length,
          zones: realZ.length,
          validations: realV.length,
          profiles: realP.length,
          status: "Écosystème National Synchrone"
        });
      } catch (err: any) {
        addApiLog('SYNC_ERROR', '/supabase/fallback', null, {
          message: "Mode local activé pour Kipé / Ratoma",
          details: err.message || err
        });
      }
    }
    syncData();
  }, []);

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
        preserveDrawingBuffer: true,
        transformRequest: (url: string, resourceType: string) => {
          if (url && (url.includes('house.glb') || resourceType === 'Model')) {
            return { url: getHouseModelUrl() };
          }
          return { url };
        }
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
                errMsg.includes('house-model') ||
                errMsg.includes('house.glb')
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
          errMsg.includes('house-model') ||
          errMsg.includes('house.glb')
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

      map.on('load', () => {
        // Logique 3D et stylisation haute fidélité si Standard ou Custom
        const layers = map.getStyle()?.layers;
        if (layers) {
          // Si on utilise Streets, on ajoute une couche 3D des bâtiments si elle n'existe pas (sauf pour le style satellite)
          const has3D = layers.some(l => l.id === '3d-buildings');
          if (currentStyle !== 'satellite' && !has3D && map.getSource('composite')) {
            map.addLayer(
              {
                'id': '3d-buildings',
                'source': 'composite',
                'source-layer': 'building',
                'filter': ['==', 'extrude', 'true'],
                'type': 'fill-extrusion',
                'minzoom': 14,
                'paint': {
                  'fill-extrusion-color': '#f0eee9',
                  // Utilise une transition fluide pour l'extrusion 3D
                  'fill-extrusion-height': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    14,
                    0,
                    14.05,
                    ['get', 'height']
                  ],
                  'fill-extrusion-base': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    14,
                    0,
                    14.05,
                    ['get', 'min_height']
                  ],
                  'fill-extrusion-opacity': 1.0,
                  'fill-extrusion-vertical-gradient': true
                }
              },
              // Insérer sous les labels de rue si possible
              layers.find(l => l.type === 'symbol' && l.layout?.['text-field'])?.id
            );
          } else if (currentStyle === 'satellite' && map.getSource('composite')) {
            // Pour la vue satellite, on ajoute une couche de bâtiments invisible au sol (fill)
            // afin que queryRenderedFeatures puisse l'interroger et de cette manière détecter mathématiquement les contours
            // pré-existants exactement au même endroit que sous la vue 3D !
            map.addLayer(
              {
                'id': '3d-buildings-invisible',
                'source': 'composite',
                'source-layer': 'building',
                'type': 'fill',
                'minzoom': 13,
                'paint': {
                  'fill-color': '#000000',
                  'fill-opacity': 0.001 // Complètement invisible à l'œil pour préserver l'esthétique satellite pure, mais interrogeable géospatialement !
                }
              },
              layers.find(l => l.type === 'symbol' && l.layout?.['text-field'])?.id
            );
          }
        }

        // Ajouter la source et la couche de la grille de 200m pour la vue satellite
        map.addSource('grid-200m', {
          type: 'geojson',
          data: generate200mGridGeoJSON()
        });

        // Couche de casing sombre pour la grille (halo de contraste de ligne)
        map.addLayer({
          id: 'grid-200m-line-casing',
          type: 'line',
          source: 'grid-200m',
          layout: {
            visibility: (currentStyle === 'satellite' && is200mGridActive) ? 'visible' : 'none'
          },
          paint: {
            'line-color': '#000000', // Noir de contraste
            'line-width': 2.5,
            'line-opacity': 0.65
          }
        });

        // Couche de lignes pour la grille (cyan phosphorescente)
        map.addLayer({
          id: 'grid-200m-line',
          type: 'line',
          source: 'grid-200m',
          layout: {
            visibility: (currentStyle === 'satellite' && is200mGridActive) ? 'visible' : 'none'
          },
          paint: {
            'line-color': '#06b6d4', // Cyan technologique et élégant
            'line-width': 1.2,
            'line-opacity': 0.85
          }
        });

        // Couche de labels pour afficher l'identifiant de chaque case de 200m
        map.addLayer({
          id: 'grid-200m-label',
          type: 'symbol',
          source: 'grid-200m',
          layout: {
            visibility: (currentStyle === 'satellite' && is200mGridActive) ? 'visible' : 'none',
            'text-field': ['get', 'id'],
            'text-size': 9,
            'text-offset': [0, 0],
            'text-allow-overlap': false
          },
          paint: {
            'text-color': '#06b6d4',
            'text-opacity': 0.6,
            'text-halo-color': '#0f172a',
            'text-halo-width': 1.5
          }
        });

        // Ajouter une source vide pour l'itinéraire
        map.addSource('route', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });

        // Ajouter la couche pour le tracé de la route en bleu
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#2563eb', // Bleu d'itinéraire éclatant
            'line-width': 6,
            'line-opacity': 0.85
          }
        });

        // Ajouter une couche de pulsation sous la ligne d'itinéraire
        map.addLayer({
          id: 'route-line-glow',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#60a5fa',
            'line-width': 12,
            'line-opacity': 0.35,
            'line-blur': 4
          }
        }, 'route-line');

        // Ajouter la source pour la zone / polygone de bâtiment sélectionné
        map.addSource('selected-building', {
          type: 'geojson',
          data: {
            type: 'Feature' as const,
            properties: {},
            geometry: {
              type: 'GeometryCollection' as const,
              geometries: []
            }
          }
        });

        const building3DBeforeId = map.getLayer('3d-buildings') ? '3d-buildings' : undefined;

        // Couche de remplissage au sol :
        // Pour les cours/concessions : AUCUNE COULEUR DE FOND (opacité 0) pour visibilité satellite totale
        // Pour les bâtiments uniques : remplissage orange translucide (opacité 0.35)
        map.addLayer({
          id: 'selected-building-fill',
          type: 'fill',
          source: 'selected-building',
          paint: {
            'fill-color': '#f97316',
            'fill-opacity': [
              'case',
              ['boolean', ['get', 'is_courtyard'], false],
              0,
              0.35
            ]
          }
        }, building3DBeforeId);

        // Ombre/casing de contraste sous la délimitation en pointillés de la cour
        map.addLayer({
          id: 'selected-courtyard-outline-casing',
          type: 'line',
          source: 'selected-building',
          filter: ['==', ['get', 'is_courtyard'], true],
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#0f172a',
            'line-width': 4.5,
            'line-opacity': 0.75,
            'line-dasharray': [3, 2]
          }
        }, building3DBeforeId);

        // Délimitation en pointillés orange pour les cours / concessions
        map.addLayer({
          id: 'selected-courtyard-outline',
          type: 'line',
          source: 'selected-building',
          filter: ['==', ['get', 'is_courtyard'], true],
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#f97316',
            'line-width': 2.8,
            'line-dasharray': [3, 2]
          }
        }, building3DBeforeId);

        // Contour orange vif continu uniquement pour les bâtiments uniques
        map.addLayer({
          id: 'selected-building-outline',
          type: 'line',
          source: 'selected-building',
          filter: ['!=', ['get', 'is_courtyard'], true],
          paint: {
            'line-color': '#f97316',
            'line-width': 3
          }
        }, building3DBeforeId);

        // Ajouter la source pour la zone de survol/pré-sélection de bâtiment
        map.addSource('hovered-building', {
          type: 'geojson',
          data: {
            type: 'Feature' as const,
            properties: {},
            geometry: {
              type: 'GeometryCollection' as const,
              geometries: []
            }
          }
        });

        // Ajouter la couche de remplissage du survol (placée sous les bâtiments 3D)
        map.addLayer({
          id: 'hovered-building-fill',
          type: 'fill',
          source: 'hovered-building',
          paint: {
            'fill-color': '#fdba74',
            'fill-opacity': 0.45
          }
        }, building3DBeforeId);

        // Ajouter la couche de contour du survol (placée sous les bâtiments 3D)
        map.addLayer({
          id: 'hovered-building-outline',
          type: 'line',
          source: 'hovered-building',
          paint: {
            'line-color': '#fb923c',
            'line-width': 2.5
          }
        }, building3DBeforeId);

        // Ajouter la source pour l'atelier de dessin manuel de polygone
        map.addSource('draw-source', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection' as const,
            features: []
          }
        });

        // 1. Remplissage de la zone dessinée en cours de tracé (effet élastique translucide OSM iD areas.js)
        map.addLayer({
          id: 'draw-fill',
          type: 'fill',
          source: 'draw-source',
          paint: {
            'fill-color': '#ffffff',
            'fill-opacity': 0.24
          }
        }, building3DBeforeId);

        // 2. Ligne de contour ultra-fine et discrète (style OpenStreetMap iD editor lines.js - casing)
        map.addLayer({
          id: 'draw-line-casing',
          type: 'line',
          source: 'draw-source',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#000000',
            'line-width': 2.2,
            'line-opacity': 0.18
          }
        });

        // 3. Ligne blanche fine continue (1.2px, élégante et pixel-perfect comme sur OSM iD lines.js - stroke)
        map.addLayer({
          id: 'draw-line',
          type: 'line',
          source: 'draw-source',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#ffffff',
            'line-width': 1.2,
            'line-opacity': 1.0
          }
        });

        // 4. Ombre douce diffuse des sommets (correspondant exactement à <circle class="shadow"> de vertices.js OSM iD)
        map.addLayer({
          id: 'draw-points-shadow',
          type: 'circle',
          source: 'draw-source',
          filter: ['==', '$type', 'Point'],
          paint: {
            'circle-radius': [
              'case',
              ['boolean', ['get', 'isClosingTarget'], false],
              7.0,
              5.5
            ],
            'circle-color': '#000000',
            'circle-opacity': 0.22,
            'circle-blur': 0.8
          }
        });

        // 5. Sommet blanc pur net (correspondant exactement à <circle class="stroke"> de vertices.js OSM iD)
        map.addLayer({
          id: 'draw-points',
          type: 'circle',
          source: 'draw-source',
          filter: ['==', '$type', 'Point'],
          paint: {
            'circle-radius': [
              'case',
              ['boolean', ['get', 'isClosingTarget'], false],
              4.2,
              2.8
            ],
            'circle-color': '#ffffff',
            'circle-stroke-color': [
              'case',
              ['boolean', ['get', 'isClosingTarget'], false],
              '#38bdf8',
              'rgba(0, 0, 0, 0.20)'
            ],
            'circle-stroke-width': [
              'case',
              ['boolean', ['get', 'isClosingTarget'], false],
              1.5,
              0.5
            ],
            'circle-opacity': 1.0
          }
        });

        // Source et couches dédiées pour l'enceinte mère de la cour (DASHED OUTLINE, SANS FOND ORANGE)
        // Reste affichée avec ses pointillés pendant TOUT le processus jusqu'à la validation
        map.addSource('courtyard-mother-perimeter', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });

        // Fond transparent (aucune couleur de fond orange)
        map.addLayer({
          id: 'courtyard-mother-fill',
          type: 'fill',
          source: 'courtyard-mother-perimeter',
          paint: {
            'fill-opacity': 0
          }
        }, building3DBeforeId);

        // Ligne de contour pointillée sombre (casing pour visibilité satellite parfaite)
        map.addLayer({
          id: 'courtyard-mother-outline-casing',
          type: 'line',
          source: 'courtyard-mother-perimeter',
          paint: {
            'line-color': '#020617',
            'line-width': 4.5,
            'line-dasharray': [3, 2]
          }
        }, building3DBeforeId);

        // Ligne de contour pointillée orange haute visibilité
        map.addLayer({
          id: 'courtyard-mother-outline',
          type: 'line',
          source: 'courtyard-mother-perimeter',
          paint: {
            'line-color': '#f97316',
            'line-width': 2.8,
            'line-dasharray': [3, 2]
          }
        }, building3DBeforeId);

        // Source pour les bâtiments enfants de la cour
        map.addSource('courtyard-children', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });

        // Remplissage BLEU pour les bâtiments à l'intérieur de la cour (comme avant)
        map.addLayer({
          id: 'courtyard-children-fill',
          type: 'fill',
          source: 'courtyard-children',
          paint: {
            'fill-color': '#2563eb',
            'fill-opacity': 0.5
          }
        }, building3DBeforeId);

        // Contour BLEU continu pour les bâtiments à l'intérieur de la cour (comme avant)
        map.addLayer({
          id: 'courtyard-children-outline',
          type: 'line',
          source: 'courtyard-children',
          paint: {
            'line-color': '#60a5fa',
            'line-width': 2.5
          }
        }, building3DBeforeId);

        // Source pour le bâtiment enfant actif en cours d'édition ou de tracé
        map.addSource('courtyard-active-child', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });

        // Remplissage azur pour l'enfant actif en cours de tracé
        map.addLayer({
          id: 'courtyard-active-child-fill',
          type: 'fill',
          source: 'courtyard-active-child',
          paint: {
            'fill-color': '#0284c7',
            'fill-opacity': 0.6
          }
        }, building3DBeforeId);

        // Contour azur vif pour l'enfant actif en cours de tracé
        map.addLayer({
          id: 'courtyard-active-child-outline',
          type: 'line',
          source: 'courtyard-active-child',
          paint: {
            'line-color': '#38bdf8',
            'line-width': 3.2
          }
        }, building3DBeforeId);

        // Source et couches de surbrillance pour les bâtiments OSM détectés dans la zone/cour
        map.addSource('osm-detected-in-zone', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });

        map.addLayer({
          id: 'osm-detected-in-zone-fill',
          type: 'fill',
          source: 'osm-detected-in-zone',
          layout: {
            visibility: currentStyle === 'satellite' ? 'none' : 'visible'
          },
          paint: {
            'fill-color': '#f59e0b', // Jaune/ambre chaud
            'fill-opacity': 0.65
          }
        }, building3DBeforeId);

        map.addLayer({
          id: 'osm-detected-in-zone-outline',
          type: 'line',
          source: 'osm-detected-in-zone',
          layout: {
            visibility: currentStyle === 'satellite' ? 'none' : 'visible'
          },
          paint: {
            'line-color': '#fde047',
            'line-width': 3,
            'line-dasharray': [2, 1]
          }
        }, building3DBeforeId);

        // Restaurer les bâtiments OSM détectés dans la zone s'ils existent
        if (detectedOsmFeaturesRef.current && detectedOsmFeaturesRef.current.length > 0) {
          const detectedSource = map.getSource('osm-detected-in-zone') as mapboxgl.GeoJSONSource;
          if (detectedSource) {
            detectedSource.setData({
              type: 'FeatureCollection',
              features: detectedOsmFeaturesRef.current
            });
          }
        }

        // Restaurer la sélection de polygone active et son marqueur orange en cas de recréation de la carte
        if (clickedCoordsRef.current && clickedCoordsRef.current.geometry) {
          const isCourtyard = selectionTargetNatureRef.current === 'courtyard' || Boolean(selectedBuildingRef.current?.has_courtyard);
          const selectionSource = map.getSource('selected-building') as mapboxgl.GeoJSONSource;
          if (selectionSource) {
            selectionSource.setData({
              type: 'Feature',
              properties: {
                is_courtyard: isCourtyard
              },
              geometry: clickedCoordsRef.current.geometry
            });
          }

          if (!isCourtyard) {
            // Déplacer/Créer le marqueur de maison orange au bon endroit uniquement pour les bâtiments uniques
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

            const clng = clickedCoordsRef.current.longitude;
            const clat = clickedCoordsRef.current.latitude;
            if (typeof clng === 'number' && typeof clat === 'number' && !isNaN(clng) && !isNaN(clat)) {
              const marker = new mapboxgl.Marker({ element: el })
                .setLngLat([clng, clat])
                .addTo(map);
              markerRef.current = marker;
            }
          }
        }

        // Source pour le masquage volumétrique 3D (sans plan 2D opaque pour éviter toute superposition au sol)
        if (!map.getSource('hidden-polygons-mask')) {
          map.addSource('hidden-polygons-mask', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: []
            }
          });

          // Couche de découpe volumétrique 3D (clip layer pour Mapbox Standard / modèles 3D)
          try {
            map.addLayer({
              id: 'hidden-polygons-clip-3d',
              type: 'clip',
              source: 'hidden-polygons-mask',
              layout: {
                'clip-layer-types': ['symbol', 'model']
              }
            });
          } catch (clipErr) {
            // Ignoré si le style ne supporte pas le type clip
          }
        }

        // Charger les bâtiments 3D personnalisés tracés manuellement (fill-extrusion)
        syncCustom3DBuildingsLayer(map, custom3DBuildingsRef.current);

        // Déclarer et synchroniser les modèles 3D natifs Mapbox (house.glb)
        syncPlaced3DModelsLayer(map, placed3DModelsRef.current);

        // Appliquer les filtres de bâtiments/polygones masqués
        applyHiddenBuildingsFilter(map, hiddenBuildingsListRef.current);

        // Initialiser les couches de découpage territorial interactif de Guinée
        setupInteractiveTerritoryLayers(map);
        if (selectedTerritoriesRef.current.length > 0) {
          applyTerritoriesHighlight(map, selectedTerritoriesRef.current);
        }

        // Log de démarrage
        addApiLog('GET', `/api/v1/buildings`, null, { count: buildings.length, status: "Ready" });
      });

      // Événement clic sur la carte
      map.on('click', (e) => {
        // SI MODE GPS RÉEL ACTIF & EMULATION ACTIVE : Le clic sur la carte déplace la position GPS de l'utilisateur !
        if (isGpsTrackingActiveRef.current && isVirtualGpsActiveRef.current) {
          const { lng, lat } = e.lngLat;
          addApiLog('GPS_VIRTUAL_UPDATE_CLICK', `/api/v1/tracking/gps-virtual-move`, { lat, lng }, { status: 'Success' });
          if (handleRealUserLocationChangeRef.current) {
            handleRealUserLocationChangeRef.current(lat, lng, null, null);
          }
          return;
        }

        const { lng, lat } = e.lngLat;

        // MODE PLACEMENT D'OBJET 3D GLTF/GLB (house.glb) ACTIVÉ :
        if (is3DModelPlacementActiveRef.current) {
          console.log("[Mapbox Native 3D] Modèle house.glb placé aux coordonnées :", { lng, lat });
          addApiLog('PLACE_3D_MODEL', `/map/3d-models/place`, { lng, lat, model: 'house.glb' }, { status: 'Success' });

          const newModel: Placed3DModel = {
            id: `gltf-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            name: `Maison 3D (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
            modelUrl: getHouseModelUrl(),
            lng,
            lat,
            altitude: 0,
            scale: 20.0, // Échelle conforme à l'échelle moyenne des polygones 3D de la carte (~20 mètres)
            rotation: 0,
            created_at: new Date().toISOString()
          };

          setPlaced3DModels(prev => {
            const updated = [newModel, ...prev];
            try {
              localStorage.setItem('hailandmap_placed_3d_models', safeJsonStringify(updated, 0));
            } catch (err) {}
            syncPlaced3DModelsLayer(map, updated);
            return updated;
          });

          setIs3DModelPlacementActive(false);

          // Inclinaison douce de la caméra si elle est plate pour admirer le modèle 3D
          if (map.getPitch() < 25) {
            map.easeTo({ pitch: 50, duration: 800 });
            setCurrentPitch(50);
          }

          setMapNotification({
            type: 'success',
            title: 'Objet 3D Placé',
            message: 'Objet 3D (house.glb) placé avec succès !'
          });
          return;
        }

        // MODE SÉLECTION D'ENTRÉE / PORTAIL DE COUR (AVEC AIMANTATION STRICTE AU MUR) :
        if (entrancePickerConfigRef.current && entrancePickerConfigRef.current.active) {
          const picker = entrancePickerConfigRef.current;
          let chosenPoint: { lng: number; lat: number } | null = null;

          if (picker.type === 'courtyard' && picker.wallGeometry) {
            try {
              const wallLine = turf.polygonToLine(picker.wallGeometry);
              const clickPt = turf.point([lng, lat]);
              const nearest = turf.nearestPointOnLine(wallLine as any, clickPt);
              chosenPoint = {
                lng: Number(nearest.geometry.coordinates[0].toFixed(6)),
                lat: Number(nearest.geometry.coordinates[1].toFixed(6))
              };
            } catch (err) {
              console.warn("Erreur projection clic sur mur de cour:", err);
              chosenPoint = snappedCoordsRef.current || { lng: Number(lng.toFixed(6)), lat: Number(lat.toFixed(6)) };
            }
          } else {
            chosenPoint = { lng: Number(lng.toFixed(6)), lat: Number(lat.toFixed(6)) };
          }

          if (chosenPoint) {
            picker.onPicked(chosenPoint);
          }

          // Libérer le curseur et le mode
          entrancePickerConfigRef.current = null;
          snappedCoordsRef.current = null;
          if (previewEntranceMarkerRef.current) {
            previewEntranceMarkerRef.current.remove();
            previewEntranceMarkerRef.current = null;
          }
          map.getCanvas().style.cursor = '';
          return;
        }

        // MODE TRACÉ DE BÂTIMENT 3D MANUEL ACTIVÉ :
        if (is3DDrawModeRef.current) {
          const currentPts = drawPoints3DRef.current;
          if (currentPts.length >= 3) {
            try {
              const p0Screen = map.project(currentPts[0]);
              const distPx = Math.hypot(p0Screen.x - e.point.x, p0Screen.y - e.point.y);
              if (distPx < 20) {
                setIs3DConfigModalOpen(true);
                return;
              }
            } catch (err) {}
          }
          setDrawPoints3D(prev => {
            const next = [...prev, [lng, lat]];
            addApiLog('DRAW_3D_POINT_ADD', `/map/draw-3d`, { lng, lat }, { total_points: next.length });
            return next;
          });
          return;
        }

        // MODE DESSIN MANUEL ACTIVÉ (Prioritaire pour éviter tout blocage par isSelectionMode) :
        if (isDrawModeRef.current) {
          const currentPts = drawPointsRef.current;
          if (currentPts.length >= 3) {
            try {
              const p0Screen = map.project(currentPts[0]);
              const distPx = Math.hypot(p0Screen.x - e.point.x, p0Screen.y - e.point.y);
              if (distPx < 20) {
                if (childDrawCompleteHandlerRef.current) {
                  childDrawCompleteHandlerRef.current(currentPts);
                  return;
                }
                handleFinalizeCustomDrawRef.current?.();
                return;
              }
            } catch (err) {}
          }
          setDrawPoints(prev => {
            const next = [...prev, [lng, lat]];
            addApiLog('DRAW_POINT_ADD', `/map/draw`, { lng, lat }, { total_points: next.length });
            return next;
          });
          return;
        }

        // Lire la valeur temps réel de la ref pour éviter le stale closure pattern
        const isSelMode = isSelectionModeRef.current;
        if (!isSelMode) {
          addApiLog('EVENT_CLICK', `/map/ignored`, { lat: e.lngLat.lat, lng: e.lngLat.lng }, { message: "Clic ignoré car le mode sélection n'est pas actif." });
          return;
        }

        // SI TRACÉ DE BÂTIMENT ENFANT ACTIF EN MODE CLIC INTELLIGENT :
        if (childMapClickHandlerRef.current) {
          let detectedGeom: any = null;
          let detectedArea: number = 80;

          try {
            const clickBox: [mapboxgl.PointLike, mapboxgl.PointLike] = [
              [e.point.x - 8, e.point.y - 8],
              [e.point.x + 8, e.point.y + 8]
            ];
            const features = map.queryRenderedFeatures(clickBox);
            const buildingFeature = features.find(f => {
              const layerId = f.layer?.id || '';
              return (
                !layerId.includes('selected-building') &&
                !layerId.includes('courtyard') &&
                !layerId.includes('grid-200m') &&
                f.geometry &&
                (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
              );
            });

            if (buildingFeature && buildingFeature.geometry) {
              detectedGeom = sanitizeGeometry(buildingFeature.geometry);
              detectedArea = safeCalculateArea(detectedGeom, 80);
            }
          } catch (err) {}

          if (!detectedGeom) {
            detectedGeom = sanitizeGeometry(generateSquarePolygon(lng, lat, 4.5));
            detectedArea = safeCalculateArea(detectedGeom, 80);
          }

          // Mettre à jour la couche d'enfant actif en direct
          try {
            const actSrc = map.getSource('courtyard-active-child') as mapboxgl.GeoJSONSource;
            if (actSrc) {
              actSrc.setData({
                type: 'FeatureCollection',
                features: [{
                  type: 'Feature',
                  properties: { active: true },
                  geometry: detectedGeom
                }]
              });
            }
          } catch (err) {}

          childMapClickHandlerRef.current(lng, lat, detectedGeom, detectedArea);

          addApiLog('COURTYARD_CHILD_MAP_CLICK', `/map/courtyard/child-click`, { lng, lat }, { 
            detectedArea, 
            status: 'Captured' 
          });
          return;
        }
        
        // MODE SÉLECTION STANDARD :
        // SI LA GRILLE 200M EST ACTIVE EN SATELLITE ET LE MODE DE CIBLAGE EST "GRID_CELL", ON SÉLECTIONNE TOUT LE CARREAU ET SES POLYGONES EN MÊME TEMPS
        if (is200mGridActiveRef.current && currentStyle === 'satellite' && clickSelectionTargetRef.current === 'grid_cell') {
          const gridGeoJSON = generate200mGridGeoJSON({
            minLng: lng - 0.01,
            maxLng: lng + 0.01,
            minLat: lat - 0.01,
            maxLat: lat + 0.01
          });
          const clickedPoint = turf.point([lng, lat]);
          const clickedCell = gridGeoJSON.features.find((f: any) => turf.booleanPointInPolygon(clickedPoint, f));

          if (clickedCell) {
            const cellId = clickedCell.properties.id;
            
            // Trouver tous les bâtiments existants dans ce carreau (via la ref fraîche)
            const buildingsInCell = buildingsRef.current.filter((b: Building) => {
              if (b.zone_code === cellId) return true;
              if (b.centroid && Array.isArray(b.centroid.coordinates) && b.centroid.coordinates.length >= 2) {
                try {
                  const pt = turf.point([b.centroid.coordinates[0], b.centroid.coordinates[1]]);
                  return turf.booleanPointInPolygon(pt, clickedCell);
                } catch {
                  return false;
                }
              }
              return false;
            });

            // Récupérer toutes les géométries de bâtiments à surligner
            const allGeometries: any[] = [clickedCell.geometry]; // Inclure la bordure du carreau

            buildingsInCell.forEach((b: Building) => {
              if (b.geom) {
                allGeometries.push(b.geom);
              }
            });

            // Interroger Mapbox pour de nouveaux polygones de toiture non enregistrés
            try {
              const bounds = new mapboxgl.LngLatBounds();
              clickedCell.geometry.coordinates[0].forEach((coord: [number, number]) => {
                bounds.extend(coord);
              });
              const swScreen = map.project(bounds.getSouthWest());
              const neScreen = map.project(bounds.getNorthEast());
              
              const minX = Math.min(swScreen.x, neScreen.x);
              const maxX = Math.max(swScreen.x, neScreen.x);
              const minY = Math.min(swScreen.y, neScreen.y);
              const maxY = Math.max(swScreen.y, neScreen.y);

              const clickBox: [mapboxgl.PointLike, mapboxgl.PointLike] = [
                [minX, minY],
                [maxX, maxY]
              ];
              
              const allFeatures = map.queryRenderedFeatures(clickBox);
              const mapboxBuildings = allFeatures.filter(f => {
                const layerId = f.layer?.id || '';
                return (
                  layerId !== 'selected-building-fill' &&
                  layerId !== 'selected-building-outline' &&
                  layerId !== 'selected-courtyard-outline' &&
                  layerId !== 'selected-courtyard-outline-casing' &&
                  layerId !== 'selected-building-3d' &&
                  layerId !== 'hovered-building-fill' &&
                  layerId !== 'hovered-building-outline' &&
                  layerId !== 'hovered-building-3d' &&
                  layerId !== 'grid-200m-line' &&
                  layerId !== 'grid-200m-line-casing' &&
                  layerId !== 'grid-200m-label' &&
                  f.geometry &&
                  (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
                );
              });

              mapboxBuildings.forEach(f => {
                if (f.geometry) {
                  try {
                    let isInside = false;
                    if (f.geometry.type === 'Polygon') {
                      const firstCoord = f.geometry.coordinates[0][0];
                      if (firstCoord) {
                        isInside = turf.booleanPointInPolygon(turf.point(firstCoord), clickedCell);
                      }
                    } else if (f.geometry.type === 'MultiPolygon') {
                      const firstCoord = f.geometry.coordinates[0][0][0];
                      if (firstCoord) {
                        isInside = turf.booleanPointInPolygon(turf.point(firstCoord), clickedCell);
                      }
                    }
                    
                    if (isInside) {
                      allGeometries.push(f.geometry);
                    }
                  } catch (err) {}
                }
              });
            } catch (err) {
              console.warn("Failed to query Mapbox features for grid cell:", err);
            }

            // Mettre à jour l'état de l'Atelier
            setSelectedGridCell(clickedCell);
            setSelectedGridBuildings(buildingsInCell);
            setIsGridPanelOpen(false);
            setSelectedBuilding(null); 
            setClickedCoords(null); 

            // Mettre à jour la source d'affichage orange de Mapbox avec tous ces polygones d'un coup !
            const selectionSource = map.getSource('selected-building') as mapboxgl.GeoJSONSource;
            if (selectionSource) {
              selectionSource.setData({
                type: 'FeatureCollection',
                features: allGeometries.map((geom, index) => ({
                  type: 'Feature',
                  properties: { id: index },
                  geometry: geom
                }))
              });
            }

            // Ajouter/Déplacer le marqueur orange sur le centre de la case 200m
            const cellCentroid = turf.centroid(clickedCell);
            const [cellLng, cellLat] = cellCentroid.geometry.coordinates;

            if (markerRef.current) {
              markerRef.current.setLngLat([cellLng, cellLat]);
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
                .setLngLat([cellLng, cellLat])
                .addTo(map);
              markerRef.current = marker;
            }

            // Zoomer légèrement et centrer de manière fluide
            try {
              map.easeTo({
                center: [cellLng, cellLat],
                zoom: 17,
                duration: 500
              });
            } catch (e) {
              console.warn("easeTo failed:", e);
            }

            // Notification pour l'utilisateur
            setMapNotification({
              type: 'success',
              title: `Carreau ${cellId} Sélectionné`,
              message: `Sélection simultanée de tous les polygones (${buildingsInCell.length} enregistrés, ${allGeometries.length - buildingsInCell.length - 1} détectés) à l'intérieur du carreau de 200m.`
            });

            // Logger l'événement pour notre console
            addApiLog('GRID_CELL_SELECT', `/map/satellite/grid-200m/select`, { cellId, lat, lng }, { 
              buildingsCount: buildingsInCell.length,
              totalPolygonsHighlighted: allGeometries.length
            });

            return;
          }
        }

        // ===== INTERCEPTION ET SÉLECTION DES BÂTIMENTS 3D (NATIFS OSM, STYLE PERSO 3D ET CRÉÉS) =====
        const isCandidate3DBuilding = (f: mapboxgl.MapboxGeoJSONFeature) => {
          if (!f || !f.geometry) return false;
          const geomType = f.geometry.type;
          if (geomType !== 'Polygon' && geomType !== 'MultiPolygon') return false;

          const layerId = (f.layer?.id || '').toLowerCase();
          const srcLayer = (f.sourceLayer || '').toLowerCase();
          const layerType = f.layer?.type;
          const props = f.properties || {};

          // Ignorer les calques de sélection, survol, grille, routes et dessin
          if (
            layerId.includes('selected-building') ||
            layerId.includes('hovered-building') ||
            layerId.includes('courtyard') ||
            layerId.includes('grid-200m') ||
            layerId.includes('route') ||
            layerId.includes('draw-') ||
            layerId.includes('background') ||
            layerId.includes('landcover') ||
            layerId.includes('landuse') ||
            layerId.includes('water')
          ) {
            return false;
          }

          // 1. Toute couche de type fill-extrusion (bâtiments et volumes 3D)
          if (layerType === 'fill-extrusion') return true;

          // 2. Couche ou source layer associée aux bâtiments
          if (
            layerId.includes('building') ||
            layerId.includes('batiment') ||
            layerId.includes('structure') ||
            layerId.includes('3d') ||
            layerId.includes('extrusion') ||
            srcLayer.includes('building') ||
            srcLayer.includes('structure') ||
            srcLayer.includes('bâti')
          ) {
            return true;
          }

          // 3. Propriétés caractéristiques d'un édifice
          if (
            props.extrude === 'true' ||
            props.extrude === true ||
            props.building ||
            props.height !== undefined ||
            props.render_height !== undefined ||
            props.min_height !== undefined ||
            props.levels !== undefined ||
            props.type === 'building'
          ) {
            return true;
          }

          return false;
        };

        let matchedBuildingObj: Building | null = null;
        let matchedGeometry: any = null;
        let matchedCentroid: [number, number] = [lng, lat];
        let matchedArea: number = 100;
        let isCustomBuilding = false;
        let candidateTargetFeature: mapboxgl.MapboxGeoJSONFeature | undefined = undefined;

        try {
          // Détection ultra-précise au point et avec boîte d'interception 3D
          let renderedFeatures = map.queryRenderedFeatures(e.point);
          let targetFeature = renderedFeatures.find(isCandidate3DBuilding);

          if (!targetFeature) {
            const clickBox: [mapboxgl.PointLike, mapboxgl.PointLike] = [
              [e.point.x - 10, e.point.y - 10],
              [e.point.x + 10, e.point.y + 10]
            ];
            renderedFeatures = map.queryRenderedFeatures(clickBox);
            targetFeature = renderedFeatures.find(isCandidate3DBuilding);
          }

          candidateTargetFeature = targetFeature;

          // 1. Détection des Bâtiments 3D Personnalisés (couche custom-3d-buildings-extrusion)
          const customFeat = renderedFeatures.find(f => f.layer?.id === 'custom-3d-buildings-extrusion');
          if (customFeat) {
            const featId = customFeat.properties?.id || customFeat.id;
            
            // Vérifier en priorité si ce volume 3D correspond à un bâtiment de la base de données
            const matchedFromDb = buildings.find(b => 
              featId === `3d-auto-${b.id}` || 
              featId === `3d-wall-${b.id}` ||
              (typeof featId === 'string' && featId.startsWith(`3d-wall-${b.id}`)) ||
              b.id === featId
            );

            if (matchedFromDb) {
              matchedBuildingObj = matchedFromDb;
              matchedCentroid = [matchedFromDb.centroid.coordinates[0], matchedFromDb.centroid.coordinates[1]];
              matchedGeometry = sanitizeGeometry(matchedFromDb.geom);
              matchedArea = safeCalculateArea(matchedFromDb.geom, 80);
              isCustomBuilding = false;
            } else {
              const foundCustom = custom3DBuildingsRef.current.find(b => b.id === featId);
              if (foundCustom) {
                isCustomBuilding = true;
                matchedCentroid = foundCustom.centroid;
                matchedGeometry = {
                  type: 'Polygon',
                  coordinates: foundCustom.coordinates
                };
                matchedArea = foundCustom.area_m2 || 100;

                matchedBuildingObj = {
                  id: foundCustom.id,
                  osm_id: foundCustom.id,
                  hailand_code: null,
                  parent_building_id: null,
                  zone_id: null,
                  zone_code: null,
                  building_type: 'R',
                  has_courtyard: false,
                  courtyard_geom: null,
                  floor_count: foundCustom.floors || 1,
                  unit_count: 1,
                  floor_level: null,
                  unit_code: null,
                  physical_position: null,
                  status: 'actif',
                  geom: matchedGeometry,
                  centroid: {
                    type: 'Point',
                    coordinates: foundCustom.centroid
                  },
                  altitude_m: foundCustom.height || (foundCustom.floors * 3),
                  commune: 'Bamako',
                  quartier: 'Centre',
                  // Navigation & Accès Niveau 3
                  entry_point_geom: null,
                  entry_point_note: null,
                  internal_directions: null,
                  door_color: null,
                  intercom_code: null,
                  // Notes & Repères
                  landmark_note: foundCustom.name || `Bâtiment 3D (${foundCustom.floors} niveaux)`,
                  access_note: `Volume 3D personnalisé (${foundCustom.height}m)`,
                  is_validated: true,
                  validation_count: 1,
                  validated_by: actorId(),
                  validated_at: foundCustom.created_at,
                  submitted_by: actorId(),
                  claimed_by: null,
                  rejection_reason: null,
                  modification_request: null,
                  created_at: foundCustom.created_at,
                  updated_at: foundCustom.created_at
                };
              }
            }
          }

          // 2. Détection d'un bâtiment déjà enregistré dans la base
          if (!matchedBuildingObj) {
            const existingBuilding = buildings.find(b => {
              if (!b.centroid || !b.centroid.coordinates) return false;
              const bLng = b.centroid.coordinates[0];
              const bLat = b.centroid.coordinates[1];
              const dist = calculateDistance(lat, lng, bLat, bLng);
              return dist < 18;
            });

            if (existingBuilding) {
              matchedBuildingObj = existingBuilding;
              matchedCentroid = [existingBuilding.centroid.coordinates[0], existingBuilding.centroid.coordinates[1]];
              matchedGeometry = sanitizeGeometry(existingBuilding.geom);
              matchedArea = safeCalculateArea(existingBuilding.geom, 80);
            }
          }

          // 3. Détection d'un Bâtiment 3D OpenStreetMap ou de la carte Original Perso 3D
          if (!matchedBuildingObj && targetFeature && targetFeature.geometry) {
            const geom = sanitizeGeometry(targetFeature.geometry);
            let cLng = lng;
            let cLat = lat;
            try {
              const cent = turf.centroid(targetFeature as any);
              if (cent && cent.geometry && cent.geometry.coordinates) {
                cLng = cent.geometry.coordinates[0];
                cLat = cent.geometry.coordinates[1];
              }
            } catch (e) {}

            matchedCentroid = [cLng, cLat];
            matchedGeometry = geom;
            matchedArea = safeCalculateArea(geom, 120);

            const rawId = targetFeature.id;
            const props = targetFeature.properties || {};
            const osmId = props.id || props.osm_id || props['@id'];
            const featId = rawId !== undefined && rawId !== null
              ? String(rawId)
              : (osmId
                ? String(osmId)
                : `bldg-${Math.round(cLng * 100000)}-${Math.round(cLat * 100000)}`);

            const levels = props.levels ? Number(props.levels) : (props.height ? Math.max(1, Math.round(Number(props.height) / 3)) : 1);
            const heightM = Number(props.height || (levels * 3) || 6);

            matchedBuildingObj = {
              id: featId,
              osm_id: featId,
              hailand_code: null,
              parent_building_id: null,
              zone_id: null,
              zone_code: null,
              building_type: (props.type === 'commercial' ? 'C' : props.type === 'industrial' ? 'A' : 'R') as BuildingType,
              has_courtyard: false,
              courtyard_geom: null,
              floor_count: levels,
              unit_count: 1,
              floor_level: null,
              unit_code: null,
              physical_position: null,
              status: 'non_reclame',
              geom: geom,
              centroid: { type: 'Point', coordinates: [cLng, cLat] },
              altitude_m: heightM,
              commune: 'Bamako',
              quartier: props.suburb || props.neighbourhood || 'Centre',
              // Navigation & Accès Niveau 3
              entry_point_geom: null,
              entry_point_note: null,
              internal_directions: null,
              door_color: null,
              intercom_code: null,
              // Notes & Repères
              landmark_note: props.name ? `Bâtiment ${props.name}` : (props.type ? `Structure ${props.type}` : `Édifice 3D #${featId.slice(-6)}`),
              access_note: props.amenity ? `Affectation: ${props.amenity}` : null,
              is_validated: false,
              validation_count: 0,
              validated_by: null,
              validated_at: null,
              submitted_by: null,
              claimed_by: null,
              rejection_reason: null,
              modification_request: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
          }
        } catch (err) {
          console.warn("Erreur détection entité bâtiment Mapbox:", err);
        }

        // SI UN BÂTIMENT 3D (OSM, PERSO 3D, CUSTOM OU ENREGISTRÉ) A ÉTÉ CLIQUÉ :
        if (matchedBuildingObj) {
          setSelectedBuilding(matchedBuildingObj);
          setClickedCoords({
            latitude: matchedCentroid[1],
            longitude: matchedCentroid[0],
            buildingId: matchedBuildingObj.id,
            geometry: sanitizeGeometry(matchedGeometry),
            area: matchedArea
          });

          // Extraire les métadonnées complètes pour le masquage
          let hideData: HiddenBuildingData | undefined = undefined;
          if (candidateTargetFeature) {
            hideData = {
              id: matchedBuildingObj.id,
              rawFeatureId: candidateTargetFeature.id !== undefined && candidateTargetFeature.id !== null ? candidateTargetFeature.id : null,
              layerId: candidateTargetFeature.layer?.id,
              source: candidateTargetFeature.source || 'composite',
              sourceLayer: candidateTargetFeature.sourceLayer || 'building',
              osmId: matchedBuildingObj.osm_id || null,
              geometry: sanitizeGeometry(matchedGeometry),
              centroid: [matchedCentroid[0], matchedCentroid[1]],
              name: matchedBuildingObj.landmark_note
            };
          } else {
            hideData = {
              id: matchedBuildingObj.id,
              rawFeatureId: typeof matchedBuildingObj.id === 'number' ? matchedBuildingObj.id : (isNaN(Number(matchedBuildingObj.id)) ? null : Number(matchedBuildingObj.id)),
              osmId: matchedBuildingObj.osm_id || null,
              geometry: sanitizeGeometry(matchedGeometry),
              centroid: [matchedCentroid[0], matchedCentroid[1]],
              name: matchedBuildingObj.landmark_note
            };
          }

          // Action contextuelle flottante "Masquer" positionnée à côté du curseur
          setSelectedPolygonHideAction({
            buildingId: matchedBuildingObj.id,
            hideData,
            lngLat: [lng, lat],
            isCustom: isCustomBuilding,
            screenPos: { x: e.point.x, y: e.point.y }
          });

          const isCourtyard = selectionTargetNatureRef.current === 'courtyard' || Boolean(matchedBuildingObj.has_courtyard);

          // Surbrillance du contour exact du bâtiment (aucun faux carré créé)
          const selectionSource = map.getSource('selected-building') as mapboxgl.GeoJSONSource;
          if (selectionSource && matchedGeometry) {
            selectionSource.setData({
              type: 'Feature',
              properties: {
                is_courtyard: isCourtyard
              },
              geometry: matchedGeometry
            });
          }

          // Étape 1 : Détection spatiale automatique si sélection en mode cour/concession
          if (isCourtyard) {
            detectOsmBuildingsInZone(matchedGeometry, map);
          }

          // Afficher le marqueur du GPS fixe centroïde uniquement si ce n'est PAS une cour
          // (pour une cour, on évite d'obstruer le centre avec un gros marqueur orange pour laisser une visibilité parfaite sur les toits intérieurs)
          if (isCourtyard) {
            if (markerRef.current) {
              markerRef.current.remove();
              markerRef.current = null;
            }
          } else {
            if (markerRef.current) {
              markerRef.current.setLngLat([matchedCentroid[0], matchedCentroid[1]]);
            } else {
              const el = document.createElement('div');
              el.className = 'custom-house-marker select-none';
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
                .setLngLat([matchedCentroid[0], matchedCentroid[1]])
                .addTo(map);
              markerRef.current = marker;
            }
          }

          // Affichage du log demandé
          console.log("Bâtiment sélectionné :", matchedBuildingObj.id, matchedBuildingObj.landmark_note || matchedBuildingObj.hailand_code || matchedBuildingObj.osm_id);
          addApiLog('EVENT_CLICK_BUILDING_SELECT', `/map/building/${matchedBuildingObj.id}`, { 
            id: matchedBuildingObj.id, 
            name: matchedBuildingObj.landmark_note,
            lat: matchedCentroid[1],
            lng: matchedCentroid[0]
          }, { status: 'Selected', type: matchedBuildingObj.osm_id ? 'OSM_OR_CUSTOM' : 'REGISTERED' });

          return;
        }

        // SI CLIC EN TERRAIN LIBRE (HORS STRUCTURE 3D) :
        // Ne générer AUCUNE case carrée moche ou artificielle, désélectionner proprement
        setSelectedBuilding(null);
        setSelected3DBuilding(null);
        setClickedCoords(null);
        setSelectedPolygonHideAction(null);

        if (markerRef.current) {
          markerRef.current.remove();
          markerRef.current = null;
        }

        const selectionSource = map.getSource('selected-building') as mapboxgl.GeoJSONSource;
        if (selectionSource) {
          selectionSource.setData({
            type: 'FeatureCollection',
            features: []
          });
        }

        // Log de clic terrain libre
        addApiLog('EVENT_CLICK', `/map/coordinates`, { lat, lng }, { 
          buildingMatched: false,
          message: "Clic en terrain libre - Sélection réinitialisée."
        });
      });

      // Événement déplacement de souris (curseur interactif sur toutes les structures 3D OSM, perso et custom)
      map.on('mousemove', (e) => {
        // MODE SÉLECTION D'ENTRÉE / PORTAIL DE COUR AVEC VERROUILLAGE ET AIMANTATION CONTINUE SUR LE MUR
        if (entrancePickerConfigRef.current && entrancePickerConfigRef.current.active) {
          const picker = entrancePickerConfigRef.current;
          map.getCanvas().style.cursor = 'crosshair'; // Force le curseur en forme de mire (+)

          let snapLng = Number(e.lngLat.lng.toFixed(6));
          let snapLat = Number(e.lngLat.lat.toFixed(6));

          if (picker.type === 'courtyard' && (wallLineCacheRef.current || picker.wallGeometry)) {
            try {
              if (!wallLineCacheRef.current && picker.wallGeometry) {
                wallLineCacheRef.current = turf.polygonToLine(picker.wallGeometry);
              }
              const wallLine = wallLineCacheRef.current;
              if (wallLine) {
                const mousePt = turf.point([e.lngLat.lng, e.lngLat.lat]);
                const nearest = turf.nearestPointOnLine(wallLine as any, mousePt);
                snapLng = Number(nearest.geometry.coordinates[0].toFixed(6));
                snapLat = Number(nearest.geometry.coordinates[1].toFixed(6));
              }
            } catch (err) {
              console.warn("Erreur snapping mur de cour:", err);
            }
          }

          snappedCoordsRef.current = { lng: snapLng, lat: snapLat };

          if (!previewEntranceMarkerRef.current) {
            const el = document.createElement('div');
            el.className = 'entrance-snap-dot pointer-events-none';
            el.style.width = '10px';
            el.style.height = '10px';
            el.style.borderRadius = '50%';
            el.style.backgroundColor = picker.type === 'courtyard' ? '#00e5ff' : '#10b981';
            el.style.border = '2px solid #ffffff';
            el.style.boxShadow = picker.type === 'courtyard' 
              ? '0 0 0 2px rgba(0, 229, 255, 0.4), 0 0 10px rgba(0, 229, 255, 0.95)' 
              : '0 0 0 2px rgba(16, 185, 129, 0.4), 0 0 10px rgba(16, 185, 129, 0.95)';
            el.style.boxSizing = 'border-box';

            previewEntranceMarkerRef.current = new mapboxgl.Marker({ 
              element: el,
              anchor: 'center'
            });
          }

          previewEntranceMarkerRef.current.setLngLat([snapLng, snapLat]);
          if (!previewEntranceMarkerRef.current.getElement().parentElement) {
            previewEntranceMarkerRef.current.addTo(map);
          }

          return;
        }

        if (is3DDrawModeRef.current || isDrawModeRef.current) {
          lastMouseCoordRef.current = { lng: e.lngLat.lng, lat: e.lngLat.lat, point: e.point };
          if (drawRafRef.current === null) {
            drawRafRef.current = requestAnimationFrame(() => {
              drawRafRef.current = null;
              if (lastMouseCoordRef.current) {
                renderDrawRubberbandPreviewRef.current?.(
                  lastMouseCoordRef.current.lng,
                  lastMouseCoordRef.current.lat,
                  lastMouseCoordRef.current.point
                );
              }
            });
          }
          return;
        }

        try {
          const isCandidate3DBuilding = (f: mapboxgl.MapboxGeoJSONFeature) => {
            if (!f || !f.geometry) return false;
            const geomType = f.geometry.type;
            if (geomType !== 'Polygon' && geomType !== 'MultiPolygon') return false;

            const layerId = (f.layer?.id || '').toLowerCase();
            const srcLayer = (f.sourceLayer || '').toLowerCase();
            const layerType = f.layer?.type;
            const props = f.properties || {};

            if (
              layerId.includes('selected-building') ||
              layerId.includes('hovered-building') ||
              layerId.includes('courtyard') ||
              layerId.includes('grid-200m') ||
              layerId.includes('route') ||
              layerId.includes('draw-') ||
              layerId.includes('background') ||
              layerId.includes('landcover') ||
              layerId.includes('landuse') ||
              layerId.includes('water')
            ) {
              return false;
            }

            if (layerType === 'fill-extrusion') return true;

            if (
              layerId.includes('building') ||
              layerId.includes('batiment') ||
              layerId.includes('structure') ||
              layerId.includes('3d') ||
              layerId.includes('extrusion') ||
              srcLayer.includes('building') ||
              srcLayer.includes('structure') ||
              srcLayer.includes('bâti')
            ) {
              return true;
            }

            if (
              props.extrude === 'true' ||
              props.extrude === true ||
              props.building ||
              props.height !== undefined ||
              props.render_height !== undefined ||
              props.min_height !== undefined ||
              props.levels !== undefined ||
              props.type === 'building'
            ) {
              return true;
            }

            return false;
          };

          let features = map.queryRenderedFeatures(e.point);
          let hasBuilding = features.some(isCandidate3DBuilding);

          if (!hasBuilding) {
            features = map.queryRenderedFeatures([
              [e.point.x - 6, e.point.y - 6],
              [e.point.x + 6, e.point.y + 6]
            ]);
            hasBuilding = features.some(isCandidate3DBuilding);
          }

          map.getCanvas().style.cursor = hasBuilding ? 'pointer' : '';
        } catch (err) {
          map.getCanvas().style.cursor = '';
        }
      });

      // Événement sortie de carte
      map.on('mouseleave', () => {
        map.getCanvas().style.cursor = '';
        if (drawRafRef.current !== null) {
          cancelAnimationFrame(drawRafRef.current);
          drawRafRef.current = null;
        }
        lastMouseCoordRef.current = null;
        if (isDrawModeRef.current || is3DDrawModeRef.current) {
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
        if (is3DDrawModeRef.current && drawPoints3DRef.current.length >= 3) {
          e.preventDefault();
          setIs3DConfigModalOpen(true);
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

  const handleFlyToAndHighlight3DBuilding = (b: Custom3DBuilding) => {
    setHighlighted3DBuildingId(b.id);
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: b.centroid,
        zoom: 18,
        pitch: 60,
        bearing: -25,
        duration: 1200,
        essential: true
      });
      setCurrentPitch(60);
    }
    setTimeout(() => {
      setSelected3DBuilding(b);
    }, 600);

    setTimeout(() => {
      setHighlighted3DBuildingId(null);
    }, 3500);
  };

  // ===== FILTRE ET MASQUAGE DYNAMIQUE DES BÂTIMENTS/POLYGONES =====
  const applyHiddenBuildingsFilter = (mapInstance: mapboxgl.Map, hiddenList: HiddenBuildingData[], retryCount = 0) => {
    if (!mapInstance) return;
    
    try {
      const layers = mapInstance.getStyle()?.layers || [];

      // 1. Appliquer le feature-state pour masquer instantanément sur le GPU WebGL si la source existe
      hiddenList.forEach(b => {
        if (b.rawFeatureId !== undefined && b.rawFeatureId !== null) {
          try {
            const targetSource = b.source || 'composite';
            if (mapInstance.getSource(targetSource)) {
              mapInstance.setFeatureState(
                { source: targetSource, sourceLayer: b.sourceLayer || 'building', id: b.rawFeatureId },
                { hidden: true, is_hidden: true }
              );
            }
          } catch (e) {}
        }
      });

      // 2. Extraire tous les IDs (numériques et textuels)
      const numericIds: number[] = [];
      const stringIds: string[] = [];

      hiddenList.forEach(b => {
        if (b.rawFeatureId !== undefined && b.rawFeatureId !== null) {
          const num = Number(b.rawFeatureId);
          if (!isNaN(num)) numericIds.push(num);
          stringIds.push(String(b.rawFeatureId));
        }
        if (b.id !== undefined && b.id !== null) {
          const num = Number(b.id);
          if (!isNaN(num)) numericIds.push(num);
          stringIds.push(String(b.id));
        }
        if (b.osmId !== undefined && b.osmId !== null) {
          const num = Number(b.osmId);
          if (!isNaN(num)) numericIds.push(num);
          stringIds.push(String(b.osmId));
        }
      });

      const uniqueNumericIds = Array.from(new Set(numericIds));
      const uniqueStringIds = Array.from(new Set(stringIds));

      // 3. Appliquer le filtre à TOUTES les couches de bâtiments de la carte (3D et 2D)
      layers.forEach(layer => {
        const isBuildingLayer =
          layer.id === '3d-buildings' ||
          layer.id === '3d-buildings-invisible' ||
          (layer['source-layer'] === 'building' && !layer.id.includes('custom-3d') && !layer.id.includes('selected-') && !layer.id.includes('hovered-')) ||
          (layer.id.toLowerCase().includes('building') && !layer.id.includes('custom-3d') && !layer.id.includes('selected-') && !layer.id.includes('hovered-'));

        if (!isBuildingLayer) return;

        try {
          // Si couche d'extrusion 3D, assurer le support feature-state
          if (layer.type === 'fill-extrusion') {
            try {
              mapInstance.setPaintProperty(layer.id, 'fill-extrusion-opacity', [
                'case',
                ['boolean', ['feature-state', 'hidden'], false],
                0,
                ['boolean', ['feature-state', 'is_hidden'], false],
                0,
                1.0
              ]);
            } catch (e) {}
          } else if (layer.type === 'fill') {
            try {
              mapInstance.setPaintProperty(layer.id, 'fill-opacity', [
                'case',
                ['boolean', ['feature-state', 'hidden'], false],
                0,
                ['boolean', ['feature-state', 'is_hidden'], false],
                0,
                layer.id === '3d-buildings-invisible' ? 0.001 : 1.0
              ]);
            } catch (e) {}
          }

          if (uniqueNumericIds.length === 0 && uniqueStringIds.length === 0) {
            // Aucun polygone masqué
            if (layer.id === '3d-buildings') {
              mapInstance.setFilter('3d-buildings', ['==', 'extrude', 'true']);
            } else if (layer.id === '3d-buildings-invisible') {
              mapInstance.setFilter('3d-buildings-invisible', null);
            }
          } else {
            // Construire les conditions d'exclusion pour le calque 3D fill-extrusion
            const excludeConditions: any[] = [];
            if (uniqueNumericIds.length > 0) {
              excludeConditions.push(['!', ['in', ['coalesce', ['id'], -1], ['literal', uniqueNumericIds]]]);
            }
            if (uniqueStringIds.length > 0) {
              excludeConditions.push(['!', ['in', ['coalesce', ['get', 'id'], ''], ['literal', uniqueStringIds]]]);
              excludeConditions.push(['!', ['in', ['coalesce', ['get', 'mapbox_id'], ''], ['literal', uniqueStringIds]]]);
              excludeConditions.push(['!', ['in', ['coalesce', ['get', 'osm_id'], ''], ['literal', uniqueStringIds]]]);
              excludeConditions.push(['!', ['in', ['to-string', ['coalesce', ['id'], '']], ['literal', uniqueStringIds]]]);
            }

            if (layer.id === '3d-buildings') {
              mapInstance.setFilter('3d-buildings', [
                'all',
                ['==', 'extrude', 'true'],
                ...excludeConditions
              ]);
            } else {
              const currentFilter = (layer as any).filter;
              if (currentFilter && Array.isArray(currentFilter) && currentFilter.length > 0) {
                mapInstance.setFilter(layer.id, [
                  'all',
                  currentFilter,
                  ...excludeConditions
                ]);
              } else {
                mapInstance.setFilter(layer.id, [
                  'all',
                  ...excludeConditions
                ]);
              }
            }
          }
        } catch (layerErr) {
          console.warn(`Avertissement filtre couche ${layer.id}:`, layerErr);
        }
      });

      // 4. Mettre à jour la source GeoJSON de masquage visuel direct
      const maskSource = mapInstance.getSource('hidden-polygons-mask') as mapboxgl.GeoJSONSource;
      if (maskSource) {
        const maskFeatures = hiddenList
          .filter(b => b.geometry && (b.geometry.coordinates || (b.geometry as any).geometries))
          .map(b => ({
            type: 'Feature' as const,
            properties: { id: b.id },
            geometry: b.geometry
          }));
        maskSource.setData({
          type: 'FeatureCollection',
          features: maskFeatures as any
        });
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('Style is not done loading') || msg.includes('not done loading')) {
        if (retryCount < 20) {
          setTimeout(() => {
          applyHiddenBuildingsFilter(mapInstance, hiddenList, retryCount + 1);
        }, 150);
        } else {
          console.warn("Abandon synchronisation applyHiddenBuildingsFilter après 20 tentatives");
        }
        return;
      }
      console.warn("Erreur application filtre masquage:", err);
    }
  };

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

    addApiLog('DELETE_3D_BUILDING', `/map/3d-buildings/${targetId}`, null, { deleted: true });
  };

  // ===== GESTION DES MODÈLES 3D GLTF/GLB (house.glb) =====
  const handleStartModel3DPlacement = () => {
    setIs3DModelPlacementActive(true);
    setIs3DDrawMode(false);
    setIsDrawMode(false);
    setIsSidebarOpen(false);
    setSelectedBuilding(null);
    setClickedCoords(null);

    setMapNotification({
      type: 'info',
      title: 'Placement 3D',
      message: "Cliquez sur la carte pour placer l'objet 3D"
    });

    addApiLog('START_3D_MODEL_PLACEMENT', `/map/3d-models/start`, null, { active: true, model: 'house.glb' });
  };

  const handleSelectPlaced3DModel = (model: Placed3DModel) => {
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [model.lng, model.lat],
        zoom: 18.5,
        pitch: 55,
        duration: 1000
      });
      setCurrentPitch(55);
    }
  };

  const handleDeletePlaced3DModel = (modelId: string) => {
    setPlaced3DModels(prev => {
      const updated = prev.filter(m => m.id !== modelId);
      try {
        localStorage.setItem('hailandmap_placed_3d_models', safeJsonStringify(updated, 0));
      } catch (err) {}
      if (mapRef.current) {
        syncPlaced3DModelsLayer(mapRef.current, updated);
      }
      return updated;
    });

    setMapNotification({
      type: 'info',
      title: 'Objet 3D Supprimé',
      message: 'Le modèle 3D a été retiré de la carte.'
    });

    addApiLog('DELETE_3D_MODEL', `/map/3d-models/${modelId}`, null, { deleted: true });
  };

  const handleUpdatePlaced3DModelScale = (modelId: string, newScale: number) => {
    setPlaced3DModels(prev => {
      const updated = prev.map(m => m.id === modelId ? { ...m, scale: newScale } : m);
      try {
        localStorage.setItem('hailandmap_placed_3d_models', safeJsonStringify(updated, 0));
      } catch (err) {}
      if (mapRef.current) {
        syncPlaced3DModelsLayer(mapRef.current, updated);
      }
      return updated;
    });
    addApiLog('UPDATE_3D_MODEL_SCALE', `/map/3d-models/${modelId}/scale`, { scale: newScale }, { status: 'Success' });
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

      addApiLog('HIDE_POLYGON', `/map/polygon/hide`, { id: itemToHide.id }, { status: 'Hidden' });
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

      addApiLog('DETECT_AND_MASK_OSM_IN_ZONE', `/map/spatial/detect-mask-osm`, { zoneArea: safeCalculateArea(cleanGeom) }, {
        detectedCount: detectedBuildingIds.length,
        buildingIds: detectedBuildingIds,
        masked: true
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

    addApiLog('BULK_HIDE_OSM_ZONE', `/map/osm/bulk-hide`, {
      count: itemsToHide.length,
      zoneArea: zoneGeometry ? safeCalculateArea(zoneGeometry) : undefined
    }, {
      status: 'Masked',
      maskedIds
    });

    return itemsToHide.length;
  }, [detectOsmBuildingsInZone]);

  // ===== LOGIQUE DE CHARGEMENT PAR VIEWPORT & SEUIL D'ALTITUDE 200M =====
  // Seuil d'apparition correspondant à l'altitude ~200m (zoom Mapbox 15.0)
  const CONCESSION_VIEW_MIN_ZOOM = 15.0;

  // Calcul du bounding box [minLng, minLat, maxLng, maxLat] à partir de coordonnées GeoJSON quelconques
  const getCoordsBbox = (coords: any): [number, number, number, number] | null => {
    if (!coords) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const walk = (c: any) => {
      if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
        const x = c[0];
        const y = c[1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      } else if (Array.isArray(c)) {
        for (let i = 0; i < c.length; i++) walk(c[i]);
      }
    };
    walk(coords);
    if (!isFinite(minX)) return null;
    return [minX, minY, maxX, maxY];
  };

  // Test d'intersection entre la géométrie et le rectangle de vision de l'écran (viewport)
  const isBboxInViewport = (
    featureBbox: [number, number, number, number] | null,
    viewBbox: [number, number, number, number]
  ): boolean => {
    if (!featureBbox) return true;
    return !(
      featureBbox[2] < viewBbox[0] ||
      featureBbox[0] > viewBbox[2] ||
      featureBbox[3] < viewBbox[1] ||
      featureBbox[1] > viewBbox[3]
    );
  };

  // Récupère l'emprise géographique visible à l'écran avec une marge de confort de 20%
  const getExtendedViewportBounds = (mapInstance: mapboxgl.Map, marginRatio = 0.2): [number, number, number, number] | null => {
    try {
      const bounds = mapInstance.getBounds();
      if (!bounds) return null;
      const west = bounds.getWest();
      const east = bounds.getEast();
      const south = bounds.getSouth();
      const north = bounds.getNorth();
      const lngSpan = Math.max(0.0001, Math.abs(east - west));
      const latSpan = Math.max(0.0001, Math.abs(north - south));
      return [
        west - lngSpan * marginRatio,
        south - latSpan * marginRatio,
        east + lngSpan * marginRatio,
        north + latSpan * marginRatio
      ];
    } catch (e) {
      return null;
    }
  };

  // ===== GESTION DE L'ORDRE STRICT DES COUCHES (BÂTIMENTS AU-DESSUS DU FOND DES COURS) =====
  const enforceBuildingsAboveCourtyardsOrder = (mapInstance: mapboxgl.Map) => {
    try {
      // Déterminer la première couche de bâtiments 3D :
      // Les couches 2D de sol (fond et contour des cours, concessions) doivent TOUJOURS être positionnées SOUS les bâtiments 3D
      const first3DLayer = mapInstance.getLayer('3d-buildings') 
        ? '3d-buildings' 
        : (mapInstance.getLayer('custom-3d-buildings-extrusion') 
            ? 'custom-3d-buildings-extrusion' 
            : (mapInstance.getLayer('3d-buildings-invisible') ? '3d-buildings-invisible' : undefined));

      if (!first3DLayer) return;

      const groundLayers = [
        'courtyards-fill-layer',
        'courtyards-outline-layer',
        'courtyard-mother-fill',
        'courtyard-mother-outline-casing',
        'courtyard-mother-outline',
        'courtyard-children-fill',
        'courtyard-children-outline',
        'courtyard-active-child-fill',
        'courtyard-active-child-outline',
        'selected-building-fill',
        'selected-courtyard-outline-casing',
        'selected-courtyard-outline',
        'selected-building-outline',
        'osm-detected-in-zone-fill',
        'osm-detected-in-zone-outline',
        'hovered-building-fill',
        'hovered-building-outline'
      ];

      groundLayers.forEach(layerId => {
        if (mapInstance.getLayer(layerId) && mapInstance.getLayer(first3DLayer)) {
          try {
            mapInstance.moveLayer(layerId, first3DLayer);
          } catch (e) {
            // Déjà en place ou style en cours de transition
          }
        }
      });

      // S'assurer que si custom-3d-buildings-extrusion existe, il est bien au-dessus de courtyards-outline-layer
      if (mapInstance.getLayer('courtyards-outline-layer') && mapInstance.getLayer('custom-3d-buildings-extrusion')) {
        try {
          mapInstance.moveLayer('courtyards-outline-layer', 'custom-3d-buildings-extrusion');
        } catch (e) {}
      }
      if (mapInstance.getLayer('courtyards-fill-layer') && mapInstance.getLayer('courtyards-outline-layer')) {
        try {
          mapInstance.moveLayer('courtyards-fill-layer', 'courtyards-outline-layer');
        } catch (e) {}
      }
    } catch (err) {
      // Silencieux
    }
  };

  // ===== GESTION DES COURS / CONCESSIONS (FILL + OUTLINE) =====
  const syncCourtyardsLayer = (mapInstance: mapboxgl.Map, buildingsList: Building[], retryCount = 0) => {
    if (!mapInstance) return;
    try {
      const currentZoom = typeof mapInstance.getZoom === 'function' ? mapInstance.getZoom() : 0;
      const existingSource = mapInstance.getSource('courtyards-source') as mapboxgl.GeoJSONSource;

      // Seuil 200m : en deçà, les concessions ne sont pas chargées
      if (currentZoom < CONCESSION_VIEW_MIN_ZOOM) {
        if (existingSource) {
          existingSource.setData({ type: 'FeatureCollection', features: [] });
        }
        return;
      }

      const viewBbox = getExtendedViewportBounds(mapInstance, 0.2);
      const courtyards = buildingsList.filter(b => b.has_courtyard && (b.courtyard_geom || (b.parent_building_id === null && b.geom)));
      
      const features = courtyards
        .filter(b => {
          if (selectedBuildingRef.current?.id === b.id) return true;
          if (!viewBbox) return true;
          let rawGeom: any = b.courtyard_geom || b.geom;
          if (typeof rawGeom === 'string') {
            try { rawGeom = JSON.parse(rawGeom); } catch(e) {}
          }
          const bbox = getCoordsBbox(rawGeom?.coordinates);
          return isBboxInViewport(bbox, viewBbox);
        })
        .map(b => {
          let rawGeom: any = b.courtyard_geom || b.geom;
          if (typeof rawGeom === 'string') {
            try { rawGeom = JSON.parse(rawGeom); } catch(e) {}
          }
          return {
            type: 'Feature' as const,
            id: b.id,
            properties: {
              id: b.id,
              name: b.hailand_code
            },
            geometry: rawGeom
          };
        }).filter(f => f.geometry && f.geometry.coordinates);

      if (existingSource) {
        existingSource.setData({
          type: 'FeatureCollection',
          features
        });
      } else {
        mapInstance.addSource('courtyards-source', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features
          }
        });
      }

      if (!mapInstance.getLayer('courtyards-fill-layer')) {
        const layers = mapInstance.getStyle()?.layers;
        const firstSymbolId = layers?.find(l => l.type === 'symbol' && l.layout?.['text-field'])?.id;
        
        // Déterminer la couche 3D avant laquelle insérer pour que le bâtiment soit AU-DESSUS du fond de cour
        const groundBeforeId = mapInstance.getLayer('custom-3d-buildings-extrusion')
          ? 'custom-3d-buildings-extrusion'
          : (mapInstance.getLayer('3d-buildings')
              ? '3d-buildings'
              : (mapInstance.getLayer('3d-buildings-invisible')
                  ? '3d-buildings-invisible'
                  : firstSymbolId));

        mapInstance.addLayer(
          {
            id: 'courtyards-fill-layer',
            type: 'fill',
            source: 'courtyards-source',
            minzoom: CONCESSION_VIEW_MIN_ZOOM,
            paint: {
              'fill-color': '#f59e0b',
              'fill-opacity': 0.12,
            }
          },
          groundBeforeId
        );

        mapInstance.addLayer(
          {
            id: 'courtyards-outline-layer',
            type: 'line',
            source: 'courtyards-source',
            minzoom: CONCESSION_VIEW_MIN_ZOOM,
            paint: {
              'line-color': '#fbbf24',
              'line-width': 1.8,
              'line-dasharray': [2, 1],
              'line-opacity': 0.85,
            }
          },
          groundBeforeId
        );
      } else {
        // Restauration garantie des couleurs de fond des cours une fois générées
        mapInstance.setPaintProperty('courtyards-fill-layer', 'fill-color', '#f59e0b');
        mapInstance.setPaintProperty('courtyards-fill-layer', 'fill-opacity', 0.12);
        mapInstance.setPaintProperty('courtyards-outline-layer', 'line-color', '#fbbf24');
        mapInstance.setPaintProperty('courtyards-outline-layer', 'line-width', 1.8);
        mapInstance.setPaintProperty('courtyards-outline-layer', 'line-dasharray', [2, 1]);
        mapInstance.setPaintProperty('courtyards-outline-layer', 'line-opacity', 0.85);
      }

      // Appliquer l'ordonnancement strict pour que les bâtiments restent au-dessus du sol de la cour
      enforceBuildingsAboveCourtyardsOrder(mapInstance);
    } catch (err) {
      if (retryCount < 20) {
        setTimeout(() => {
          if (mapRef.current) syncCourtyardsLayer(mapRef.current, buildingsList, retryCount + 1);
        }, 150);
      }
    }
  };

  // ===== GESTION DES POINTS D'ACCÈS (PORTAILS) =====
  const syncEntryPointsLayer = (mapInstance: mapboxgl.Map, buildingsList: Building[], retryCount = 0) => {
    if (!mapInstance) return;
    try {
      const currentZoom = typeof mapInstance.getZoom === 'function' ? mapInstance.getZoom() : 0;
      const existingSource = mapInstance.getSource('entry-points-source') as mapboxgl.GeoJSONSource;

      // Seuil 200m
      if (currentZoom < CONCESSION_VIEW_MIN_ZOOM) {
        if (existingSource) {
          existingSource.setData({ type: 'FeatureCollection', features: [] });
        }
        return;
      }

      const viewBbox = getExtendedViewportBounds(mapInstance, 0.2);
      const buildingsWithEntry = buildingsList.filter(b => b.entry_point_geom);
      
      const features = buildingsWithEntry
        .filter(b => {
          if (!viewBbox) return true;
          let rawGeom: any = b.entry_point_geom;
          if (typeof rawGeom === 'string') {
            try { rawGeom = JSON.parse(rawGeom); } catch(e) {}
          }
          if (rawGeom?.coordinates && Array.isArray(rawGeom.coordinates) && rawGeom.coordinates.length >= 2) {
            const lng = rawGeom.coordinates[0];
            const lat = rawGeom.coordinates[1];
            return lng >= viewBbox[0] && lng <= viewBbox[2] && lat >= viewBbox[1] && lat <= viewBbox[3];
          }
          return true;
        })
        .map(b => {
          let rawGeom: any = b.entry_point_geom;
          if (typeof rawGeom === 'string') {
            try { rawGeom = JSON.parse(rawGeom); } catch(e) {}
          }
          return {
            type: 'Feature' as const,
            id: b.id,
            properties: {
              id: b.id,
              name: b.entry_point_note || 'Portail'
            },
            geometry: rawGeom
          };
        }).filter(f => f.geometry && f.geometry.coordinates);

      if (existingSource) {
        existingSource.setData({
          type: 'FeatureCollection',
          features
        });
      } else {
        mapInstance.addSource('entry-points-source', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features
          }
        });
      }

      if (!mapInstance.getLayer('entry-points-circle-layer')) {
        mapInstance.addLayer({
          id: 'entry-points-circle-layer',
          type: 'circle',
          source: 'entry-points-source',
          minzoom: CONCESSION_VIEW_MIN_ZOOM,
          paint: {
            'circle-radius': 5,
            'circle-color': '#10b981',         // Vert émeraude
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',  // Bordure blanche
          },
        });
      }
    } catch (err) {
      if (retryCount < 20) {
        setTimeout(() => {
          if (mapRef.current) syncEntryPointsLayer(mapRef.current, buildingsList, retryCount + 1);
        }, 150);
      }
    }
  };

  // ===== GESTION DES BÂTIMENTS 3D PERSONNALISÉS (FILL-EXTRUSION) =====
  const syncCustom3DBuildingsLayer = (mapInstance: mapboxgl.Map, list: Custom3DBuilding[], highlightId?: string | null, retryCount = 0) => {
    if (!mapInstance) return;
    
    try {
      const currentZoom = typeof mapInstance.getZoom === 'function' ? mapInstance.getZoom() : 0;
      const existingSource = mapInstance.getSource('custom-3d-buildings') as mapboxgl.GeoJSONSource;
      const altSource = mapInstance.getSource('custom-buildings-source') as mapboxgl.GeoJSONSource;

      // Seuil 200m : en deçà, les bâtiments 3D générés ne sont pas chargés
      if (currentZoom < CONCESSION_VIEW_MIN_ZOOM) {
        if (existingSource) {
          existingSource.setData({ type: 'FeatureCollection', features: [] });
        }
        if (altSource) {
          altSource.setData({ type: 'FeatureCollection', features: [] });
        }
        return;
      }

      // Filtrer uniquement les bâtiments 3D visibles dans le viewport
      const viewBbox = getExtendedViewportBounds(mapInstance, 0.2);

      const features = list
        .filter(b => b.coordinates && Array.isArray(b.coordinates) && b.coordinates.length > 0 && b.coordinates[0]?.length >= 3)
        .filter(b => {
          if (highlightId && (highlightId === b.id || highlightId.endsWith(String(b.id)))) return true;
          if (!viewBbox) return true;
          const bbox = getCoordsBbox(b.coordinates);
          return isBboxInViewport(bbox, viewBbox);
        })
        .map(b => {
          // Anneau extérieur fermé obligatoire pour le fill-extrusion Mapbox
          const outerRing = [...b.coordinates[0]];
          const firstPt = outerRing[0];
          const lastPt = outerRing[outerRing.length - 1];
          if (firstPt && lastPt && (firstPt[0] !== lastPt[0] || firstPt[1] !== lastPt[1])) {
            outerRing.push([firstPt[0], firstPt[1]]);
          }
          const closedCoords: [number, number][][] = [outerRing as [number, number][]];
          for (let i = 1; i < b.coordinates.length; i++) {
            const hole = [...b.coordinates[i]];
            const f = hole[0];
            const l = hole[hole.length - 1];
            if (f && l && (f[0] !== l[0] || f[1] !== l[1])) {
              hole.push([f[0], f[1]]);
            }
            closedCoords.push(hole as [number, number][]);
          }

          return {
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
              area_m2: b.area_m2,
              is_highlighted: highlightId === b.id || (highlightId ? highlightId.endsWith(String(b.id)) : false)
            },
            geometry: {
              type: 'Polygon' as const,
              coordinates: closedCoords
            }
          };
        });

      if (existingSource) {
        existingSource.setData({
          type: 'FeatureCollection',
          features
        });
      } else {
        mapInstance.addSource('custom-3d-buildings', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features
          }
        });
      }

      // Maintenir également la source custom-buildings-source en synchronisation si présente
      if (altSource) {
        altSource.setData({
          type: 'FeatureCollection',
          features
        });
      }

      if (!mapInstance.getLayer('custom-3d-buildings-extrusion')) {
        const layers = mapInstance.getStyle()?.layers;
        const firstSymbolId = layers?.find(l => l.type === 'symbol' && l.layout?.['text-field'])?.id;

        mapInstance.addLayer(
          {
            id: 'custom-3d-buildings-extrusion',
            type: 'fill-extrusion',
            source: 'custom-3d-buildings',
            minzoom: CONCESSION_VIEW_MIN_ZOOM,
            paint: {
              'fill-extrusion-color': [
                'case',
                ['boolean', ['get', 'is_highlighted'], false],
                '#38bdf8',
                ['coalesce', ['get', 'color'], '#f0eee9']
              ],
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': ['coalesce', ['get', 'base_height'], 0],
              'fill-extrusion-opacity': 0.95,
              'fill-extrusion-vertical-gradient': true,
              'fill-extrusion-ambient-occlusion-intensity': 0.45
            }
          },
          firstSymbolId
        );

        // Hover cursor
        mapInstance.on('mouseenter', 'custom-3d-buildings-extrusion', () => {
          mapInstance.getCanvas().style.cursor = 'pointer';
        });
        mapInstance.on('mouseleave', 'custom-3d-buildings-extrusion', () => {
          mapInstance.getCanvas().style.cursor = '';
        });

        // Clic sur bâtiment 3D (pas d'ouverture automatique de panneau)
        mapInstance.on('click', 'custom-3d-buildings-extrusion', () => {
          if (is3DDrawModeRef.current || isDrawModeRef.current) return;
        });
      } else {
        // Mettre à jour les propriétés de peinture pour un rendu 100% solide et dynamique
        mapInstance.setPaintProperty('custom-3d-buildings-extrusion', 'fill-extrusion-opacity', 1.0);
        mapInstance.setPaintProperty('custom-3d-buildings-extrusion', 'fill-extrusion-vertical-gradient', true);
        mapInstance.setPaintProperty('custom-3d-buildings-extrusion', 'fill-extrusion-color', [
          'case',
          ['boolean', ['get', 'is_highlighted'], false],
          '#38bdf8',
          ['coalesce', ['get', 'color'], '#f0eee9']
        ]);
      }

      // Appliquer l'ordonnancement strict : les bâtiments 3D sont AU-DESSUS du fond de la cour
      enforceBuildingsAboveCourtyardsOrder(mapInstance);
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('Style is not done loading') || msg.includes('not done loading')) {
        if (retryCount < 20) {
          setTimeout(() => {
          syncCustom3DBuildingsLayer(mapInstance, list, highlightId, retryCount + 1);
        }, 150);
        } else {
          console.warn("Abandon synchronisation syncCustom3DBuildingsLayer après 20 tentatives");
        }
        return;
      }
      console.warn("Erreur synchronisation layer custom 3d buildings:", err);
    }
  };

  // ===== GESTION DES MODÈLES 3D NATIFS MAPBOX (ADDMODEL & LAYER TYPE MODEL) =====
  const syncPlaced3DModelsLayer = (mapInstance: mapboxgl.Map, list: Placed3DModel[], retryCount = 0) => {
    if (!mapInstance) return;
    
    try {
      const mapAny = mapInstance as any;

      // 1. Déclaration du modèle 3D auprès du style Mapbox
      const houseModelUrl = getHouseModelUrl();
      if (typeof mapAny.hasModel === 'function') {
        if (!mapAny.hasModel('house-model')) {
          mapAny.addModel('house-model', houseModelUrl);
        }
      } else if (typeof mapAny.addModel === 'function') {
        try {
          mapAny.addModel('house-model', houseModelUrl);
        } catch (e) {}
      }

      // 2. Préparation des entités GeoJSON Point
      const features = list.map(m => {
        const s = m.scale && m.scale > 3 ? m.scale : 20.0;
        return {
          type: 'Feature' as const,
          id: m.id,
          properties: {
            id: m.id,
            name: m.name,
            modelUrl: m.modelUrl || houseModelUrl,
            scale: s,
            scale_xyz: [s, s, s],
            created_at: m.created_at
          },
          geometry: {
            type: 'Point' as const,
            coordinates: [m.lng, m.lat]
          }
        };
      });

      const sourceData = {
        type: 'FeatureCollection' as const,
        features
      };

      // 3. Source GeoJSON dynamique dédiée
      const existingSource = mapInstance.getSource('placed-3d-objects-source') as mapboxgl.GeoJSONSource;
      if (existingSource) {
        existingSource.setData(sourceData);
      } else {
        mapInstance.addSource('placed-3d-objects-source', {
          type: 'geojson',
          data: sourceData
        });
      }

      // 4. Couche native Mapbox de type 'model'
      if (!mapInstance.getLayer('placed-3d-objects-layer')) {
        const layers = mapInstance.getStyle()?.layers;
        const firstSymbolId = layers?.find(l => l.type === 'symbol' && l.layout?.['text-field'])?.id;

        mapAny.addLayer(
          {
            id: 'placed-3d-objects-layer',
            type: 'model',
            source: 'placed-3d-objects-source',
            layout: {
              'model-id': 'house-model'
            },
            paint: {
              'model-scale': ['coalesce', ['get', 'scale_xyz'], ['literal', [20, 20, 20]]],
              'model-rotation': [0, 0, 0],
              'model-translation': [0, 0, 0],
              'model-opacity': 1.0
            }
          },
          firstSymbolId
        );

        mapInstance.on('mouseenter', 'placed-3d-objects-layer', () => {
          mapInstance.getCanvas().style.cursor = 'pointer';
        });
        mapInstance.on('mouseleave', 'placed-3d-objects-layer', () => {
          if (!is3DModelPlacementActiveRef.current && !is3DDrawModeRef.current && !isDrawModeRef.current) {
            mapInstance.getCanvas().style.cursor = '';
          }
        });
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('Style is not done loading') || msg.includes('not done loading')) {
        if (retryCount < 20) {
          setTimeout(() => {
          syncPlaced3DModelsLayer(mapInstance, list, retryCount + 1);
        }, 150);
        } else {
          console.warn("Abandon synchronisation syncPlaced3DModelsLayer après 20 tentatives");
        }
        return;
      }
      console.warn('[Mapbox Native 3D] Erreur synchronisation couche model:', err);
    }
  };

  // ===== GESTION DES POINTS GPS FIXES CENTROÏDES DE CHACUN DES POLYGONES =====
  const syncFixedGpsCentroidsLayer = (
    mapInstance: mapboxgl.Map,
    buildingsList: Building[],
    custom3DList: Custom3DBuilding[],
    selectedId?: string | null,
    retryCount = 0
  ) => {
    if (!mapInstance) return;
    if (typeof mapInstance.isStyleLoaded === 'function' && !mapInstance.isStyleLoaded()) {
      if (retryCount < 20) {
        setTimeout(() => {
          if (mapRef.current) syncFixedGpsCentroidsLayer(mapRef.current, buildingsList, custom3DList, selectedId, retryCount + 1);
        }, 150);
      }
      return;
    }

    try {
      const currentZoom = typeof mapInstance.getZoom === 'function' ? mapInstance.getZoom() : 0;
      const existingSource = mapInstance.getSource('fixed-gps-centroids-source') as mapboxgl.GeoJSONSource;

      // Seuil 200m : en deçà, les marqueurs de centroïdes ne sont pas chargés
      if (currentZoom < CONCESSION_VIEW_MIN_ZOOM) {
        if (existingSource) {
          existingSource.setData({ type: 'FeatureCollection', features: [] });
        }
        return;
      }

      const viewBbox = getExtendedViewportBounds(mapInstance, 0.2);
      const isPointInView = (lng: number, lat: number) => {
        if (!viewBbox) return true;
        return lng >= viewBbox[0] && lng <= viewBbox[2] && lat >= viewBbox[1] && lat <= viewBbox[3];
      };

      const features: any[] = [];
      const seenCoords = new Set<string>();

      // 1. Centroïdes des bâtiments enregistrés (concessions et logements enfants inclus)
      buildingsList.forEach(b => {
        let lngLat: [number, number] | null = null;
        if (b.centroid?.coordinates && Array.isArray(b.centroid.coordinates) && b.centroid.coordinates.length >= 2) {
          lngLat = [b.centroid.coordinates[0], b.centroid.coordinates[1]];
        } else if (b.geom?.coordinates) {
          try {
            const c = turf.centroid(b.geom as any);
            if (c?.geometry?.coordinates) {
              lngLat = [c.geometry.coordinates[0], c.geometry.coordinates[1]];
            }
          } catch (e) {}
        }

        if (!lngLat || isNaN(lngLat[0]) || isNaN(lngLat[1])) return;
        const isSel = selectedId === b.id;
        if (!isSel && !isPointInView(lngLat[0], lngLat[1])) return;

        const key = `${lngLat[0].toFixed(6)}_${lngLat[1].toFixed(6)}`;
        if (seenCoords.has(key)) return;
        seenCoords.add(key);

        features.push({
          type: 'Feature',
          id: `centroid-${b.id}`,
          properties: {
            id: b.id,
            name: b.hailand_code || b.landmark_note || `Bâtiment ${b.building_type}`,
            short_coords: `${lngLat[1].toFixed(5)}, ${lngLat[0].toFixed(5)}`,
            is_selected: isSel,
            is_courtyard: b.has_courtyard,
            is_child: Boolean(b.parent_building_id),
            source_type: 'building'
          },
          geometry: {
            type: 'Point',
            coordinates: lngLat
          }
        });
      });

      // 2. Centroïdes des polygones 3D générés / personnalisés
      custom3DList.forEach(c3d => {
        if (c3d.id.startsWith('3d-wall-')) return; // Ne pas afficher pour les murs de clôture
        let lngLat: [number, number] | null = null;
        if (c3d.centroid && Array.isArray(c3d.centroid) && c3d.centroid.length >= 2) {
          lngLat = [c3d.centroid[0], c3d.centroid[1]];
        } else if (c3d.coordinates && c3d.coordinates.length > 0) {
          try {
            const poly = { type: 'Polygon', coordinates: c3d.coordinates };
            const c = turf.centroid(poly as any);
            if (c?.geometry?.coordinates) {
              lngLat = [c.geometry.coordinates[0], c.geometry.coordinates[1]];
            }
          } catch (e) {}
        }

        if (!lngLat || isNaN(lngLat[0]) || isNaN(lngLat[1])) return;
        const isSel = selectedId === c3d.id || (selectedId ? selectedId.endsWith(c3d.id) : false);
        if (!isSel && !isPointInView(lngLat[0], lngLat[1])) return;

        const key = `${lngLat[0].toFixed(6)}_${lngLat[1].toFixed(6)}`;
        if (seenCoords.has(key)) return;
        seenCoords.add(key);

        features.push({
          type: 'Feature',
          id: `centroid-${c3d.id}`,
          properties: {
            id: c3d.id,
            name: c3d.name || 'Polygone 3D généré',
            short_coords: `${lngLat[1].toFixed(5)}, ${lngLat[0].toFixed(5)}`,
            is_selected: isSel,
            is_courtyard: false,
            is_child: false,
            source_type: 'custom_3d'
          },
          geometry: {
            type: 'Point',
            coordinates: lngLat
          }
        });
      });

      // 3. Centroïdes des polygones détectés dans la zone (détection spatiale OSM)
      if (detectedOsmFeaturesRef.current && detectedOsmFeaturesRef.current.length > 0) {
        detectedOsmFeaturesRef.current.forEach(f => {
          let lngLat: [number, number] | null = null;
          if (f.properties?.centroid && Array.isArray(f.properties.centroid)) {
            lngLat = [f.properties.centroid[0], f.properties.centroid[1]];
          } else if (f.geometry) {
            try {
              const c = turf.centroid(f as any);
              if (c?.geometry?.coordinates) {
                lngLat = [c.geometry.coordinates[0], c.geometry.coordinates[1]];
              }
            } catch (e) {}
          }

          if (!lngLat || isNaN(lngLat[0]) || isNaN(lngLat[1])) return;
          const featId = String(f.id || f.properties?.id);
          const isSel = selectedId === featId;
          if (!isSel && !isPointInView(lngLat[0], lngLat[1])) return;

          const key = `${lngLat[0].toFixed(6)}_${lngLat[1].toFixed(6)}`;
          if (seenCoords.has(key)) return;
          seenCoords.add(key);

          features.push({
            type: 'Feature',
            id: `centroid-osm-${featId}`,
            properties: {
              id: featId,
              name: f.properties?.osm_id ? `OSM #${f.properties.osm_id}` : 'Polygone Détecté',
              short_coords: `${lngLat[1].toFixed(5)}, ${lngLat[0].toFixed(5)}`,
              is_selected: isSel,
              is_courtyard: false,
              is_child: false,
              source_type: 'osm_detected'
            },
            geometry: {
              type: 'Point',
              coordinates: lngLat
            }
          });
        });
      }

      const sourceData = {
        type: 'FeatureCollection' as const,
        features
      };

      if (existingSource) {
        existingSource.setData(sourceData);
      } else {
        mapInstance.addSource('fixed-gps-centroids-source', {
          type: 'geojson',
          data: sourceData
        });
      }

      // Halo externe pulsant
      if (!mapInstance.getLayer('fixed-gps-centroids-halo')) {
        mapInstance.addLayer({
          id: 'fixed-gps-centroids-halo',
          type: 'circle',
          source: 'fixed-gps-centroids-source',
          minzoom: CONCESSION_VIEW_MIN_ZOOM,
          paint: {
            'circle-radius': [
              'case',
              ['boolean', ['get', 'is_selected'], false],
              14,
              8
            ],
            'circle-color': [
              'case',
              ['boolean', ['get', 'is_selected'], false],
              '#f97316',
              '#06b6d4'
            ],
            'circle-opacity': 0.3,
            'circle-blur': 0.7
          }
        });
      }

      // Anneau du GPS fixe (géodésique)
      if (!mapInstance.getLayer('fixed-gps-centroids-circle')) {
        mapInstance.addLayer({
          id: 'fixed-gps-centroids-circle',
          type: 'circle',
          source: 'fixed-gps-centroids-source',
          minzoom: CONCESSION_VIEW_MIN_ZOOM,
          paint: {
            'circle-radius': [
              'case',
              ['boolean', ['get', 'is_selected'], false],
              6.5,
              4.5
            ],
            'circle-color': [
              'case',
              ['boolean', ['get', 'is_selected'], false],
              '#ea580c',
              '#0284c7'
            ],
            'circle-stroke-width': 2.0,
            'circle-stroke-color': '#ffffff'
          }
        });
      }

      // Point central (croisée géodésique GPS)
      if (!mapInstance.getLayer('fixed-gps-centroids-dot')) {
        mapInstance.addLayer({
          id: 'fixed-gps-centroids-dot',
          type: 'circle',
          source: 'fixed-gps-centroids-source',
          minzoom: CONCESSION_VIEW_MIN_ZOOM,
          paint: {
            'circle-radius': 1.8,
            'circle-color': '#ffffff'
          }
        });
      }

      // Label des coordonnées GPS précises au zoom suffisant
      if (!mapInstance.getLayer('fixed-gps-centroids-label')) {
        mapInstance.addLayer({
          id: 'fixed-gps-centroids-label',
          type: 'symbol',
          source: 'fixed-gps-centroids-source',
          minzoom: 16.5,
          layout: {
            'text-field': ['get', 'short_coords'],
            'text-size': 9,
            'text-offset': [0, 1.4],
            'text-anchor': 'top',
            'text-allow-overlap': false
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#0f172a',
            'text-halo-width': 2.0
          }
        });

        // Curseur interactif
        mapInstance.on('mouseenter', 'fixed-gps-centroids-circle', () => {
          mapInstance.getCanvas().style.cursor = 'pointer';
        });
        mapInstance.on('mouseleave', 'fixed-gps-centroids-circle', () => {
          mapInstance.getCanvas().style.cursor = '';
        });
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('Style is not done loading') || msg.includes('not done loading')) {
        if (retryCount < 20) {
          setTimeout(() => {
            syncFixedGpsCentroidsLayer(mapInstance, buildingsList, custom3DList, selectedId, retryCount + 1);
          }, 150);
        }
      } else {
        console.warn("Erreur synchronisation layer fixed-gps-centroids:", err);
      }
    }
  };

  // Rafraîchisseur unifié de toutes les couches de concessions et volumes dans le viewport
  const refreshViewportConcessionsAndBuildings = useCallback((mapInstance: mapboxgl.Map) => {
    if (!mapInstance) return;
    syncCourtyardsLayer(mapInstance, buildingsRef.current);
    syncCustom3DBuildingsLayer(mapInstance, custom3DBuildingsRef.current, highlighted3DBuildingIdRef.current);
    enforceBuildingsAboveCourtyardsOrder(mapInstance);
    syncEntryPointsLayer(mapInstance, buildingsRef.current);
    syncFixedGpsCentroidsLayer(
      mapInstance,
      buildingsRef.current,
      custom3DBuildingsRef.current,
      selectedBuildingRef.current?.id || clickedCoordsRef.current?.buildingId
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

      const is3D = is3DDrawModeRef.current;
      const is2D = isDrawModeRef.current;

      if (!is3D && !is2D) {
        drawSource.setData({
          type: 'FeatureCollection',
          features: []
        });
        return;
      }

      const points = is3D ? drawPoints3DRef.current : drawPointsRef.current;
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

  // Synchronisation du tracé 3D lors du changement de points
  useEffect(() => {
    if (is3DDrawMode) {
      renderDrawRubberbandPreview();
    }
  }, [drawPoints3D, is3DDrawMode, renderDrawRubberbandPreview]);

  // Synchronisation de la délimitation libre OSM lors du changement de points
  useEffect(() => {
    if (isDrawMode) {
      renderDrawRubberbandPreview();
    }
  }, [drawPoints, isDrawMode, renderDrawRubberbandPreview]);

  // Nettoyage de la source de dessin lorsque les modes sont quittés
  useEffect(() => {
    if (!isDrawMode && !is3DDrawMode && mapRef.current) {
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
  }, [isDrawMode, is3DDrawMode]);

  // Finalisation et validation du dessin libre personnalisé
  const handleFinalizeCustomDraw = useCallback(() => {
    const points = drawPointsRef.current;
    if (points.length < 3) return;

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
    let finalArea = areaVal;
    let finalBuildingId: string | number = "Zone Dessinée Librement";
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

    addApiLog('DRAW_COMPLETE_DIRECT', `/map/draw/validate`, null, { 
      area: areaVal,
      buildingId: customDrawUniqueId,
      message: "Contour validé directement."
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
    addApiLog('SET_STYLE', `/map/style/${styleId}`, null, { success: true });
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
  const handleGetLocation = () => {
    setIsLocating(true);
    addApiLog('GEOLOCATION', '/client/gps', null, { status: 'Requesting permission' });

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ latitude, longitude });
          setIsLocating(false);

          if (mapRef.current && typeof longitude === 'number' && typeof latitude === 'number' && !isNaN(longitude) && !isNaN(latitude)) {
            try {
              mapRef.current.flyTo({
                center: [longitude, latitude],
                zoom: 16,
                pitch: currentStyle === 'satellite' ? 0 : 45,
                bearing: currentStyle === 'satellite' ? 0 : undefined,
                duration: 1500
              });
            } catch (e) {
              console.warn("flyTo failed:", e);
            }
          }
          addApiLog('GEOLOCATION', '/client/gps', null, { 
            status: 'Success', 
            coords: { lat: latitude, lng: longitude },
            simulated: false 
          });
          setMapNotification({
            type: 'success',
            title: 'GPS Activé',
            message: 'Votre position de départ réelle a été identifiée avec succès !'
          });
        },
        (error) => {
          console.warn("Erreur GPS réelle:", error.message);
          setIsLocating(false);
          setMapNotification({
            type: 'warning',
            title: 'Erreur de Géolocalisation',
            message: `La détection de votre GPS a échoué (${error.message}). Veuillez autoriser la localisation ou lancer l'application en externe.`
          });
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      setIsLocating(false);
      setMapNotification({
        type: 'warning',
        title: 'Navigateur non compatible',
        message: 'La géolocalisation native n\'est pas supportée par votre navigateur.'
      });
    }
  };

  // Recherche dynamique des adresses nationales HailandCode
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);

    if (val.trim() === '') {
      setSearchSuggestions([]);
      return;
    }

    const query = val.toLowerCase();
    const filtered = buildings.filter(b => {
      const hCode = b.hailand_code ? b.hailand_code.toLowerCase() : '';
      const adminCode = b.admin_address_code ? b.admin_address_code.toLowerCase() : '';
      const formattedAddr = b.formatted_address ? b.formatted_address.toLowerCase() : '';
      const bId = b.id.toLowerCase();
      const landmark = b.landmark_note ? b.landmark_note.toLowerCase() : '';
      const access = b.access_note ? b.access_note.toLowerCase() : '';
      const commune = b.commune ? b.commune.toLowerCase() : '';
      const quartier = b.quartier ? b.quartier.toLowerCase() : '';
      
      const occupantName = profiles.find(p => p.id === b.claimed_by || p.id === b.submitted_by)?.full_name?.toLowerCase() || '';

      return hCode.includes(query) || 
             adminCode.includes(query) ||
             formattedAddr.includes(query) ||
             bId.includes(query) || 
             landmark.includes(query) || 
             access.includes(query) || 
             commune.includes(query) || 
             quartier.includes(query) ||
             occupantName.includes(query);
    });
    setSearchSuggestions(filtered);
  };

  // Sélectionner un bâtiment depuis les suggestions de recherche
  const selectBuildingFromSearch = (b: Building) => {
    if (!b || !b.centroid || !b.centroid.coordinates) {
      console.warn("Bâtiment sélectionné avec coordonnées invalides:", b);
      return;
    }
    const bLng = b.centroid.coordinates[0];
    const bLat = b.centroid.coordinates[1];

    setSelectedBuilding(b);
    setSearchQuery(b.hailand_code || b.id);
    setSearchSuggestions([]);
    setClickedCoords(null);

    const isCourtyard = Boolean(b.has_courtyard) || selectionTargetNatureRef.current === 'courtyard';

    // Mettre en surbrillance le polygone 3D d'habitation ou en dessiner un par défaut
    if (mapRef.current) {
      const selectionSource = mapRef.current.getSource('selected-building') as mapboxgl.GeoJSONSource;
      if (selectionSource && b.geom) {
        selectionSource.setData({
          type: 'Feature',
          properties: {
            is_courtyard: isCourtyard
          },
          geometry: b.geom
        });
      }
    }

    // Repositionner le marqueur de maison orange uniquement pour les bâtiments uniques (pas pour les cours)
    if (mapRef.current) {
      if (isCourtyard) {
        if (markerRef.current) {
          markerRef.current.remove();
          markerRef.current = null;
        }
      } else {
        if (markerRef.current) {
          markerRef.current.setLngLat([bLng, bLat]);
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
            .setLngLat([bLng, bLat])
            .addTo(mapRef.current);
          markerRef.current = marker;
        }
      }

      try {
        mapRef.current.flyTo({
          center: [bLng, bLat],
          zoom: 17.5,
          pitch: currentStyle === 'satellite' ? 0 : 62,
          bearing: currentStyle === 'satellite' ? 0 : 45,
          duration: 1500
        });
      } catch (e) {
        console.warn("flyTo failed:", e);
      }
    }

    addApiLog('GET_BUILDING', `/api/v1/buildings/${b.id}`, null, b);

    // Calculer automatiquement l'itinéraire si nous avons une position utilisateur
    if (userLocation) {
      calculateRoute(userLocation, bLat, bLng, b.id);
    }
  };

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
      const payload = {
        id: newBuilding.id,
        hailand_code: newBuilding.hailand_code,
        admin_address_code: newBuilding.admin_address_code,
        formatted_address: newBuilding.formatted_address,
        zone_code: newBuilding.zone_code,
        building_type: newBuilding.building_type,
        floor_level: newBuilding.floor_level,
        unit_code: newBuilding.unit_code,
        centroid: newBuilding.centroid,
        date_creation: newBuilding.created_at,
        statut: newBuilding.status,
        nom_occupant: newBuilding.landmark_note,
        remarques: newBuilding.access_note,
        polygon_geometry: newBuilding.geom,
        commune: newBuilding.commune,
        quartier: newBuilding.quartier,
        prefecture: newBuilding.prefecture,
        region: newBuilding.region,
      };

      addApiLog('POST', `/api/v3/buildings`, payload, {
        message: "Concession/Bâtiment enregistré et adressé (Double Système : Grille 200m + Hiérarchie Administrative État).",
        id: newBuilding.id,
        hailand_code: newBuilding.hailand_code,
        admin_address_code: newBuilding.admin_address_code,
        database_insert: "PENDING",
        rows_affected: 0
      });

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
        const res = await insertBuildingInSupabase(newBuilding);
        if (res.success && !res.localOnly) {
          addApiLog('POST_SUCCESS', `/api/v3/buildings/success`, null, {
            message: "Enregistrement persistant confirmé dans la base de données réelle Supabase !",
            id: newBuilding.id,
            hailand_code: newBuilding.hailand_code,
            database_insert: "CONFIRMED",
            rows_affected: 1
          });
        } else {
          addApiLog('POST_LOCAL_FALLBACK', `/api/v3/buildings/local`, null, {
            message: "Enregistrement sauvegardé localement (mode hors-ligne ou table non initialisée).",
            id: newBuilding.id,
            hailand_code: newBuilding.hailand_code,
            error: res.error || "Offline fallback"
          });
        }
      } catch (err: any) {
        addApiLog('POST_ERROR', `/api/v3/buildings/error`, null, {
          message: "Erreur d'enregistrement réseau, conservé localement.",
          error: err.message || err
        });
      }
    }

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

    // Si on a déjà notre position, on calcule direct ou on propose
    const primary = listToInsert[0];
    if (userLocation && primary?.centroid?.coordinates) {
      calculateRoute(userLocation, primary.centroid.coordinates[1], primary.centroid.coordinates[0], primary.id);
    }
  };

  // Calcul d'itinéraire avec l'API Directions de Mapbox (Module 2)
  const calculateRoute = async (start: { latitude: number; longitude: number }, endLat: number, endLng: number, endId: string) => {
    setRouteLoading(true);
    setRouteError(null);
    addApiLog('DIRECTIONS_REQUEST', `/client/route`, { start, end: { lat: endLat, lng: endLng } });

    try {
      const profile = 'driving'; // driving, walking, cycling
      const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${start.longitude},${start.latitude};${endLng},${endLat}?geometries=geojson&overview=full&access_token=${accessToken}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error("Impossible de joindre le service d'itinéraire de Mapbox");
      }

      const data = await response.json();
      
      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        throw new Error("Aucun itinéraire routier trouvé par Mapbox pour ces points");
      }

      const route = data.routes[0];
      const distance = route.distance; // en mètres
      const duration = route.duration; // en secondes
      const routeCoords = route.geometry.coordinates as [number, number][];

      setRouteInfo({
        distance,
        duration,
        coordinates: routeCoords
      });

      // Mettre à jour la couche d'itinéraire sur la carte
      if (mapRef.current) {
        const routeGeoJSON = {
          type: 'Feature' as const,
          properties: {},
          geometry: {
            type: 'LineString' as const,
            coordinates: routeCoords
          }
        };

        const source = mapRef.current.getSource('route') as mapboxgl.GeoJSONSource;
        if (source) {
          source.setData(routeGeoJSON);
        }

        // Ajuster la caméra pour englober tout l'itinéraire
        if (routeCoords && routeCoords.length >= 2) {
          const bounds = new mapboxgl.LngLatBounds();
          let hasValidCoords = false;
          routeCoords.forEach(coord => {
            if (coord && typeof coord[0] === 'number' && typeof coord[1] === 'number' && !isNaN(coord[0]) && !isNaN(coord[1])) {
              bounds.extend(coord);
              hasValidCoords = true;
            }
          });
          
          if (hasValidCoords && !bounds.isEmpty()) {
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();
            if (sw && ne && typeof sw.lng === 'number' && typeof sw.lat === 'number' && !isNaN(sw.lng) && !isNaN(sw.lat) && !isNaN(ne.lng) && !isNaN(ne.lat)) {
              try {
                mapRef.current.fitBounds(bounds, {
                  padding: { top: 80, bottom: 80, left: 80, right: 80 },
                  duration: 1200
                });
              } catch (e) {
                console.warn("fitBounds failed:", e);
              }
            }
          }
        }
      }

      addApiLog('DIRECTIONS_RESPONSE', `/api/v1/routes`, null, {
        distance_km: (distance / 1000).toFixed(2),
        duration_min: Math.round(duration / 60),
        points_count: routeCoords.length
      });

    } catch (err: any) {
      console.warn("Calcul itinéraire échoué:", err.message);
      setRouteError(err.message || "Erreur lors du calcul d'itinéraire");
      
      // Tracer une ligne directe simulée (ligne droite élégante en pointillé) en guise de repli
      // pour que l'app soit résiliente et interactive
      drawFallbackDirectLine(start, endLat, endLng);
    } finally {
      setRouteLoading(false);
    }
  };

  // Ligne directe de repli en cas de problème de réseau Mapbox ou point hors-réseau routier
  const drawFallbackDirectLine = (start: { latitude: number; longitude: number }, endLat: number, endLng: number) => {
    if (!mapRef.current) return;

    // Calculer distance d'un point A à un point B de façon simplifiée
    const R = 6371e3; // Rayon de la terre en mètres
    const phi1 = start.latitude * Math.PI/180;
    const phi2 = endLat * Math.PI/180;
    const deltaPhi = (endLat-start.latitude) * Math.PI/180;
    const deltaLambda = (endLng-start.longitude) * Math.PI/180;
    const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // en mètres
    const duration = distance / 11; // Vitesse de livraison moyenne 40km/h (11 m/s)

    const routeCoords: [number, number][] = [
      [start.longitude, start.latitude],
      [endLng, endLat]
    ];

    setRouteInfo({
      distance,
      duration,
      coordinates: routeCoords
    });

    const routeGeoJSON = {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: routeCoords
      }
    };

    const source = mapRef.current.getSource('route') as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData(routeGeoJSON);
    }

    addApiLog('ROUTE_FALLBACK', `/api/v1/routes/fallback`, { method: "DirectLine" }, {
      distance_km: (distance / 1000).toFixed(2),
      status: "Calcul d'itinéraire direct cartographié car points isolés."
    });
  };

  // Calcul de relèvement angulaire (bearing) entre deux coordonnées
  const getBearingBetweenPoints = (pt1: [number, number], pt2: [number, number]): number => {
    const lon1 = pt1[0] * Math.PI / 180;
    const lat1 = pt1[1] * Math.PI / 180;
    const lon2 = pt2[0] * Math.PI / 180;
    const lat2 = pt2[1] * Math.PI / 180;
    const dLon = lon2 - lon1;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const brng = Math.atan2(y, x) * 180 / Math.PI;
    return (brng + 360) % 360;
  };

  // Calcul de distance Harversine
  const getDistanceBetweenPoints = (pt1: [number, number], pt2: [number, number]): number => {
    const R = 6371000; // Rayon de la Terre en mètres
    const phi1 = pt1[1] * Math.PI / 180;
    const phi2 = pt2[1] * Math.PI / 180;
    const deltaPhi = (pt2[1] - pt1[1]) * Math.PI / 180;
    const dLambda = (pt2[0] - pt1[0]) * Math.PI / 180;
    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Générateur intelligent de feuille de route professionnelle (Turn-by-turn)
  const generateGuidanceList = (coords: [number, number][]): string[] => {
    if (coords.length < 2) return ["Démarrer l'itinéraire de livraison."];
    
    const steps: string[] = [];
    steps.push("📦 Chargement du colis et initialisation sécurisée du traceur HailandMap.");

    const totalPoints = coords.length;
    const segmentCount = 6;
    const stepSize = Math.max(1, Math.floor(totalPoints / segmentCount));

    for (let i = 1; i < segmentCount; i++) {
      const idx = i * stepSize;
      if (idx >= totalPoints - 1) break;
      
      const pPrev = coords[idx - 1];
      const pCurr = coords[idx];
      const pNext = coords[idx + 1];
      
      const bearing1 = getBearingBetweenPoints(pPrev, pCurr);
      const bearing2 = getBearingBetweenPoints(pCurr, pNext);
      const diff = ((bearing2 - bearing1 + 540) % 360) - 180;

      if (diff > 25) {
        steps.push(`↪️ Tourner à droite sur le prochain tronçon modélisé`);
      } else if (diff < -25) {
        steps.push(`↩️ Prendre à gauche à l'intersection`);
      } else {
        const choices = [
          "🛣️ Poursuivre tout droit sur la voie optimisée",
          "📡 Synchronisation de l'altitude du signal GPS professionnel",
          "⚡ Vitesse de croisière optimale de livraison",
          "📍 Entrée imminente dans la zone d'adressage"
        ];
        steps.push(choices[i % choices.length]);
      }
    }

    steps.push("🎯 Destination finale identifiée par triangulation cadastrale");
    steps.push("🏠 Approche de la toiture : Scellage géospatial HailandMap en cours");
    return steps;
  };

  // Synchronisation dynamique du marqueur en fonction des mouvements réels du GPS de l'utilisateur ou clic sur carte
  const handleRealUserLocationChange = (latitude: number, longitude: number, speed?: number | null, heading?: number | null) => {
    if (!selectedBuilding) return;

    setUserLocation({ latitude, longitude });
    const userCoords: [number, number] = [longitude, latitude];

    // 1. Déplacer ou créer le marqueur du livreur réel
    const bearingVal = heading !== null && heading !== undefined ? heading : 0;
    createOrUpdateCourierMarker(userCoords, bearingVal);

    // 2. Si un itinéraire est tracé, calculer les métriques de télémétrie réelles par projection sur la géométrie
    if (routeInfo && routeInfo.coordinates.length >= 2) {
      const coords = routeInfo.coordinates;
      const nearestIdx = findNearestRouteIndex(coords, userCoords);

      // Calculer la distance restante le long du chemin à partir de cet index le plus proche
      let remDist = 0;
      for (let i = nearestIdx; i < coords.length - 1; i++) {
        remDist += getDistanceBetweenPoints(coords[i], coords[i + 1]);
      }
      setTelemetryDistanceLeft(remDist);

      // Temps estimé restant (sur la base d'une vitesse de croisière classique ou du reste de la route)
      const ratio = nearestIdx / (coords.length - 1 || 1);
      const remTime = Math.max(0, routeInfo.duration * (1 - ratio));
      setTelemetryTimeLeft(remTime);

      // Définir la vitesse instantanée moyenne ou celle du GPS
      const speedKmh = speed ? Math.round(speed * 3.6) : (remDist < 10 ? 0 : 38);
      setTelemetrySpeed(speedKmh);

      // Mise à jour de la feuille de route Turn-By-Turn dynamique
      const generatedG = guidanceList.length > 0 ? guidanceList : generateGuidanceList(coords);
      if (guidanceList.length === 0) setGuidanceList(generatedG);

      const stepIdx = Math.min(generatedG.length - 1, Math.floor(ratio * generatedG.length));
      if (generatedG[stepIdx]) {
        setActiveGuidanceText(generatedG[stepIdx]);
      }

      // 3. Détecter si l'utilisateur est arrivé (distance < 15 mètres de l'adresse ciblée)
      const flightDistanceToDestination = calculateDistance(latitude, longitude, selectedBuilding.centroid.coordinates[1], selectedBuilding.centroid.coordinates[0]);
      if (flightDistanceToDestination < 15 && trackingStatus !== 'arrived') {
        setTrackingStatus('arrived');
        setTelemetrySpeed(0);
        setTelemetryDistanceLeft(0);
        setTelemetryTimeLeft(0);
        setActiveGuidanceText("🏆 Vous êtes arrivé à destination ! Triangulation cadastrale HailandMap confirmée.");
        
        addApiLog('TRACKING_COMPLETE_GPS_REAL', `/api/v1/tracking/success`, {
          gpsArrival: true,
          destinationCoords: [selectedBuilding.centroid.coordinates[0], selectedBuilding.centroid.coordinates[1]]
        });

        // Lancer la magnifique rotation d'orbite à l'arrivée
        if (mapRef.current) {
          let orbitAngle = mapRef.current.getBearing();
          let frame = 0;
          const targetCoords = [selectedBuilding.centroid.coordinates[0], selectedBuilding.centroid.coordinates[1]] as [number, number];

          const startOrbit = () => {
            if (!mapRef.current) return;
            orbitAngle = (orbitAngle + 1.2) % 360;
            mapRef.current.setBearing(orbitAngle);
            mapRef.current.setCenter(targetCoords);
            mapRef.current.setZoom(19.3);
            mapRef.current.setPitch(65);
            frame++;
            if (frame < 180) {
              requestAnimationFrame(startOrbit);
            }
          };
          requestAnimationFrame(startOrbit);
        }
      } else if (trackingStatus === 'idle' || trackingStatus === 'arrived') {
        setTrackingStatus('running');
      }

      // 4. Mettre à jour la caméra 3D selon les préférences choisies
      if (mapRef.current) {
        let finalBearing = bearingVal;
        if (bearingVal === 0 && nearestIdx < coords.length - 1) {
          finalBearing = getBearingBetweenPoints(coords[nearestIdx], coords[nearestIdx + 1]);
        }

        if (trackingCameraMode === 'chase') {
          mapRef.current.easeTo({
            center: userCoords,
            zoom: 18.5,
            pitch: 62,
            bearing: finalBearing,
            duration: 350,
            essential: true
          });
        } else if (trackingCameraMode === 'orbit') {
          orbitAngleRef.current = (orbitAngleRef.current + 2) % 360;
          mapRef.current.easeTo({
            center: userCoords,
            zoom: 18.0,
            pitch: 54,
            bearing: orbitAngleRef.current,
            duration: 350,
            essential: true
          });
        } else if (trackingCameraMode === 'overhead') {
          mapRef.current.easeTo({
            center: userCoords,
            zoom: 17.0,
            pitch: 5,
            bearing: 0,
            duration: 350,
            essential: true
          });
        } else {
          // Free mode, center on user without locking camera orientation
          mapRef.current.easeTo({
            center: userCoords,
            duration: 350,
            essential: true
          });
        }
      }
    }
  };

  // Trouver l'index de coordonnées d'itinéraire le plus proche de la position GPS
  const findNearestRouteIndex = (coords: [number, number][], userCoords: [number, number]): number => {
    let minDistance = Infinity;
    let nearestIndex = 0;
    for (let i = 0; i < coords.length; i++) {
      const dist = getDistanceBetweenPoints(coords[i], userCoords);
      if (dist < minDistance) {
        minDistance = dist;
        nearestIndex = i;
      }
    }
    return nearestIndex;
  };

  useEffect(() => {
    isGpsTrackingActiveRef.current = isGpsTrackingActive;
  }, [isGpsTrackingActive]);

  useEffect(() => {
    isVirtualGpsActiveRef.current = isVirtualGpsActive;
  }, [isVirtualGpsActive]);

  useEffect(() => {
    handleRealUserLocationChangeRef.current = handleRealUserLocationChange;
  });

  // Création / Déplacement du marqueur dynamique de suivi (Point bleu style Google Maps avec faisceau)
  const createOrUpdateCourierMarker = (lngLat: [number, number], angle: number = 0) => {
    if (!mapRef.current) return;

    if (courierMarkerRef.current) {
      courierMarkerRef.current.setLngLat(lngLat);
      const headingElement = document.getElementById('gmaps-heading-beam');
      if (headingElement) {
        headingElement.style.transform = `rotate(${angle}deg)`;
        headingElement.style.display = angle ? 'flex' : 'none';
      }
    } else {
      const el = document.createElement('div');
      el.className = 'google-maps-tracking-marker';
      el.innerHTML = `
        <div class="relative flex items-center justify-center pointer-events-none select-none" style="width: 36px; height: 36px;">
          <!-- Faisceau directionnel Google Maps si cap disponible -->
          <div id="gmaps-heading-beam" class="absolute inset-0 flex items-center justify-center transition-transform duration-200 pointer-events-none" style="transform: rotate(${angle}deg); ${angle ? 'display: flex;' : 'display: none;'}">
            <svg viewBox="0 0 40 40" class="w-9 h-9 -translate-y-2 opacity-50">
              <defs>
                <linearGradient id="gmaps-beam-grad" x1="50%" y1="100%" x2="50%" y2="0%">
                  <stop offset="0%" stop-color="#1a73e8" stop-opacity="0.7"/>
                  <stop offset="100%" stop-color="#1a73e8" stop-opacity="0"/>
                </linearGradient>
              </defs>
              <polygon points="20,20 6,0 34,0" fill="url(#gmaps-beam-grad)"/>
            </svg>
          </div>

          <!-- Halo de pulsation radar Google Maps -->
          <div class="absolute w-8 h-8 rounded-full bg-blue-500/25 animate-ping pointer-events-none"></div>

          <!-- Point bleu officiel Google Maps -->
          <div class="relative w-[16px] h-[16px] bg-[#1a73e8] rounded-full border-[2.5px] border-white shadow-[0_1px_4px_rgba(0,0,0,0.35),0_0_8px_rgba(26,115,232,0.5)] z-10 flex items-center justify-center">
            <div class="w-1.5 h-1.5 bg-white/40 rounded-full"></div>
          </div>
        </div>
      `;
      const marker = new mapboxgl.Marker({ 
        element: el,
        anchor: 'center'
      })
        .setLngLat(lngLat)
        .addTo(mapRef.current);
      courierMarkerRef.current = marker;
    }
  };

  // Démarrer le suivi d'itinéraire réel (Live GPS Watcher)
  const handleStartTracking = () => {
    if (!selectedBuilding || !routeInfo) return;

    setTrackingStatus('running');
    setIsGpsTrackingActive(true);

    const generatedGuidance = guidanceList.length > 0 ? guidanceList : generateGuidanceList(routeInfo.coordinates);
    if (guidanceList.length === 0) {
      setGuidanceList(generatedGuidance);
    }

    addApiLog('TRACKING_GPS_REAL_START', `/api/v1/tracking/start-real`, {
      cameraMode: trackingCameraMode,
      addressId: selectedBuilding.id
    });

    // 1. Essayer d'initialiser immédiatement avec la position de l'utilisateur s'il y en a une
    if (userLocation) {
      handleRealUserLocationChange(userLocation.latitude, userLocation.longitude, null, 0);
    }

    // 2. Lancer un watchPosition géospatial de haute précision
    if (navigator.geolocation) {
      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      }

      gpsWatchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, speed, heading } = position.coords;
          handleRealUserLocationChange(latitude, longitude, speed, heading);
        },
        (error) => {
          console.warn("Erreur de rafraîchissement GPS réel:", error.message);
          addApiLog('GPS_REALTIME_ERROR', `/client/gps/error`, { message: error.message });
          
          setMapNotification({
            type: 'warning',
            title: 'Signal GPS Réel Faible',
            message: `Le GPS physique n'a pas pu s'actualiser : ${error.message}. Vous pouvez utiliser le clic sur la carte pour simuler la progression de l'itinéraire.`
          });
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setMapNotification({
        type: 'warning',
        title: 'GPS absent ou bloqué',
        message: "L'API de géolocalisation n'est pas prise en charge. Veuillez utiliser le mode clic ou démarrer l'application depuis un smartphone."
      });
    }
  };

  // Arrêter le suivi GPS
  const handlePauseTracking = () => {
    if (gpsWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }
    setTrackingStatus('idle');
    setIsGpsTrackingActive(false);
    setTelemetrySpeed(0);
    addApiLog('TRACKING_GPS_STOPPED', `/api/v1/tracking/stop`, { status: "paused" });
  };

  // Réinitialiser le suivi et tracer de nouveau depuis la dernière position
  const handleResetTracking = () => {
    if (gpsWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }
    setIsGpsTrackingActive(false);
    setTrackingStatus('idle');
    setTelemetrySpeed(0);
    setTelemetryDistanceLeft(routeInfo ? routeInfo.distance : 0);
    setTelemetryTimeLeft(routeInfo ? routeInfo.duration : 0);
    setActiveGuidanceText("Suivi réinitialisé. En attente d'activation GPS.");
    
    if (routeInfo && routeInfo.coordinates.length > 0) {
      createOrUpdateCourierMarker(routeInfo.coordinates[0], 0);
      if (mapRef.current) {
        mapRef.current.flyTo({
          center: routeInfo.coordinates[0],
          zoom: 16.5,
          pitch: 30,
          bearing: 0,
          duration: 1000
        });
      }
    }
    addApiLog('TRACKING_RESET', `/api/v1/tracking/reset`);
  };

  // Réinitialiser complètement le tracé et stopper tous les trackers GPS
  const clearRoute = () => {
    if (gpsWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }
    if (courierMarkerRef.current) {
      courierMarkerRef.current.remove();
      courierMarkerRef.current = null;
    }
    setIsGpsTrackingActive(false);
    setTrackingStatus('idle');
    setTelemetrySpeed(0);
    setTelemetryDistanceLeft(0);
    setTelemetryTimeLeft(0);
    setActiveGuidanceText("Guidage achevé. Veuillez sélectionner un point de livraison.");
    setGuidanceList([]);

    setRouteInfo(null);
    setRouteError(null);
    if (mapRef.current) {
      const source = mapRef.current.getSource('route') as mapboxgl.GeoJSONSource;
      if (source) {
        source.setData({
          type: 'FeatureCollection',
          features: []
        });
      }
    }
    addApiLog('ROUTE_CLEAR', `/map/route/clear`, null, { success: true });
  };

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
    addApiLog('GPS_RECENTER_START', '/client/gps/recenter', null, { status: 'Acquisition du signal GPS...' });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, heading } = position.coords;
        const validHeading = (heading !== null && typeof heading === 'number' && !isNaN(heading)) ? heading : 0;

        // 1. Mettre à jour l'état de localisation utilisateur (affiche automatiquement le point bleu Google Maps)
        setUserLocation({ latitude, longitude });

        // 2. Si le suivi d'itinéraire est en cours, synchroniser la télémétrie
        if (isGpsTrackingActiveRef.current && routeInfo) {
          handleRealUserLocationChangeRef.current(latitude, longitude, position.coords.speed, heading);
        }

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
        addApiLog('GPS_RECENTER_SUCCESS', '/client/gps/recenter', null, {
          status: 'Succès',
          coords: { latitude, longitude },
          zoom: 18
        });

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

        addApiLog('GPS_RECENTER_ERROR', '/client/gps/error', null, {
          code: error.code,
          message: error.message
        });

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
  }, [isRecentering, currentStyle, routeInfo]);

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
  const activeTool: AtelierTool | null = isDrawMode
    ? 'trace'
    : !isSelectionMode
      ? null
      : clickSelectionTarget === 'grid_cell'
        ? 'carreau'
        : selectionTargetNature === 'courtyard'
          ? 'concession'
          : 'batiment';

  const selectAtelierTool = (t: AtelierTool) => {
    setIsSelectionMode(true);
    setSelectedBuilding(null);
    setDrawPoints([]);
    setIsDrawMode(t === 'trace');
    if (t === 'carreau') {
      setClickSelectionTarget('grid_cell');
    } else if (t === 'batiment') {
      setClickSelectionTarget('building');
      setSelectionTargetNature('single');
    } else if (t === 'concession') {
      setClickSelectionTarget('building');
      setSelectionTargetNature('courtyard');
    }
    addApiLog('SET_ATELIER_TOOL', `/client/tool/${t}`, null, { tool: t });
  };

  const quitFreeDraw = () => {
    setIsDrawMode(false);
    setDrawPoints([]);
    const drawSource = mapRef.current?.getSource('draw-source') as mapboxgl.GeoJSONSource | undefined;
    if (drawSource) drawSource.setData({ type: 'FeatureCollection', features: [] });
    addApiLog('DRAW_RESET', `/map/draw/reset`, null, { success: true });
  };

  // Raccourcis clavier de l'Atelier v2 (V, B, C, P) : seulement sur la carte, hors champs de saisie.
  useEffect(() => {
    if (!uiV2 || activeAdminView !== 'carte') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
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
      {uiV2 && (
        <AtelierTopBar
          view={activeAdminView}
          adminName={currentAdmin.full_name}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onSearch={() => setActiveAdminView('carte')}
        />
      )}
      {!uiV2 && (
        <>
      {/* HEADER UNIFIÉ DE L'INTERFACE UNIQUE (GLASSMORPHISM FIN & MODERNE) */}
      <header className="h-14 flex items-center justify-between px-4 lg:px-6 bg-slate-900/80 backdrop-blur-md border-b border-slate-800/80 shrink-0 select-none z-50">
        <div className="flex items-center gap-4">
          {/* LOGO ÉPURÉ & MINIMALISTE */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <MapIcon className="w-4 h-4" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-xs font-bold tracking-tight text-white flex items-center gap-1.5 leading-none">
                HailandMap
                <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/10 font-mono font-bold">
                  SIG
                </span>
              </h1>
            </div>
          </div>
        </div>

        {/* ONGLES DE NAVIGATION COMPACTES ET SANS SOUFFLE INUTILE */}
        <nav className="flex items-center bg-slate-950/40 border border-slate-800/60 p-0.5 rounded-xl text-xs gap-0.5 max-w-[60%] overflow-x-auto scrollbar-none">
          {[
            { id: 'carte', label: 'Cartographie 3D', icon: <MapIcon className="w-3.5 h-3.5" /> },
            { id: 'validations', label: 'Modération', icon: <CheckCircle className="w-3.5 h-3.5" />, badge: pendingCount, badgeColor: 'bg-indigo-500 text-white font-semibold' },
            { id: 'batiments', label: 'Registre Cadastre', icon: <Building2 className="w-3.5 h-3.5" />, badge: conflictCount, badgeColor: 'bg-rose-500 text-white font-semibold' },
            { id: 'zones', label: 'Frontières Geofence', icon: <Layers className="w-3.5 h-3.5" /> },
            { id: 'dashboard', label: 'Tour de Contrôle', icon: <LayoutDashboard className="w-3.5 h-3.5" /> }
          ].map((tab) => {
            const isActive = activeAdminView === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveAdminView(tab.id as any);
                  setSelectedBuilding(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer whitespace-nowrap active:scale-95 ${
                  isActive
                    ? 'bg-slate-800 text-white shadow-sm border border-slate-700/50'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/20'
                }`}
              >
                {tab.icon}
                <span className="hidden lg:inline text-[11px]">{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className={`text-[9px] px-1.5 py-0.1 rounded-full ${tab.badgeColor}`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* DROITE DU HEADER : INFOS ET AVATAR */}
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-mono text-slate-500 hidden xl:inline">v6.0 PRO</span>
          
          {/* BOUTON PARAMÈTRES GLOBAUX ATELIER */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 rounded-lg bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-indigo-400 border border-slate-800/80 transition-all cursor-pointer active:scale-95 flex items-center justify-center"
            title="Paramètres de l'Atelier"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center gap-2 p-1 px-2 rounded-lg bg-slate-900/60 border border-slate-800/80">
            <div className="w-5.5 h-5.5 rounded bg-indigo-650 text-white flex items-center justify-center text-[10px] font-bold font-sans">
              {currentAdmin.full_name.split(' ').map((n) => n[0]).join('')}
            </div>
            <span className="hidden sm:inline text-[11px] font-medium text-slate-300">
              {currentAdmin.full_name}
            </span>
          </div>
        </div>
      </header>
        </>
      )}

      {/* CONTAINER MAÎTRE DES VUES (rail des modules en v2) */}
      <div className="flex min-h-0 flex-1">
        {uiV2 && (
          <ModuleRail
            view={activeAdminView}
            onViewChange={(v) => {
              setActiveAdminView(v);
              setSelectedBuilding(null);
            }}
            pendingCount={pendingCount}
            conflictCount={conflictCount}
          />
        )}
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
              
              {uiV2 && (
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
              )}

              {/* Overlay Backdrop de mise au point pour Mobile */}
              {isSidebarOpen && (
                <div 
                  onClick={() => setIsSidebarOpen(false)}
                  className="absolute inset-0 bg-black/60 backdrop-blur-xs z-30 md:hidden transition-opacity duration-300"
                />
              )}

              {/* 1. PANNEAU LATÉRAL GAUCHE DE CONTROLE DE L'APPLICATION */}
              <div 
                className={`absolute md:relative inset-y-0 left-0 z-40 bg-slate-900 border-r border-slate-800 flex flex-col shadow-2xl h-full transition-all duration-300 ease-in-out shrink-0
                  ${isSidebarOpen 
                    ? 'w-full sm:w-[390px] md:w-[390px] translate-x-0 opacity-100' 
                    : '-translate-x-full md:translate-x-0 md:w-0 overflow-hidden border-r-0 opacity-0 pointer-events-none'
                  }`}
              >
                
                {/* EN-TÊTE ULTRA-DISCRET */}
                <div className="p-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/40">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold">
                    Atelier de Contrôle
                  </span>
                  <button
                    onClick={() => setIsSidebarOpen(false)}
                    className="p-1.5 rounded-lg bg-slate-800/40 hover:bg-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer active:scale-95 flex items-center justify-center shrink-0"
                    title="Masquer le panneau"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                </div>

        {/* CONTENU AVEC BANDE DE DÉFILEMENT */}
        <div 
          ref={sidebarScrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar relative scroll-smooth"
        >
          
          {/* BARRE DE RECHERCHE D'ADRESSE UNIQUE */}
          <div className="relative">
            <label className="block text-xs font-mono font-medium text-slate-400 mb-1.5">Rechercher une Adresse Unique <span className="text-orange-400">*</span></label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
              <input
                type="text"
                placeholder="Renseignez un code (ex: HLM-CON-8720)..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="w-full bg-slate-950/80 border border-slate-700 rounded-xl pl-10 pr-9 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all font-mono"
              />
              {searchQuery && (
                <button 
                  onClick={() => { setSearchQuery(''); setSearchSuggestions([]); }} 
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Suggestions de recherche */}
            <AnimatePresence>
              {searchSuggestions.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="absolute left-0 right-0 mt-1.5 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-2xl z-20 max-h-56 overflow-y-auto"
                >
                  {searchSuggestions.map((b, sIdx) => {
                    const occupantName = profiles.find(p => p.id === b.claimed_by || p.id === b.submitted_by)?.full_name;
                    const displayName = b.landmark_note || occupantName || `Bâtiment ${b.building_type}`;
                    const dual = computeDualAddressing(b);
                    return (
                      <button
                        key={`sugg-${b.id || 'b'}-${b.hailand_code || sIdx}-${sIdx}`}
                        onClick={() => selectBuildingFromSearch(b)}
                        className="w-full px-4 py-3 hover:bg-slate-750/80 border-b border-slate-700/50 last:border-0 flex flex-col text-left transition-colors group"
                      >
                        <div className="flex justify-between items-center w-full">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-amber-400 group-hover:text-amber-300">
                              {b.hailand_code || dual.gridAddress.hailandCode}
                            </span>
                            {(b.admin_address_code || dual.adminAddress.adminAddressCode) && (
                              <span className="font-mono text-[10px] font-semibold text-cyan-400 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-500/20">
                                {b.admin_address_code || dual.adminAddress.adminAddressCode}
                              </span>
                            )}
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs font-medium text-slate-200 font-sans">{displayName}</span>
                          <span className="text-[10px] text-slate-400 font-sans">
                            {b.commune}{b.quartier ? ` · ${b.quartier}` : ''}
                          </span>
                        </div>
                        {b.access_note && (
                          <p className="text-[11px] text-slate-400 italic line-clamp-1 mt-0.5">{b.access_note}</p>
                        )}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* BANDEAU INTERACTIF MODE SÉLECTION DE ZONE (en v2 : remplacé par la barre d'outils de la carte) */}
          {!uiV2 && (
          <div className="p-3.5 bg-slate-950/50 border border-slate-800 rounded-2xl flex flex-col gap-2.5 shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-slate-300 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-orange-400" />
                MODE SÉLECTION DE ZONE
              </span>
              <button
                onClick={() => {
                  const nextMode = !isSelectionMode;
                  setIsSelectionMode(nextMode);
                  setIsDrawMode(false);
                  setDrawPoints([]);
                  addApiLog('SET_SELECTION_MODE', `/client/selection-mode/${nextMode}`, null, { active: nextMode });
                  if (!nextMode) {
                    setClickedCoords(null);
                    if (mapRef.current) {
                      const selSource = mapRef.current.getSource('selected-building') as mapboxgl.GeoJSONSource;
                      if (selSource) {
                        selSource.setData({
                          type: 'FeatureCollection',
                          features: []
                        });
                      }
                      const hoverSource = mapRef.current.getSource('hovered-building') as mapboxgl.GeoJSONSource;
                      if (hoverSource) {
                        hoverSource.setData({
                          type: 'FeatureCollection',
                          features: []
                        });
                      }
                      const drawSource = mapRef.current.getSource('draw-source') as mapboxgl.GeoJSONSource;
                      if (drawSource) {
                        drawSource.setData({
                          type: 'FeatureCollection',
                          features: []
                        });
                      }
                    }
                  }
                }}
                className={`py-1 px-3 rounded-lg text-[10px] font-bold font-display cursor-pointer transition-all ${
                  isSelectionMode 
                    ? 'bg-orange-500 text-slate-950 shadow shadow-orange-500/10 hover:bg-orange-400' 
                    : 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {isSelectionMode ? 'ACTIF' : 'ACTIVER'}
              </button>
            </div>

            {isSelectionMode && (
              <>
                {/* Sélecteur de nature : Bâtiment Unique vs Cour / Concession */}
                <div className="space-y-1.5 border-t border-slate-800/80 pt-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                      Nature de la cible
                    </span>
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-orange-400">
                      {selectionTargetNature === 'single' ? '🏢 Bâtisse Individuelle' : '🏡 Concession Partagée'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectionTargetNature('single')}
                      className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-[11px] font-bold font-display transition-all border cursor-pointer ${
                        selectionTargetNature === 'single'
                          ? 'bg-orange-500/20 border-orange-500 text-orange-300 shadow-md shadow-orange-500/10'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      <Building2 className={`w-3.5 h-3.5 ${selectionTargetNature === 'single' ? 'text-orange-400' : 'text-slate-500'}`} />
                      <span>Bâtiment Unique</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectionTargetNature('courtyard')}
                      className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-[11px] font-bold font-display transition-all border cursor-pointer ${
                        selectionTargetNature === 'courtyard'
                          ? 'bg-orange-500/20 border-orange-500 text-orange-300 shadow-md shadow-orange-500/10'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      <Home className={`w-3.5 h-3.5 ${selectionTargetNature === 'courtyard' ? 'text-orange-400' : 'text-slate-500'}`} />
                      <span>Cour / Concession</span>
                    </button>
                  </div>
                </div>

                {/* Mode Dessin Libre */}
                {!isDrawMode ? (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsDrawMode(true);
                        setDrawPoints([]);
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold font-mono transition-all border cursor-pointer bg-slate-900/80 border-slate-800 text-slate-300 hover:text-orange-400 hover:border-orange-500/40"
                    >
                      <PenTool className="w-3.5 h-3.5 text-orange-400" />
                      <span>Dessin Libre</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-2.5 bg-slate-900/95 border border-slate-700/80 rounded-xl space-y-2 mt-1 animate-fadeIn shadow-xl backdrop-blur-md">
                    <p className="text-[10px] font-sans text-slate-400">
                      Cliquez pour placer les sommets. Double-clic pour fermer.
                    </p>
                    <div className="flex items-center justify-between font-mono text-[10px] text-slate-300 bg-slate-950/80 p-1.5 rounded border border-slate-800">
                      <span>Sommets posés :</span>
                      <span className="font-bold text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700">{drawPoints.length}</span>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleFinalizeCustomDraw}
                        disabled={drawPoints.length < 3}
                        className={`flex-1 py-1.5 px-2.5 rounded-lg text-[10px] font-bold text-center transition-all flex items-center justify-center gap-1.5 shadow-sm ${
                          drawPoints.length >= 3 
                            ? 'bg-emerald-600 text-white cursor-pointer hover:bg-emerald-500 active:scale-95 ring-1 ring-white/20' 
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/60'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Valider ({drawPoints.length >= 3 ? `${Math.round(calculatePolygonArea([[...drawPoints, drawPoints[0]]]))} m²` : 'Min. 3 pts'})</span>
                      </button>
                      <button
                        onClick={() => {
                          if (drawPoints.length === 0) return;
                          setDrawPoints(prev => {
                            const next = prev.slice(0, -1);
                            addApiLog('DRAW_POINT_UNDO', `/map/draw/undo`, null, { total_points: next.length });
                            return next;
                          });
                        }}
                        disabled={drawPoints.length === 0}
                        className={`py-1.5 px-2 rounded-lg text-[10px] font-bold border flex items-center justify-center gap-1 transition-all ${
                          drawPoints.length > 0 
                            ? 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-200 cursor-pointer' 
                            : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                        }`}
                        title="Annuler le dernier point tracé"
                      >
                        <Undo2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Retour</span>
                      </button>
                      <button
                        onClick={() => {
                          setIsDrawMode(false);
                          setDrawPoints([]);
                          if (mapRef.current) {
                            const drawSource = mapRef.current.getSource('draw-source') as mapboxgl.GeoJSONSource;
                            if (drawSource) drawSource.setData({ type: 'FeatureCollection', features: [] });
                          }
                          addApiLog('DRAW_RESET', `/map/draw/reset`, null, { success: true });
                        }}
                        className="py-1.5 px-2.5 rounded-lg text-[10px] font-bold bg-slate-850 hover:bg-slate-750 border border-slate-800 text-slate-400 hover:text-white cursor-pointer transition"
                        title="Quitter le mode dessin"
                      >
                        Quitter
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          )}

          {/* SECTION CARTE INTERACTIVE & NAVIGATION GÉOSPATIALE HIÉRARCHIQUE (ÉTAPES 1-4) */}
          <div className="p-3.5 bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-slate-700/70 rounded-2xl flex flex-col gap-3 shadow-xl ring-1 ring-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-xl border transition-colors ${
                  isInteractiveMapActive 
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-sm shadow-emerald-500/20' 
                    : 'bg-slate-800/80 border-slate-700/80 text-slate-400'
                }`}>
                  <Compass className={`w-4 h-4 ${isInteractiveMapActive ? 'animate-pulse' : ''}`} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono font-bold text-white tracking-wide">
                      CARTE INTERACTIVE
                    </span>
                    {isInteractiveMapActive && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        ACTIF
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleToggleInteractiveMap}
                className={`py-1.5 px-3 rounded-xl text-[10px] font-bold font-display cursor-pointer transition-all shadow-md active:scale-95 flex items-center gap-1.5 shrink-0 ${
                  isInteractiveMapActive 
                    ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-emerald-500/20' 
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                <span>{isInteractiveMapActive ? 'DÉSACTIVER' : 'ACTIVER'}</span>
              </button>
            </div>

            {/* Fil d'Ariane / Badge d'état de l'entité ou des entités sélectionnées */}
            {isInteractiveMapActive && selectedTerritories.length > 0 && (
              <div className="p-2.5 bg-slate-950/90 border border-slate-800/90 rounded-xl flex flex-col gap-2 animate-fadeIn shadow-lg shadow-black/40">
                {selectedTerritories.length === 1 ? (
                  // Affichage pour un seul territoire actif
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 overflow-hidden text-xs min-w-0">
                      <span 
                        className="w-2.5 h-2.5 rounded-full shrink-0 animate-ping"
                        style={{ backgroundColor: TERRITORY_LEVEL_COLORS[selectedTerritories[0].level] }}
                      />
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1 text-[9px] font-mono text-slate-400 truncate">
                          <span className="uppercase font-bold text-slate-300">
                            {selectedTerritories[0].level}
                          </span>
                          {selectedTerritories[0].parentChain?.region && (
                            <span>• {selectedTerritories[0].parentChain.region.nom}</span>
                          )}
                          {selectedTerritories[0].parentChain?.commune && (
                            <span>› {selectedTerritories[0].parentChain.commune.nom}</span>
                          )}
                        </div>
                        <span className="font-bold text-white text-xs truncate">
                          {selectedTerritories[0].nom}
                          {selectedTerritories[0].code ? ` (${selectedTerritories[0].code})` : ''}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {selectedTerritories[0].totalBatiments3D !== undefined && selectedTerritories[0].totalBatiments3D > 0 && (
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                          {selectedTerritories[0].totalBatiments3D} bâtis 3D
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={handleClearTerritorySelection}
                        className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                        title="Désélectionner"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  // Affichage multi-territoires actifs
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="font-mono text-slate-200 text-[11px] font-bold">
                          {selectedTerritories.length} frontières actives simultanément
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            if (mapRef.current) {
                              zoomToTerritories(mapRef.current, selectedTerritories);
                            }
                          }}
                          className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-amber-400 bg-amber-950/60 border border-amber-500/30 hover:bg-amber-900/60 transition cursor-pointer"
                          title="Recentrer la caméra sur toutes les frontières sélectionnées"
                        >
                          Recentrer
                        </button>
                        <button
                          type="button"
                          onClick={handleClearTerritorySelection}
                          className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                          title="Tout désélectionner"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Pastilles avec suppression unitaire */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-h-24 flex-wrap no-scrollbar">
                      {selectedTerritories.map((t) => (
                        <div
                          key={`active-badge-${t.level}-${t.id}`}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900 border text-[10px] font-mono transition-all group"
                          style={{ borderColor: `${TERRITORY_LEVEL_COLORS[t.level]}60` }}
                        >
                          <span 
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: TERRITORY_LEVEL_COLORS[t.level] }}
                          />
                          <span 
                            onClick={() => {
                              if (mapRef.current) {
                                zoomToTerritory(mapRef.current, t);
                              }
                            }}
                            className="text-slate-200 font-semibold cursor-pointer hover:underline truncate max-w-[120px]"
                            title={`Cliquer pour zoomer sur ${t.nom}`}
                          >
                            {t.nom}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveSingleTerritory(t.id)}
                            className="text-slate-500 hover:text-rose-400 p-0.5 rounded transition cursor-pointer"
                            title={`Retirer ${t.nom}`}
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Menu déroulant hiérarchique tiroirs mère-enfant (Étape 2 & 3 Multi-Sélection) */}
            <AnimatePresence>
              {isInteractiveMapActive && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden pt-1"
                >
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* CRÉATION D'ADRESSE : Étape interactive par Clic (Module 1) */}
          <AnimatePresence mode="wait">
            {clickedCoords ? (
              <InteractiveBuildingForm
                clickedCoords={clickedCoords}
                buildings={buildings}
                onCancel={() => {
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
                  handleCreateBuilding(newB);
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
            ) : selectedBuilding ? (
              /* DÉTAIL DU BÂTIMENT EN VUE ACTIVE (Module 2) */
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700 shadow-xl"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex gap-2">
                    <div className="w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 mt-0.5 shrink-0">
                      <MapIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] font-mono text-orange-400 font-bold bg-orange-950/40 px-2 py-0.5 rounded-full border border-orange-500/10">
                        {selectedBuilding.hailand_code || `DRAFT-${selectedBuilding.id.substring(0, 6).toUpperCase()}`}
                      </span>
                      <h3 className="text-sm font-bold text-white font-display mt-1">
                        {selectedBuilding.landmark_note || profiles.find(p => p.id === selectedBuilding.claimed_by || p.id === selectedBuilding.submitted_by)?.full_name || `Bâtiment ${selectedBuilding.building_type}`}
                      </h3>
                    </div>
                  </div>
                  <button onClick={() => { setSelectedBuilding(null); clearRoute(); }} className="text-slate-400 hover:text-slate-200 shrink-0">
                    <X className="w-4.5 h-4.5" />
                  </button>
                </div>

                <p className="text-xs text-slate-300 italic mb-3 font-sans border-l-2 border-orange-500/50 pl-2">
                  "{selectedBuilding.access_note || 'Aucune note de livraison.'}"
                </p>

                <div className="p-2.5 bg-slate-950/40 rounded-xl mb-4 text-[11px] font-mono border border-slate-700 flex flex-col gap-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Coordonnées :</span>
                    <span className="text-slate-300">
                      {selectedBuilding.centroid.coordinates[1].toFixed(6)}, {selectedBuilding.centroid.coordinates[0].toFixed(6)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Créé le :</span>
                    <span className="text-slate-300">{new Date(selectedBuilding.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-800 pt-1.5 mt-1.5">
                    <span className="text-slate-500">Surface de toiture :</span>
                    <span className="text-orange-400 font-bold bg-orange-950/45 px-2 py-0.5 rounded text-[10px] border border-orange-500/15">
                      {safeCalculateArea(selectedBuilding.geom, 80).toLocaleString()} m²
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-800 pt-1.5 mt-1.5 items-center">
                    <span className="text-slate-500">Format stocké :</span>
                    <span className="text-emerald-400 font-bold bg-emerald-950/45 px-2 py-0.5 rounded text-[9px] border border-emerald-500/10">
                      POLYGONE GeoJSON
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-t border-slate-800 pt-1.5 mt-1.5">
                    <span className="text-slate-500">Statut :</span>
                    <span className="text-orange-400 font-bold text-[10px] bg-orange-950/50 border border-orange-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {selectedBuilding.status}
                    </span>
                  </div>
                </div>

                {/* OPTIONS D'ITINÉRAIRE */}
                <div className="space-y-2">
                  {!userLocation ? (
                    <div className="p-3 bg-slate-900 border border-slate-700 rounded-xl flex flex-col gap-2">
                      <p className="text-[11px] text-slate-400">
                        Pour tracer l'itinéraire de livraison, activez le module de localisation GPS réelle.
                      </p>
                      <button
                        onClick={recenterMap}
                        disabled={isRecentering}
                        className="w-full bg-slate-850 hover:bg-slate-700 border border-slate-700 text-slate-200 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                      >
                        {isRecentering ? (
                          <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                        ) : (
                          <LocateFixed className="w-4 h-4 text-blue-400" />
                        )}
                        Activer ma position GPS réelle
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs font-mono text-slate-400 bg-slate-950/30 p-2 rounded-lg border border-slate-800/80">
                        <span className="flex items-center gap-1 text-[11px]"><Compass className="w-3.5 h-3.5 text-emerald-400" /> Départ : Position GPS Réelle</span>
                        <button 
                          onClick={() => { setUserLocation(null); }} 
                          className="text-rose-400 hover:text-rose-300 hover:underline text-[10px]"
                        >
                          Désactiver
                        </button>
                      </div>

                      {/* Info d'itinéraire calculé */}
                      {routeLoading ? (
                        <div className="p-4 bg-slate-950 border border-slate-700 rounded-xl flex items-center justify-center gap-2">
                          <RefreshCw className="w-4 h-4 text-orange-400 animate-spin" />
                          <span className="text-xs font-mono text-slate-300">Traçage de la route API Mapbox...</span>
                        </div>
                      ) : routeInfo ? (
                        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3.5 shadow-2xl">
                          {/* En-tête de Suivi */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-cyan-400">
                              <Truck className="w-5 h-5" />
                              <span className="text-xs font-bold font-display uppercase tracking-wider">Suivi Pro d'Itinéraire</span>
                            </div>
                            {/* Statut dynamique */}
                            {isGpsTrackingActive ? (
                              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/45 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                SUIVI GPS ACTIF
                              </span>
                            ) : trackingStatus === 'arrived' ? (
                              <span className="text-[10px] font-bold text-cyan-400 bg-cyan-950/45 px-2 py-0.5 rounded border border-cyan-500/20 flex items-center gap-1">
                                <Check className="w-3 h-3" />
                                COLIS ARRIVÉ
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-800/50 px-2 py-0.5 rounded border border-slate-700/50">
                                PRÊT À SUIVRE
                              </span>
                            )}
                          </div>

                          {/* Grille de Télémétrie en temps réel */}
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="p-2 bg-slate-950/80 rounded-xl border border-slate-800 flex flex-col justify-center">
                              <div className="flex justify-center items-center gap-1 text-slate-500 mb-0.5">
                                <Gauge className="w-3 h-3" />
                                <span className="text-[9px] uppercase font-mono tracking-wider">Vitesse</span>
                              </div>
                              <span className="text-sm font-bold text-white font-mono">
                                {isGpsTrackingActive ? telemetrySpeed : 0} <span className="text-[10px] text-slate-400 font-normal">km/h</span>
                              </span>
                            </div>
                            <div className="p-2 bg-slate-950/80 rounded-xl border border-slate-800 flex flex-col justify-center">
                              <span className="text-[9px] text-slate-500 uppercase font-mono tracking-wider mb-0.5">Reste dist.</span>
                              <span className="text-sm font-bold text-cyan-400 font-mono">
                                {!isGpsTrackingActive ? (routeInfo.distance / 1000).toFixed(2) : (telemetryDistanceLeft / 1000).toFixed(2)} <span className="text-[10px] text-cyan-500/80 font-normal">km</span>
                              </span>
                            </div>
                            <div className="p-2 bg-slate-950/80 rounded-xl border border-slate-800 flex flex-col justify-center">
                              <span className="text-[9px] text-slate-500 uppercase font-mono tracking-wider mb-0.5">Reste temp.</span>
                              <span className="text-sm font-bold text-emerald-400 font-mono">
                                {!isGpsTrackingActive ? Math.round(routeInfo.duration / 60) : Math.round(telemetryTimeLeft / 60)} <span className="text-[10px] text-emerald-500/80 font-normal">min</span>
                              </span>
                            </div>
                          </div>

                          {/* Bouton de Contrôle Principal de Suivi */}
                          <div className="flex gap-2">
                            {!isGpsTrackingActive ? (
                              <button
                                onClick={handleStartTracking}
                                className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-slate-950 py-2 px-3 rounded-xl text-xs font-bold font-display flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-cyan-600/10 active:scale-95 cursor-pointer"
                              >
                                <Play className="w-4 h-4 fill-slate-950" />
                                Connecter mon GPS Réel
                              </button>
                            ) : (
                              <button
                                onClick={handlePauseTracking}
                                className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 py-2 px-3 rounded-xl text-xs font-bold font-display flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                              >
                                <Pause className="w-4 h-4 fill-slate-950" />
                                Suspendre le Guidage GPS
                              </button>
                            )}

                            {isGpsTrackingActive && (
                              <button
                                onClick={handleResetTracking}
                                className="bg-slate-850 hover:bg-slate-800 border border-slate-700 p-2 rounded-xl text-slate-300 hover:text-white transition-all active:scale-95 cursor-pointer"
                                title="Réinitialiser la course"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          {/* Émulation de position par clic */}
                          <div className="bg-slate-950/65 p-2.5 rounded-xl border border-slate-850 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-slate-300 font-mono font-bold flex items-center gap-1">
                                🖱️ Simuler par simple clic carte
                              </span>
                              <button
                                onClick={() => setIsVirtualGpsActive(!isVirtualGpsActive)}
                                className={`px-2 py-0.5 text-[9px] font-bold rounded border transition-all ${
                                  isVirtualGpsActive
                                    ? 'bg-emerald-950 text-emerald-400 border-emerald-500/30'
                                    : 'bg-slate-850 text-slate-500 border-slate-700/35'
                                }`}
                              >
                                {isVirtualGpsActive ? 'ACTIF (RECOMMANDÉ)' : 'DÉSACTIVÉ'}
                              </button>
                            </div>
                            <p className="text-[10px] leading-relaxed text-slate-400">
                              Idéal pour tester l'application en temps réel sur ordinateur : activez le guidage et cliquez n'importe où sur l'itinéraire pour déplacer virtuellement le véhicule et voir recalculer la télémétrie en 3D !
                            </p>
                          </div>

                          {/* Sélecteurs de Caméra de Cinéma 3D */}
                          <div className="space-y-1.5 border-t border-slate-850 pt-2.5">
                            <span className="text-[10px] text-slate-500 uppercase font-mono tracking-wider flex items-center gap-1">
                              <Camera className="w-3.5 h-3.5 text-cyan-400" />
                              Cinématique de la caméra 3D Mapbox :
                            </span>
                            <div className="grid grid-cols-4 gap-1 p-0.5 bg-slate-950/80 border border-slate-800/80 rounded-xl">
                              <button
                                onClick={() => setTrackingCameraMode('chase')}
                                className={`py-1 text-[10px] font-semibold rounded-lg transition-all cursor-pointer ${
                                  trackingCameraMode === 'chase'
                                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 font-bold'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50'
                                }`}
                                title="Caméra subjective 3D suivant le véhicule"
                              >
                                🎥 Course
                              </button>
                              <button
                                onClick={() => setTrackingCameraMode('orbit')}
                                className={`py-1 text-[10px] font-semibold rounded-lg transition-all cursor-pointer ${
                                  trackingCameraMode === 'orbit'
                                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 font-bold'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50'
                                }`}
                                title="Caméra rotative orbitant autour de la cible"
                              >
                                🔄 Orbite
                              </button>
                              <button
                                onClick={() => setTrackingCameraMode('overhead')}
                                className={`py-1 text-[10px] font-semibold rounded-lg transition-all cursor-pointer ${
                                  trackingCameraMode === 'overhead'
                                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 font-bold'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50'
                                }`}
                                title="Caméra aérienne plate centrée"
                              >
                                ✈️ Survol
                              </button>
                              <button
                                onClick={() => setTrackingCameraMode('free')}
                                className={`py-1 text-[10px] font-semibold rounded-lg transition-all cursor-pointer ${
                                  trackingCameraMode === 'free'
                                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 font-bold'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50'
                                }`}
                                title="Laissez libre contrôle de la caméra à l'utilisateur"
                              >
                                🗺️ Libre
                              </button>
                            </div>
                          </div>

                          {/* Tableau d'instructions Turn-by-Turn GPS en temps réel */}
                          <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800">
                            <span className="text-[9px] text-slate-500 uppercase font-mono tracking-wider block mb-1 font-bold">
                              📡 Feuille de route / Guidage Professionnel :
                            </span>
                            <div className="flex items-start gap-2 text-[11px] font-medium text-slate-200 min-h-[30px] font-mono leading-relaxed">
                              <span>{activeGuidanceText}</span>
                            </div>
                            {/* Barre de progression cinématique */}
                            <div className="w-full bg-slate-800 h-1 rounded-full mt-2 overflow-hidden">
                              <div
                                className="bg-cyan-400 h-full transition-all duration-300"
                                style={{
                                  width: `${
                                    routeInfo.distance > 0
                                      ? Math.max(0, Math.min(100, (1 - (telemetryDistanceLeft / routeInfo.distance)) * 100))
                                      : 0
                                  }%`,
                                }}
                              ></div>
                            </div>
                          </div>

                          {/* Options d'extinction */}
                          <button
                            onClick={clearRoute}
                            className="w-full bg-slate-950 hover:bg-slate-850 border border-slate-850 text-xs py-1.5 px-3 rounded-lg text-slate-500 hover:text-slate-300 transition-colors cursor-pointer text-center font-semibold"
                          >
                            Réinitialiser l'Itinéraire & Traceurs
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => calculateRoute(userLocation, selectedBuilding.centroid.coordinates[1], selectedBuilding.centroid.coordinates[0], selectedBuilding.id)}
                          className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded-xl text-xs font-bold font-display flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-blue-600/10"
                        >
                          <Navigation className="w-4 h-4" />
                          Calculer l'itinéraire de livraison
                        </button>
                      )}

                      {routeError && (
                        <div className="p-2 bg-rose-950/40 border border-rose-500/20 rounded-lg text-[11px] text-rose-300 font-mono">
                          ⚠️ {routeError}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* 3. CAPTURE DE LA CARTE MAPBOX EN PLEIN ÉCRAN */}
      <div className="flex-1 relative h-full w-full">
        
        {/* LE CONTENEUR DE LA CARTE */}
        <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" id="mapbox-viewport" />

        {/* BARRE D'OUTILS SUPÉRIEURE GAUCHE (Atelier + Mode Édition 3D Tracé) */}
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
          {!isSidebarOpen && (
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2.5 px-3.5 bg-slate-900/95 border border-slate-700/80 hover:border-indigo-500/50 text-indigo-400 rounded-2xl shadow-2xl transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2 hover:bg-slate-850 group ring-1 ring-white/10"
              title="Ouvrir l'Atelier cadastral"
            >
              <Wrench className="w-4 h-4 text-indigo-400 group-hover:rotate-12 transition-transform duration-300" />
              <span className="text-xs font-bold text-white font-display uppercase tracking-wide px-0.5">Atelier</span>
            </button>
          )}

          {/* BOUTON ET MENU D'ÉDITION 3D (Tracé manuel 3D & Gestion des volumes) */}
          <Edit3DMenu
            buildings3D={all3DBuildings}
            isDrawing3D={is3DDrawMode}
            onStartDrawing3D={() => {
              setIs3DDrawMode(true);
              setIs3DModelPlacementActive(false);
              setDrawPoints3D([]);
              setIsSidebarOpen(false);
              setSelectedBuilding(null);
              setClickedCoords(null);
              addApiLog('START_3D_DRAW', `/map/3d-draw/start`, null, { active: true });
            }}
            onSelectBuilding3D={(b) => handleFlyToAndHighlight3DBuilding(b)}
            onDeleteBuilding3D={(bId) => {
              handleDeleteCustom3DBuilding(bId);
            }}
            onToggle3DPitch={() => {
              if (!mapRef.current) return;
              const pitch = mapRef.current.getPitch();
              const nextPitch = pitch > 15 ? 0 : 50;
              mapRef.current.easeTo({ pitch: nextPitch, duration: 800 });
              setCurrentPitch(nextPitch);
            }}
            currentPitch={currentPitch}
            isPlacingModel3D={is3DModelPlacementActive}
            onStartModel3DPlacement={handleStartModel3DPlacement}
            placed3DModels={placed3DModels}
            onSelectPlaced3DModel={handleSelectPlaced3DModel}
            onDeletePlaced3DModel={handleDeletePlaced3DModel}
            onUpdatePlaced3DModelScale={handleUpdatePlaced3DModelScale}
          />
        </div>

        {/* HUD FLOTTANT DE PLACEMENT D'OBJET 3D GLTF ACTIF */}
        <AnimatePresence>
          {is3DModelPlacementActive && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-slate-900/95 border border-emerald-500/60 rounded-2xl px-4 py-2.5 shadow-2xl backdrop-blur-md ring-1 ring-emerald-400/30 select-none"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
              <div className="flex items-center gap-2">
                <Boxes className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white font-display">
                  Cliquez sur la carte pour placer l'objet 3D (house.glb)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIs3DModelPlacementActive(false)}
                className="text-[10px] font-mono font-bold text-slate-300 hover:text-rose-400 px-2 py-1 bg-slate-800 hover:bg-rose-950/40 rounded-lg border border-slate-700 hover:border-rose-500/40 transition cursor-pointer"
              >
                Annuler
              </button>
            </motion.div>
          )}
        </AnimatePresence>

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

        {/* HUD FLOTTANT DE TRACÉ 3D ACTIF */}
        <AnimatePresence>
          {is3DDrawMode && (
            <Tracing3DHUD
              pointsCount={drawPoints3D.length}
              onClosePolygon={() => {
                if (drawPoints3D.length < 3) return;
                setIs3DConfigModalOpen(true);
              }}
              onUndoPoint={() => {
                setDrawPoints3D(prev => prev.slice(0, -1));
              }}
              onCancel={() => {
                setIs3DDrawMode(false);
                setDrawPoints3D([]);
                if (mapRef.current) {
                  const drawSource = mapRef.current.getSource('draw-source') as mapboxgl.GeoJSONSource;
                  if (drawSource) drawSource.setData({ type: 'FeatureCollection', features: [] });
                }
              }}
              areaEstimate={drawPoints3D.length >= 3 ? calculatePolygonArea([[...drawPoints3D, drawPoints3D[0]]]) : undefined}
            />
          )}
        </AnimatePresence>

        {/* MODALE DE CONFIGURATION RAPIDE DU BÂTIMENT 3D (Nombre d'étages & Extrusion) */}
        <Building3DModal
          isOpen={is3DConfigModalOpen}
          onClose={() => setIs3DConfigModalOpen(false)}
          drawPoints={drawPoints3D}
          areaM2={drawPoints3D.length >= 3 ? calculatePolygonArea([[...drawPoints3D, drawPoints3D[0]]]) : 100}
          defaultColor="#f0eee9"
          centroid={
            drawPoints3D.length > 0
              ? [
                  drawPoints3D.reduce((acc, p) => acc + p[0], 0) / drawPoints3D.length,
                  drawPoints3D.reduce((acc, p) => acc + p[1], 0) / drawPoints3D.length
                ]
              : [-13.62125, 9.58875]
          }
          onConfirm={(bData) => {
            const newBldg: Custom3DBuilding = {
              id: `3d-bldg-${Date.now()}`,
              ...bData,
              created_at: new Date().toISOString()
            };
            setCustom3DBuildings(prev => [newBldg, ...prev]);
            setIs3DConfigModalOpen(false);
            setIs3DDrawMode(false);
            setDrawPoints3D([]);

            // Nettoyer draw-source
            if (mapRef.current) {
              const drawSource = mapRef.current.getSource('draw-source') as mapboxgl.GeoJSONSource;
              if (drawSource) drawSource.setData({ type: 'FeatureCollection', features: [] });

              // Pitch dynamique vers 50° pour révéler le volume 3D immédiatement
              if (mapRef.current.getPitch() < 15) {
                mapRef.current.easeTo({
                  pitch: 50,
                  bearing: -20,
                  duration: 1000
                });
                setCurrentPitch(50);
              }
            }

            setMapNotification({
              type: 'success',
              title: 'Bâtiment 3D Extrudé !',
              message: `${bData.name} (${bData.floors} étages, ${bData.height}m) a été modélisé en 3D avec succès.`
            });

            addApiLog('CREATE_3D_BUILDING', `/map/3d-buildings/create`, newBldg, { success: true });
          }}
        />

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
          {mapNotification && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="absolute top-4 right-4 z-50 max-w-sm w-[90vw] bg-slate-900/95 border border-slate-700/80 rounded-2xl p-4 shadow-2xl backdrop-blur-md ring-1 ring-white/10"
            >
              <div className="flex gap-3">
                <div className={`p-2 rounded-lg shrink-0 flex items-center justify-center ${
                  mapNotification.type === 'success' ? 'bg-emerald-950/85 text-emerald-400 border border-emerald-500/20' :
                  mapNotification.type === 'warning' ? 'bg-amber-950/85 text-amber-500 border border-amber-500/20' :
                  'bg-blue-950/85 text-blue-400 border border-blue-500/20'
                }`}>
                  {mapNotification.type === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> :
                   mapNotification.type === 'warning' ? <AlertTriangle className="w-5 h-5 flex-shrink-0" /> :
                   <Info className="w-5 h-5 flex-shrink-0" />}
                </div>
                
                <div className="flex-1 space-y-1">
                  <div className="flex items-start justify-between">
                    <h4 className="text-xs font-bold text-white font-display leading-tight">
                      {mapNotification.title}
                    </h4>
                    <button 
                      onClick={() => setMapNotification(null)}
                      className="text-slate-400 hover:text-white text-xs p-0.5 hover:bg-slate-800 rounded transition-all cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-snug font-sans text-left">
                    {mapNotification.message}
                  </p>
                </div>
              </div>
              
              {/* Petite barre d'auto-destruction visuelle animée */}
              <div className="mt-3 h-0.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{ duration: 8, ease: "linear" }}
                  className={`h-full ${
                    mapNotification.type === 'success' ? 'bg-emerald-500' :
                    mapNotification.type === 'warning' ? 'bg-amber-500' :
                    'bg-blue-500'
                  }`}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* SÉLECTEUR DE CALQUES (LAYER SWITCHER) COMPACT & DISCRET */}
        <div className="absolute top-4 right-4 z-20 flex flex-col items-end">
          <div className="relative">
            <button
              onClick={() => setIsLayerMenuOpen(!isLayerMenuOpen)}
              className={`flex items-center gap-1.5 p-2 px-3 rounded-xl bg-slate-900/95 border shadow-xl transition-all cursor-pointer text-[11px] font-semibold select-none active:scale-95 ${
                isLayerMenuOpen 
                  ? 'border-indigo-500 text-indigo-400' 
                  : 'border-slate-800 text-slate-300 hover:text-white hover:bg-slate-850'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>Fonds de carte</span>
            </button>

            <AnimatePresence>
              {isLayerMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  className="absolute right-0 mt-1.5 w-48 bg-slate-900 border border-slate-800 rounded-xl p-1.5 shadow-2xl backdrop-blur-md z-30 space-y-1 text-left"
                >
                  {styles.map(style => {
                    const isActive = currentStyle === style.id;
                    return (
                      <button
                        key={style.id}
                        onClick={() => {
                          handleStyleChange(style.id);
                          setIsLayerMenuOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer flex items-center justify-between active:scale-98 ${
                          isActive 
                            ? 'bg-indigo-600 text-white font-bold' 
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                        }`}
                      >
                        <span>{style.name}</span>
                        {isActive && <Check className="w-3.5 h-3.5 text-white font-bold" />}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* VOLET D'OPTIONS SATELLITE (SUPER-RÉSOLUTION & GRILLE 200M) EN BAS À GAUCHE */}
        {currentStyle === 'satellite' && isSatelliteOptionsCollapsed && (
          <button
            onClick={() => setIsSatelliteOptionsCollapsed(false)}
            className="absolute bottom-6 lg:bottom-28 left-4 z-20 flex items-center gap-2 bg-slate-950/95 border border-indigo-500/30 backdrop-blur-md rounded-2xl p-2.5 px-3.5 shadow-2xl hover:bg-slate-900 text-indigo-400 hover:text-indigo-300 transition-all cursor-pointer ring-1 ring-indigo-505/10 animate-in fade-in slide-in-from-bottom-2"
          >
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span className="text-[10px] font-bold font-display uppercase tracking-wider">Option IA & Grille</span>
          </button>
        )}

        {currentStyle === 'satellite' && !isSatelliteOptionsCollapsed && (
          <div className="absolute bottom-6 lg:bottom-28 left-4 z-20 flex flex-col gap-1.5 max-w-[85vw] sm:max-w-[280px] bg-slate-950/95 border border-indigo-500/30 backdrop-blur-md rounded-2xl p-3 shadow-2xl ring-1 ring-indigo-505/10 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${isHdEnhanceForce ? 'bg-emerald-500' : 'bg-slate-600'}`}></span>
                </span>
                <span className="text-[10px] font-bold font-display text-indigo-400 uppercase tracking-wider">
                  Super-Résolution IA
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-[8px] px-1.5 py-0.5 rounded font-mono font-bold ${isHdEnhanceForce ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'}`}>
                  {isHdEnhanceForce ? 'HD' : 'BRUT'}
                </span>
                <button
                  onClick={() => setIsSatelliteOptionsCollapsed(true)}
                  className="text-slate-400 hover:text-white text-xs p-1 hover:bg-slate-800 rounded transition cursor-pointer"
                  title="Réduire"
                >
                  ✕
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                setIsHdEnhanceForce(!isHdEnhanceForce);
                addApiLog('TOGGLE_CV_HD', `/map/satellite/hd-mode`, null, { active: !isHdEnhanceForce });
              }}
              className={`w-full py-1.5 px-3 rounded-xl text-[10px] font-bold font-display transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 ${
                isHdEnhanceForce 
                  ? 'bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-500/20' 
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isHdEnhanceForce ? "Désactiver la Super-Netteté IA" : "Activer la Super-Netteté (Dé-flouter)"}</span>
            </button>

            <div className="h-px bg-slate-800/60 my-1"></div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  {is200mGridActive && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  )}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${is200mGridActive ? 'bg-cyan-500' : 'bg-slate-600'}`}></span>
                </span>
                <span className="text-[10px] font-bold font-display text-cyan-400 uppercase tracking-wider">
                  Grille Alphanumérique (200m)
                </span>
              </div>
              <span className={`text-[8px] px-1.5 py-0.5 rounded font-mono font-bold ${is200mGridActive ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/20' : 'bg-slate-800 text-slate-400'}`}>
                {is200mGridActive ? 'AFFICHÉE' : 'MASQUÉE'}
              </span>
            </div>

            <button
              onClick={() => {
                setIs200mGridActive(!is200mGridActive);
                addApiLog('TOGGLE_GRID_200M', `/map/satellite/grid-200m`, null, { active: !is200mGridActive });
              }}
              className={`w-full py-1.5 px-3 rounded-xl text-[10px] font-bold font-display transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 ${
                is200mGridActive 
                  ? 'bg-cyan-600 text-white font-bold shadow-lg shadow-cyan-500/20' 
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>{is200mGridActive ? "Masquer la Grille de 200m" : "Afficher la Grille de 200m"}</span>
            </button>

            {is200mGridActive && (
              <>
                <div className="h-px bg-slate-800/60 my-1"></div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${clickSelectionTarget === 'grid_cell' ? 'bg-amber-500' : 'bg-cyan-500'}`}></span>
                    </span>
                    <span className="text-[10px] font-bold font-display text-slate-300 uppercase tracking-wider">
                      Mode Clic sur Carte
                    </span>
                  </div>
                  <span className={`text-[8px] px-1.5 py-0.5 rounded font-mono font-bold ${clickSelectionTarget === 'grid_cell' ? 'bg-amber-950 text-amber-300 border border-amber-500/20' : 'bg-cyan-950 text-cyan-300 border border-cyan-500/20'}`}>
                    {clickSelectionTarget === 'grid_cell' ? 'CARREAU' : 'POLYGONE'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1 mt-0.5">
                  <button
                    onClick={() => {
                      setClickSelectionTarget('grid_cell');
                      addApiLog('SET_SELECTION_TARGET', `/map/selection-target/grid_cell`, null, { target: 'grid_cell' });
                      setSelectedBuilding(null);
                    }}
                    className={`py-1.5 px-2 rounded-xl text-[9px] font-bold font-display transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-95 ${
                      clickSelectionTarget === 'grid_cell'
                        ? 'bg-amber-600 text-white shadow-md shadow-amber-600/10'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
                    }`}
                    title="Sélectionne le carreau entier de 200m avec ses bâtiments"
                  >
                    <Grid className="w-3 h-3 text-amber-300" />
                    Carreau 200m
                  </button>
                  <button
                    onClick={() => {
                      setClickSelectionTarget('building');
                      addApiLog('SET_SELECTION_TARGET', `/map/selection-target/building`, null, { target: 'building' });
                      setSelectedGridCell(null);
                      setSelectedGridBuildings([]);
                      setIsGridPanelOpen(false);
                      if (mapRef.current) {
                        const selSource = mapRef.current.getSource('selected-building') as mapboxgl.GeoJSONSource;
                        if (selSource) {
                          selSource.setData({
                            type: 'FeatureCollection',
                            features: []
                          });
                        }
                        if (markerRef.current) {
                          markerRef.current.remove();
                          markerRef.current = null;
                        }
                      }
                    }}
                    className={`py-1.5 px-2 rounded-xl text-[9px] font-bold font-display transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-95 ${
                      clickSelectionTarget === 'building'
                        ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/10'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
                    }`}
                    title="Sélectionne uniquement le polygone du bâtiment cliqué"
                  >
                    <Layers className="w-3 h-3 text-cyan-300" />
                    Bâtiment Unique
                  </button>
                </div>
              </>
            )}

            <div className="flex justify-between items-center text-[8px] text-slate-400 font-mono mt-0.5 pt-1 border-t border-slate-800">
              <span>Zoom : <strong className="text-white">{zoomLevel.toFixed(1)}</strong> / 22.0</span>
              <span className="text-[8px] text-slate-500">{isHdEnhanceForce ? "Convolution active" : "Brut"}</span>
            </div>
          </div>
        )}

        {/* CONTROLEURS DE LA CARTE STYLE GOOGLE MAPS (Angle en bas à droite) */}
        <div className="absolute bottom-6 right-4 z-20 flex flex-col gap-2 items-end">
          {/* BOUTON UNIQUE DE GÉOLOCALISATION STYLE GOOGLE MAPS (My Location / Recentrer) */}
          <button
            onClick={recenterMap}
            disabled={isRecentering || isLocating}
            id="btn-recenter-gps"
            className={`group relative flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-900/95 border ${
              isRecentering || isLocating
                ? 'border-blue-500/70 text-blue-400 bg-slate-900 shadow-lg shadow-blue-500/15'
                : userLocation
                  ? 'border-blue-500/80 bg-slate-900 text-blue-500 shadow-xl shadow-blue-500/25 hover:bg-slate-850 hover:border-blue-400'
                  : 'border-slate-800 text-slate-300 hover:text-blue-400 hover:border-slate-700 hover:bg-slate-850 shadow-2xl'
            } backdrop-blur-md transition-all duration-150 active:scale-95 cursor-pointer`}
            title="Recentrer sur ma position"
            aria-label="Recentrer sur ma position"
          >
            {isRecentering || isLocating ? (
              <Loader2 className="w-4.5 h-4.5 animate-spin text-blue-400" />
            ) : userLocation ? (
              <LocateFixed className="w-5 h-5 text-blue-500 transition-transform duration-200 group-hover:scale-110" />
            ) : (
              <Locate className="w-5 h-5 text-slate-300 group-hover:text-blue-400 transition-transform duration-200 group-hover:scale-110" />
            )}

            {/* Infobulle au survol style Google Maps */}
            <div className="absolute right-full mr-2.5 px-2.5 py-1.5 bg-slate-950/95 text-white text-[11px] font-medium font-sans rounded-xl border border-slate-800 shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none flex items-center gap-1.5 backdrop-blur-md">
              <LocateFixed className="w-3.5 h-3.5 text-blue-400" />
              <span>{isRecentering || isLocating ? "Acquisition GPS..." : "Recentrer sur ma position"}</span>
            </div>
          </button>

          {/* CONTROLEURS DE ZOOM & ORIENTATION */}
          <div className="flex flex-col gap-1 bg-slate-900/95 border border-slate-800 rounded-xl p-1 shadow-2xl backdrop-blur-md">
            {/* Zoom In */}
            <button
              onClick={() => mapRef.current?.zoomIn()}
              className="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-indigo-400 flex items-center justify-center transition-all cursor-pointer active:scale-95"
              title="Zoom +"
            >
              <Plus className="w-4 h-4" />
            </button>
            
            {/* Zoom Out */}
            <button
              onClick={() => mapRef.current?.zoomOut()}
              className="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-indigo-400 flex items-center justify-center transition-all cursor-pointer active:scale-95 border-t border-slate-800/40"
              title="Zoom -"
            >
              <span className="text-sm font-bold leading-none select-none">-</span>
            </button>

            {/* Compass / Reset Orientation */}
            <button
              onClick={() => {
                mapRef.current?.easeTo({ bearing: 0, pitch: 45, duration: 800 });
              }}
              className="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-indigo-400 flex items-center justify-center transition-all cursor-pointer active:scale-95 border-t border-slate-800/40"
              title="Réinitialiser l'orientation (Nord)"
            >
              <Compass className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* RUSTINE DE BIENVENUE & CONSEIL GPS */}
        <div className="absolute bottom-6 left-4 z-20 pointer-events-none max-w-sm hidden lg:block">
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
        {!selectedBuilding && selectedGridCell && !isGridPanelOpen && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-slate-950/95 border border-cyan-500/30 backdrop-blur-md rounded-2xl p-2 px-4 shadow-2xl ring-1 ring-cyan-500/20 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-2 shrink-0">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-wider">
                Carreau {selectedGridCell.properties.id || '200m'}
              </span>
            </div>
            <div className="h-4 w-px bg-slate-800 shrink-0" />
            <span className="text-[10.5px] text-slate-300 font-sans truncate max-w-[140px] sm:max-w-none">
              {selectedGridBuildings.length} bâtiment{selectedGridBuildings.length > 1 ? 's' : ''} détecté{selectedGridBuildings.length > 1 ? 's' : ''}
            </span>
            <div className="h-4 w-px bg-slate-800 shrink-0" />
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsGridPanelOpen(true)}
                className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-bold font-display rounded-full transition-all active:scale-95 cursor-pointer shadow-lg shadow-cyan-600/10 flex items-center gap-1"
              >
                <Grid className="w-3 h-3" />
                Détails / Actions
              </button>
              <button
                onClick={() => {
                  setSelectedGridCell(null);
                  setSelectedGridBuildings([]);
                  setIsGridPanelOpen(false);
                  if (mapRef.current) {
                    const selSource = mapRef.current.getSource('selected-building') as mapboxgl.GeoJSONSource;
                    if (selSource) {
                      selSource.setData({
                        type: 'FeatureCollection',
                        features: []
                      });
                    }
                    if (markerRef.current) {
                      markerRef.current.remove();
                      markerRef.current = null;
                    }
                  }
                }}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition cursor-pointer"
                title="Désélectionner"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
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
            onApproveAll={handleApproveAllGridBuildings}
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
              className="absolute inset-0 overflow-auto bg-slate-950"
            >
              <ValidationsView
                buildings={buildings}
                profiles={profiles}
                onSelect={handleSelectBuildingFromAdmin}
                isDark={true}
              />
            </motion.div>
          )}

          {activeAdminView === 'batiments' && (
            <motion.div
              key="batiments"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute inset-0 overflow-auto bg-slate-950"
            >
              <BuildingsView
                buildings={buildings}
                profiles={profiles}
                onSelect={handleSelectBuildingFromAdmin}
                isDark={true}
                onRefresh={async () => {
                  const refreshed = await loadRealBuildings();
                  setBuildings(refreshed);
                }}
              />
            </motion.div>
          )}

          {activeAdminView === 'zones' && (
            <motion.div
              key="zones"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute inset-0 overflow-auto bg-slate-950"
            >
              <ZonesView zones={zones} isDark={true} onCreateZone={handleCreateZone} />
            </motion.div>
          )}

          {activeAdminView === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute inset-0 overflow-auto bg-slate-950"
            >
              <Dashboard
                buildings={buildings}
                zones={zones}
                validations={validations}
                isDark={true}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </div>

      {/* MODAL DES PARAMÈTRES ET CLÉS DE L'ATELIER GEOGRAPHIQUE */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
            >
              {/* Entête */}
              <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/20">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-slate-400" />
                  <h3 className="text-xs font-mono uppercase tracking-wider text-white font-bold">Paramètres cartographiques</h3>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer active:scale-95"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Contenu */}
              <div className="p-5 overflow-y-auto space-y-5">
                
                {/* Section 1 : Cle publique Mapbox */}
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">Clé d'accès Mapbox (Token)</label>
                  <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                    L'application utilise une clé publique d'usine par défaut. Pour optimiser les performances 3D ou utiliser vos propres couches, configurez votre jeton Mapbox ci-dessous. Il sera mémorisé localement dans votre navigateur.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <input
                      type="password"
                      placeholder="pk.eyJ1Ijo..."
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-xs text-slate-200 focus:outline-none focus:border-indigo-500/80 transition-all shadow-inner"
                    />
                    <button
                      onClick={() => {
                        setMapNotification({
                          type: 'success',
                          title: 'Configuration Enregistrée',
                          message: "Le jeton d'accès public Mapbox a été mis à jour et stocké."
                        });
                        localStorage.setItem('hailandmap_token', accessToken);
                        setIsSettingsOpen(false);
                      }}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition active:scale-[0.97] cursor-pointer shadow-md shadow-indigo-600/10"
                    >
                      Appliquer
                    </button>
                  </div>
                </div>

                {/* Section 2 : Informations Système */}
                <div className="border-t border-slate-800/60 pt-4 space-y-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">Informations Système</span>
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                    <div className="p-2.5 bg-slate-950/40 border border-slate-800/40 rounded-lg">
                      <span className="text-slate-500 text-[9px] uppercase">Réseau d'Urbanisme</span>
                      <span className="block text-slate-300 mt-0.5">Souverain - Conakry</span>
                    </div>
                    <div className="p-2.5 bg-slate-950/40 border border-slate-800/40 rounded-lg">
                      <span className="text-slate-500 text-[9px] uppercase">Stockage local</span>
                      <span className="block text-slate-300 mt-0.5">Activé (LocalStorage)</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Pied */}
              <div className="p-4 border-t border-slate-800 bg-slate-950/10 flex items-center justify-between text-[10px] font-mono text-slate-500">
                <span>HailandMap Studio</span>
                <span>v3.0.0</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {uiV2 ? (
        <AtelierStatusBar
          buildingsCount={buildings.length}
          zonesCount={zones.length}
          adminName={currentAdmin.full_name}
          zoom={activeAdminView === 'carte' ? zoomLevel : undefined}
          toolHint={activeAdminView === 'carte' && activeTool ? TOOLS.find((t) => t.id === activeTool)?.hint : undefined}
        />
      ) : (
        <>
      {/* FOOTER COULISSANT COULEUR LUXE */}
      <footer className="h-8 flex items-center justify-between px-4 text-[11px] font-mono border-t border-slate-800 shrink-0 bg-slate-900 text-slate-400 select-none">
        <span>HailandX © 2026 — Infrastructure d'adressage souveraine d'Afrique</span>
        <span className="hidden sm:inline">
          {buildings.length} bâtiments · {zones.length} zones · Conakry, Guinée
        </span>
      </footer>
        </>
      )}
    </div>
  );
}
