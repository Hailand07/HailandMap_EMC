import type { RegistrationStage } from '../../shell/registrationStage';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Home, Plus, ArrowRight, CheckCircle, AlertCircle, Edit3, Trash2,
  Sparkles, Check, ChevronRight, Layers, MapPin, ArrowLeft, ShieldCheck,
  RotateCw, MousePointer, PenTool, Undo2, DoorClosed, RotateCcw
} from 'lucide-react';
import * as turf from '@turf/turf';
import type { Building, EntrancePickerConfig } from '../../types';
import ChildBuildingForm, { ChildBuildingConfig } from './ChildBuildingForm';
import { 
  sanitizeGeometry, 
  sanitizeObject, 
  safeCalculateArea, 
  generateSquarePolygon, 
  calculatePolygonArea,
  normalizeBuildingType,
  calculateFixedCentroid
} from '../../utils/safeJson';
import { saveCourtyardWithBuildings } from '../../lib/supabase';
import { resolveAdministrativeHierarchy } from '../../lib/administrativeAddressingService';
import { actorId } from '../../lib/actor';

export interface CourtyardManagerProps {
  initialCoords: {
    latitude: number;
    longitude: number;
    geometry?: any;
    area?: number;
  };
  detectedZone: string;
  detectedCommune: string;
  existingBuildings: Building[];
  onFinalSubmit: (buildings: Building[]) => void;
  onCancel: () => void;
  onUpdateCourtyardGeometries?: (
    motherGeom: any,
    children: {
      id: string;
      index: number;
      geom: any;
      isConfigured: boolean;
      area: number;
      lat: number;
      lng: number;
      label?: string;
    }[],
    activeChildId?: string | null,
    currentTracingGeom?: any
  ) => void;
  isDrawMode?: boolean;
  setIsDrawMode?: (draw: boolean) => void;
  drawPoints?: [number, number][];
  setDrawPoints?: React.Dispatch<React.SetStateAction<[number, number][]>>;
  onChildMapClickRegistration?: (handler: ((lng: number, lat: number, geom?: any, area?: number) => void) | null) => void;
  onChildDrawCompleteRegistration?: (handler: ((points?: [number, number][]) => void) | null) => void;
  onEntrancePointChange?: (coords: { lng: number; lat: number } | null) => void;
  onEntrancePickerModeChange?: (config: EntrancePickerConfig | null) => void;
  onDetectOsmBuildings?: (motherGeom: any) => string[] | void;
  onMaskOsmBuildings?: (motherGeom?: any) => number;
  onStageChange?: (stage: RegistrationStage) => void;
}

type CourtyardWorkflowStep = 
  | 'COUNT_SELECTION'    // Étape 1 : Saisie du nombre de bâtiments
  | 'CHILDREN_TRACING'   // Étape 2 : Tracé satellite exclusif (Clic Intelligent ou Dessin Libre)
  | 'MASTER_DETAIL';     // Étape 3 : Tableau de bord Master-Detail Liste <-> Polygones

/**
 * Logique de CourtyardManager sans interface : états, calculs de codes et gestionnaires. Partagée par l'interface actuelle (v1)
 * et par l'assistant de l'Atelier v2, qui ne reprend que l'interface.
 */
export function useCourtyardManager({
  onStageChange,
  initialCoords,
  detectedZone,
  detectedCommune,
  existingBuildings,
  onFinalSubmit,
  onCancel,
  onUpdateCourtyardGeometries,
  isDrawMode = false,
  setIsDrawMode,
  drawPoints = [],
  setDrawPoints,
  onChildMapClickRegistration,
  onChildDrawCompleteRegistration,
  onEntrancePointChange,
  onEntrancePickerModeChange,
  onDetectOsmBuildings,
  onMaskOsmBuildings
}: CourtyardManagerProps) {
  // Calcul automatique PostGIS de l'ID Cour CRxxx
  const courtyardsInZone = existingBuildings.filter(
    b => b.zone_code === detectedZone && (b.has_courtyard || b.hailand_code?.includes('-CR'))
  );
  const existingCourtyardNums = new Set<number>();
  courtyardsInZone.forEach(b => {
    if (b.hailand_code) {
      const match = b.hailand_code.match(/CR(\d+)/i);
      if (match) existingCourtyardNums.add(parseInt(match[1], 10));
    }
  });
  const defaultCourtyardNum = existingCourtyardNums.size > 0 
    ? Math.max(...Array.from(existingCourtyardNums)) + 1 
    : 1;

  const [courtyardNumber] = useState<number>(defaultCourtyardNum);
  const formattedCourtyardId = `CR${String(courtyardNumber).padStart(3, '0')}`;

  // Polygone mère de la cour (Enceinte globale) — STRICTEMENT IMMUABLE
  // pour que les pointillés de délimitation restent intacts pendant tout le processus jusqu'à la validation
  const motherGeometryRef = useRef<any>(null);
  if (!motherGeometryRef.current) {
    motherGeometryRef.current = sanitizeGeometry(initialCoords.geometry) || {
      type: 'Polygon',
      coordinates: [
        [
          [initialCoords.longitude - 0.0002, initialCoords.latitude - 0.0002],
          [initialCoords.longitude + 0.0002, initialCoords.latitude - 0.0002],
          [initialCoords.longitude + 0.0002, initialCoords.latitude + 0.0002],
          [initialCoords.longitude - 0.0002, initialCoords.latitude + 0.0002],
          [initialCoords.longitude - 0.0002, initialCoords.latitude - 0.0002],
        ]
      ]
    };
  }
  const motherGeometry = motherGeometryRef.current;

  const [detectedOsmCount, setDetectedOsmCount] = useState<number | null>(null);

  // 🚪 GPS FIXE DE L'ENTRÉE MANUELLE DE LA COUR
  const [courtyardEntryPoint, setCourtyardEntryPoint] = useState<{ type: 'Point', coordinates: [number, number] } | null>(null);
  const [isPickingCourtyardEntrance, setIsPickingCourtyardEntrance] = useState<boolean>(false);

  // Nettoyage au démontage
  useEffect(() => {
    return () => {
      if (onChildMapClickRegistration) {
        onChildMapClickRegistration(null);
      }
      if (onChildDrawCompleteRegistration) {
        onChildDrawCompleteRegistration(null);
      }
      if (onEntrancePickerModeChange) {
        onEntrancePickerModeChange(null);
      }
    };
  }, [onChildMapClickRegistration, onChildDrawCompleteRegistration, onEntrancePickerModeChange]);

  const handleStartPickCourtyardEntrance = () => {
    setIsPickingCourtyardEntrance(true);
    if (onEntrancePickerModeChange) {
      onEntrancePickerModeChange({
        active: true,
        type: 'courtyard',
        wallGeometry: motherGeometry,
        onPicked: (coords) => {
          const pLng = Number(coords.lng.toFixed(6));
          const pLat = Number(coords.lat.toFixed(6));
          const newPoint = { type: 'Point' as const, coordinates: [pLng, pLat] as [number, number] };
          setCourtyardEntryPoint(newPoint);
          setIsPickingCourtyardEntrance(false);
          onEntrancePointChange?.({ lng: pLng, lat: pLat });
        },
        onCancel: () => {
          setIsPickingCourtyardEntrance(false);
        }
      });
    } else if (onChildMapClickRegistration) {
      // Fallback
      onChildMapClickRegistration((lng, lat) => {
        const pLng = Number(lng.toFixed(6));
        const pLat = Number(lat.toFixed(6));
        const newPoint = { type: 'Point' as const, coordinates: [pLng, pLat] as [number, number] };
        setCourtyardEntryPoint(newPoint);
        setIsPickingCourtyardEntrance(false);
        onEntrancePointChange?.({ lng: pLng, lat: pLat });
        onChildMapClickRegistration(null);
      });
    }
  };

  const handleCancelPickCourtyardEntrance = () => {
    setIsPickingCourtyardEntrance(false);
    if (onEntrancePickerModeChange) {
      onEntrancePickerModeChange(null);
    }
    if (onChildMapClickRegistration) {
      onChildMapClickRegistration(null);
    }
  };

  const handleResetCourtyardEntryPoint = () => {
    setCourtyardEntryPoint(null);
    setIsPickingCourtyardEntrance(false);
    onEntrancePointChange?.(null);
    if (onEntrancePickerModeChange) {
      onEntrancePickerModeChange(null);
    }
    if (onChildMapClickRegistration) {
      onChildMapClickRegistration(null);
    }
  };

  // Étape 1 & Étape 2 : Détection spatiale automatique et Masquage en bloc des anciens bâtiments OSM dans l'enceinte de la cour
  useEffect(() => {
    if (motherGeometry && onDetectOsmBuildings) {
      const res = onDetectOsmBuildings(motherGeometry);
      if (Array.isArray(res)) {
        setDetectedOsmCount(res.length);
        if (res.length > 0 && onMaskOsmBuildings) {
          onMaskOsmBuildings(motherGeometry);
        }
      }
    }
  }, [motherGeometry, onDetectOsmBuildings, onMaskOsmBuildings]);

  // Calcul de la surface de la cour mère
  const motherArea = useMemo(() => {
    if (initialCoords.area && initialCoords.area > 0) return Math.round(initialCoords.area);
    return safeCalculateArea(motherGeometry, 250);
  }, [initialCoords.area, motherGeometry]);

  // Nom de la concession / repère global
  const [courtyardName, setCourtyardName] = useState<string>('');

  // 🎯 GESTION DES ÉTAPES DU WORKFLOW
  // 1: COUNT_SELECTION -> 2: CHILDREN_TRACING -> 3: MASTER_DETAIL
  const [currentStep, setCurrentStep] = useState<CourtyardWorkflowStep>('COUNT_SELECTION');

  // Progression signalée à l'interface : nombre et tracé des bâtiments = structure ; tableau et fiches = attributs.
  useEffect(() => {
    onStageChange?.(currentStep === 'MASTER_DETAIL' ? 'attributs' : 'structure');
  }, [currentStep, onStageChange]);

  // Nombre de bâtiments cibles à tracer
  const [targetBuildingCount, setTargetBuildingCount] = useState<number>(3);

  // Liste des bâtiments enfants enregistrés
  const [children, setChildren] = useState<ChildBuildingConfig[]>([]);

  // Bâtiment enfant actuellement ouvert dans la fiche de saisie individuelle
  const [activeChildId, setActiveChildId] = useState<string | null>(null);

  // --- ÉTAT DU BÂTIMENT EN COURS DE TRACÉ SUR LA CARTE ---
  const [tracingIndex, setTracingIndex] = useState<number>(1);
  const [tracingMode, setTracingMode] = useState<'smart' | 'draw'>('smart');

  // Géométrie active du bâtiment enfant en cours de tracé
  const [activeChildGeometry, setActiveChildGeometry] = useState<any>(null);
  const [activeChildCenter, setActiveChildCenter] = useState<{ lng: number; lat: number } | null>(null);
  const [activeChildArea, setActiveChildArea] = useState<number>(80);
  const [hasCapturedClick, setHasCapturedClick] = useState<boolean>(false);

  // Générer une position initiale par défaut pour le bâtiment enfant dans la cour
  const defaultChildInitialGeom = useMemo(() => {
    const angleRad = ((tracingIndex - 1) * (2 * Math.PI / Math.max(1, targetBuildingCount)));
    const spreadDistance = 0.00007; // ~8m de rayon
    const lng = initialCoords.longitude + Math.cos(angleRad) * spreadDistance;
    const lat = initialCoords.latitude + Math.sin(angleRad) * spreadDistance;
    const geom = sanitizeGeometry(generateSquarePolygon(lng, lat, 4.5));
    return {
      geom,
      lng,
      lat,
      area: safeCalculateArea(geom, 80)
    };
  }, [initialCoords, tracingIndex, targetBuildingCount]);

  // Initialisation de la géométrie active lors du changement de tracingIndex
  useEffect(() => {
    if (currentStep === 'CHILDREN_TRACING') {
      const existing = children.find(c => c.index === tracingIndex);
      if (existing && existing.geometry) {
        setActiveChildGeometry(existing.geometry);
        setActiveChildCenter({ lng: existing.longitude, lat: existing.latitude });
        setActiveChildArea(existing.area);
        setHasCapturedClick(true);
      } else {
        // En attente d'un tracé ou d'un clic pour ce nouveau bâtiment (aucun polygone factice par défaut)
        setActiveChildGeometry(null);
        setActiveChildCenter(null);
        setActiveChildArea(80);
        setHasCapturedClick(false);
      }
    }
  }, [currentStep, tracingIndex, children]);

  // Synchronisation du mode dessin avec App.tsx
  const handleToggleTracingMode = (mode: 'smart' | 'draw') => {
    setTracingMode(mode);
    setActiveChildGeometry(null);
    setActiveChildCenter(null);
    setHasCapturedClick(false);
    if (setIsDrawMode) {
      setIsDrawMode(mode === 'draw');
    }
    if (setDrawPoints) {
      setDrawPoints([]);
    }
  };

  // Callback de capture de clic carte en mode Clic Intelligent
  const handleMapClickCaptured = useCallback((lng: number, lat: number, detectedGeom?: any, area?: number) => {
    const cleanGeom = sanitizeGeometry(detectedGeom) || sanitizeGeometry(generateSquarePolygon(lng, lat, 4.5));
    const calculatedArea = area && area > 0 ? Math.round(area) : safeCalculateArea(cleanGeom, 80);

    setActiveChildGeometry(cleanGeom);
    setActiveChildCenter({ lng, lat });
    setActiveChildArea(calculatedArea);
    setHasCapturedClick(true);
  }, []);

  // Enregistrement du récepteur de clic auprès d'App.tsx
  useEffect(() => {
    if (currentStep === 'CHILDREN_TRACING' && onChildMapClickRegistration) {
      onChildMapClickRegistration(handleMapClickCaptured);
      return () => {
        onChildMapClickRegistration(null);
      };
    } else if (onChildMapClickRegistration) {
      onChildMapClickRegistration(null);
    }
  }, [currentStep, onChildMapClickRegistration, handleMapClickCaptured]);

  // Synchronisation avec la carte Mapbox pour l'affichage en direct des couches
  useEffect(() => {
    if (onUpdateCourtyardGeometries) {
      const childrenSummary = children.map(c => ({
        id: c.id,
        index: c.index,
        geom: c.geometry,
        isConfigured: c.isConfigured,
        area: c.area,
        lat: c.latitude,
        lng: c.longitude,
        label: `Bâtiment ${c.index}`
      }));

      const activeGeom = currentStep === 'CHILDREN_TRACING' ? activeChildGeometry : null;
      onUpdateCourtyardGeometries(motherGeometry, childrenSummary, activeChildId, activeGeom);
    }
  }, [motherGeometry, children, activeChildId, currentStep, activeChildGeometry, onUpdateCourtyardGeometries]);

  // ✅ Validation du tracé d'un bâtiment enfant (en Clic Intelligent ou Dessin Libre)
  const handleConfirmChild = useCallback((geomToSave?: any, centerToSave?: { lng: number; lat: number }, areaToSave?: number) => {
    const finalGeom = geomToSave || activeChildGeometry || (activeChildCenter ? sanitizeGeometry(generateSquarePolygon(activeChildCenter.lng, activeChildCenter.lat, 4.5)) : defaultChildInitialGeom.geom);
    const finalCenter = centerToSave || activeChildCenter || { lng: defaultChildInitialGeom.lng, lat: defaultChildInitialGeom.lat };
    const finalArea = areaToSave || activeChildArea || defaultChildInitialGeom.area;

    const newChild: ChildBuildingConfig = {
      id: `child-${tracingIndex}-${Date.now()}`,
      index: tracingIndex,
      geometry: sanitizeGeometry(finalGeom),
      area: finalArea,
      latitude: finalCenter.lat,
      longitude: finalCenter.lng,
      isConfigured: false,
      buildingType: 'R',
      occupancyRelation: 'family',
      floorsCount: 0,
      isSubdivided: false,
    };

    // Mettre à jour la liste des enfants : ils conservent tous leur fond bleu et contour bleu
    setChildren(prev => {
      const existing = prev.filter(c => c.index !== tracingIndex);
      return [...existing, newChild].sort((a, b) => a.index - b.index);
    });

    // Nettoyer les points de dessin
    if (setDrawPoints) {
      setDrawPoints([]);
    }

    if (tracingIndex < targetBuildingCount) {
      // Passer au bâtiment enfant suivant
      setTracingIndex(prev => prev + 1);
      setActiveChildGeometry(null);
      setActiveChildCenter(null);
      setHasCapturedClick(false);
      if (setIsDrawMode) setIsDrawMode(tracingMode === 'draw');
    } else {
      // Tous les N bâtiments sont tracés -> Désactiver le mode dessin et ouvrir le tableau de bord
      setActiveChildGeometry(null);
      setActiveChildCenter(null);
      setHasCapturedClick(false);
      if (setIsDrawMode) setIsDrawMode(false);
      setCurrentStep('MASTER_DETAIL');
    }
  }, [activeChildGeometry, activeChildCenter, defaultChildInitialGeom, activeChildArea, tracingIndex, targetBuildingCount, setDrawPoints, setIsDrawMode, tracingMode]);

  // Validation spécifique depuis le mode Dessin Libre
  const handleValidateFreehandDraw = useCallback((pointsToUse?: [number, number][]) => {
    const pts = pointsToUse && pointsToUse.length >= 3 ? pointsToUse : drawPoints;
    if (!pts || pts.length < 3) return;

    // Fermer le polygone
    const coordinates = [...pts, pts[0]];
    const customPolygon = {
      type: 'Polygon' as const,
      coordinates: [coordinates]
    };

    const areaVal = calculatePolygonArea([coordinates]) || safeCalculateArea(customPolygon, 80);

    const lats = pts.map(p => p[1]);
    const lngs = pts.map(p => p[0]);
    const centerLat = lats.reduce((a, b) => a + b, 0) / pts.length;
    const centerLng = lngs.reduce((a, b) => a + b, 0) / pts.length;

    handleConfirmChild(customPolygon, { lng: centerLng, lat: centerLat }, areaVal);
  }, [drawPoints, handleConfirmChild]);

  // Enregistrement de la finalisation automatique du dessin libre (ex: clic sur le 1er point)
  useEffect(() => {
    if (currentStep === 'CHILDREN_TRACING' && onChildDrawCompleteRegistration) {
      onChildDrawCompleteRegistration(handleValidateFreehandDraw);
      return () => {
        onChildDrawCompleteRegistration(null);
      };
    } else if (onChildDrawCompleteRegistration) {
      onChildDrawCompleteRegistration(null);
    }
  }, [currentStep, onChildDrawCompleteRegistration, handleValidateFreehandDraw]);

  // Ouvrir l'outil de re-tracé satellite pour un bâtiment spécifique
  const handleRetraceChild = (child: ChildBuildingConfig) => {
    setTracingIndex(child.index);
    setActiveChildGeometry(child.geometry);
    setActiveChildCenter({ lng: child.longitude, lat: child.latitude });
    setActiveChildArea(child.area);
    setHasCapturedClick(true);
    setCurrentStep('CHILDREN_TRACING');
  };

  // Mettre à jour un enfant après validation de sa fiche séquentielle
  const handleSaveChild = (updatedChild: ChildBuildingConfig) => {
    setChildren(prev => prev.map(c => c.id === updatedChild.id ? updatedChild : c));
    setActiveChildId(null);
  };

  // Ajouter un nouveau bâtiment enfant à la volée
  const handleAddExtraChild = () => {
    const nextIdx = children.length + 1;
    setTargetBuildingCount(nextIdx);
    setTracingIndex(nextIdx);
    setHasCapturedClick(false);
    setCurrentStep('CHILDREN_TRACING');
  };

  // Supprimer un bâtiment enfant
  const handleRemoveChild = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = children.filter(c => c.id !== id);
    const reindexed = filtered.map((c, idx) => ({ ...c, index: idx + 1 }));
    setChildren(reindexed);
    setTargetBuildingCount(reindexed.length);
    if (activeChildId === id) setActiveChildId(null);
  };

  // Finalisation et enregistrement de toute la concession dans Supabase
  const handleFinalSubmitAll = async () => {
    const parentYardId = `yard-${detectedZone}-${formattedCourtyardId}`;
    const cleanMotherGeom = sanitizeGeometry(motherGeometry, [initialCoords.longitude, initialCoords.latitude]);

    // 1. Entité Bâtiment Mère (Cour)
    const motherCentroid = calculateFixedCentroid(cleanMotherGeom, [initialCoords.longitude, initialCoords.latitude]);
    const motherAdmin = resolveAdministrativeHierarchy(motherCentroid.coordinates as [number, number], {
      buildingType: 'R',
      lotIndex: formattedCourtyardId.replace(/\D/g, '') || '001',
      isMotherCourtyard: true,
    });

    const motherBuilding: Building = sanitizeObject({
      id: parentYardId,
      hailand_code: `GN-${detectedZone}-${formattedCourtyardId}`,
      parent_building_id: null,
      zone_id: null,
      zone_code: detectedZone,
      building_type: 'R',
      has_courtyard: true,
      courtyard_geom: cleanMotherGeom,
      floor_count: 1,
      unit_count: children.length,
      floor_level: null,
      unit_code: null,
      physical_position: null,
      status: 'actif',
      geom: cleanMotherGeom,
      centroid: motherCentroid,
      altitude_m: 35,
      commune: motherAdmin.communeNom || detectedCommune,
      quartier: motherAdmin.quartierNom,
      commune_id: motherAdmin.communeId,
      quartier_id: motherAdmin.quartierId,
      region: motherAdmin.regionNom,
      region_id: motherAdmin.regionId,
      prefecture: motherAdmin.prefectureNom,
      prefecture_id: motherAdmin.prefectureId,
      admin_address_code: motherAdmin.adminAddressCode,
      formatted_address: motherAdmin.formattedAddress,
      // Navigation & Accès Niveau 3
      entry_point_geom: courtyardEntryPoint 
        ? sanitizeGeometry(courtyardEntryPoint) 
        : {
            type: 'Point',
            coordinates: [Number(initialCoords.longitude.toFixed(6)), Number(initialCoords.latitude.toFixed(6))]
          },
      entry_point_note: courtyardName ? `Portail d'accès principal (${courtyardName})` : `Portail d'accès Cour ${formattedCourtyardId}`,
      internal_directions: null,
      door_color: null,
      intercom_code: null,
      // Notes & Repères
      landmark_note: courtyardName || `Cour ${formattedCourtyardId}`,
      access_note: null,
      is_validated: true,
      validation_count: 1,
      validated_by: actorId(),
      validated_at: new Date().toISOString(),
      submitted_by: 'admin',
      claimed_by: null,
      rejection_reason: null,
      modification_request: null,
      osm_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // 2. Bâtiments Enfants avec leurs VRAIS polygones de toiture tracés sur la carte et propriétés Niveau 3
    const generatedBuildings: Building[] = [];
    children.forEach((c) => {
      const childCode = c.hailandCode || c.buildingCode || `GN-${detectedZone}-${formattedCourtyardId}-R${String.fromCharCode(64 + c.index)}`;
      const cleanChildGeom = sanitizeGeometry(c.geometry, [c.longitude, c.latitude]) || cleanMotherGeom;
      const childCentroid = calculateFixedCentroid(cleanChildGeom, [c.longitude, c.latitude]);

      const childLetter = String.fromCharCode(64 + Math.min(26, Math.max(1, c.index)));
      const childAdmin = resolveAdministrativeHierarchy([c.longitude, c.latitude], {
        buildingType: c.buildingType || 'R',
        lotIndex: formattedCourtyardId.replace(/\D/g, '') || '001',
        childIndex: c.index,
        childLetter,
        unitCode: c.hasSpecificLocation ? (c.targetUnitCode || undefined) : undefined,
        floorLevel: c.hasSpecificLocation ? (c.targetFloor || undefined) : undefined,
        parentHailandCode: motherBuilding.hailand_code,
        isMotherCourtyard: false,
      });

      const childBuilding: Building = sanitizeObject({
        id: `building-child-${c.id}`,
        hailand_code: childCode,
        parent_building_id: parentYardId,
        zone_id: null,
        zone_code: detectedZone,
        building_type: normalizeBuildingType(c.buildingType || 'R'),
        has_courtyard: false,
        courtyard_geom: cleanMotherGeom,
        floor_count: c.floorsCount || 0,
        unit_count: c.isSubdivided ? (c.totalUnitsCount || 1) : 1,
        floor_level: c.hasSpecificLocation ? (c.targetFloor === 'RDC' ? null : c.targetFloor || null) : null,
        unit_code: c.hasSpecificLocation ? (c.targetUnitCode || null) : null,
        physical_position: c.physicalPosition || null,
        status: 'actif',
        geom: cleanChildGeom,
        centroid: childCentroid,
        altitude_m: 35,
        commune: childAdmin.communeNom || motherBuilding.commune,
        quartier: childAdmin.quartierNom || motherBuilding.quartier,
        commune_id: childAdmin.communeId || motherBuilding.commune_id,
        quartier_id: childAdmin.quartierId || motherBuilding.quartier_id,
        region: childAdmin.regionNom,
        region_id: childAdmin.regionId,
        prefecture: childAdmin.prefectureNom,
        prefecture_id: childAdmin.prefectureId,
        admin_address_code: c.adminAddressCode || childAdmin.adminAddressCode,
        formatted_address: c.formattedAddress || childAdmin.formattedAddress,
        // Navigation & Accès Niveau 3
        entry_point_geom: c.entryPointGeom 
          ? sanitizeGeometry(c.entryPointGeom) 
          : (c.longitude && c.latitude ? { type: 'Point', coordinates: [c.longitude, c.latitude] } : null),
        entry_point_note: c.entryPointNote || null,
        internal_directions: c.internalDirections || null,
        door_color: c.doorColor || null,
        intercom_code: c.intercomCode || null,
        // Notes & Repères
        landmark_note: c.landmarkNote || `Bâtiment ${c.index} de la Cour ${formattedCourtyardId}`,
        access_note: c.accessNote || null,
        is_validated: true,
        validation_count: 1,
        validated_by: actorId(),
        validated_at: new Date().toISOString(),
        submitted_by: 'admin',
        claimed_by: null,
        rejection_reason: null,
        modification_request: null,
        osm_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      generatedBuildings.push(childBuilding);
    });

    // 3. Enregistrement persistant en deux temps sur Supabase (Cour parente -> Bâtiments enfants)
    try {
      await saveCourtyardWithBuildings(motherBuilding, generatedBuildings);
    } catch (err) {
      console.warn("[CourtyardManager] Erreur lors de l'appel saveCourtyardWithBuildings :", err);
    }

    // 4. Envoi de la mère + tous les enfants à l'application principale
    onFinalSubmit([motherBuilding, ...generatedBuildings]);
  };

  const configuredCount = children.filter(c => c.isConfigured).length;
  const isAllConfigured = children.length > 0 && configuredCount === children.length;
  const activeChild = children.find(c => c.id === activeChildId);

  return {
    activeChild, activeChildArea, activeChildCenter, activeChildGeometry, activeChildId, children, configuredCount, courtyardEntryPoint, courtyardName, courtyardNumber, courtyardsInZone, currentStep, defaultChildInitialGeom, defaultCourtyardNum, detectedCommune, detectedOsmCount, detectedZone, drawPoints, existingBuildings, existingCourtyardNums, formattedCourtyardId, handleAddExtraChild, handleCancelPickCourtyardEntrance, handleConfirmChild, handleFinalSubmitAll, handleMapClickCaptured, handleRemoveChild, handleResetCourtyardEntryPoint, handleRetraceChild, handleSaveChild, handleStartPickCourtyardEntrance, handleToggleTracingMode, handleValidateFreehandDraw, hasCapturedClick, initialCoords, isAllConfigured, isDrawMode, isPickingCourtyardEntrance, motherArea, motherGeometry, motherGeometryRef, onCancel, onChildDrawCompleteRegistration, onChildMapClickRegistration, onDetectOsmBuildings, onEntrancePickerModeChange, onEntrancePointChange, onFinalSubmit, onMaskOsmBuildings, onStageChange, onUpdateCourtyardGeometries, setActiveChildArea, setActiveChildCenter, setActiveChildGeometry, setActiveChildId, setChildren, setCourtyardEntryPoint, setCourtyardName, setCurrentStep, setDetectedOsmCount, setDrawPoints, setHasCapturedClick, setIsDrawMode, setIsPickingCourtyardEntrance, setTargetBuildingCount, setTracingIndex, setTracingMode, targetBuildingCount, tracingIndex, tracingMode,
  };
}

export default function CourtyardManager(props: CourtyardManagerProps) {
  const {
    activeChild, activeChildArea, activeChildCenter, activeChildGeometry, activeChildId, children, configuredCount, courtyardEntryPoint, courtyardName, courtyardNumber, courtyardsInZone, currentStep, defaultChildInitialGeom, defaultCourtyardNum, detectedCommune, detectedOsmCount, detectedZone, drawPoints, existingBuildings, existingCourtyardNums, formattedCourtyardId, handleAddExtraChild, handleCancelPickCourtyardEntrance, handleConfirmChild, handleFinalSubmitAll, handleMapClickCaptured, handleRemoveChild, handleResetCourtyardEntryPoint, handleRetraceChild, handleSaveChild, handleStartPickCourtyardEntrance, handleToggleTracingMode, handleValidateFreehandDraw, hasCapturedClick, initialCoords, isAllConfigured, isDrawMode, isPickingCourtyardEntrance, motherArea, motherGeometry, motherGeometryRef, onCancel, onChildDrawCompleteRegistration, onChildMapClickRegistration, onDetectOsmBuildings, onEntrancePickerModeChange, onEntrancePointChange, onFinalSubmit, onMaskOsmBuildings, onStageChange, onUpdateCourtyardGeometries, setActiveChildArea, setActiveChildCenter, setActiveChildGeometry, setActiveChildId, setChildren, setCourtyardEntryPoint, setCourtyardName, setCurrentStep, setDetectedOsmCount, setDrawPoints, setHasCapturedClick, setIsDrawMode, setIsPickingCourtyardEntrance, setTargetBuildingCount, setTracingIndex, setTracingMode, targetBuildingCount, tracingIndex, tracingMode,
  } = useCourtyardManager(props);
  // Si la fiche individuelle d'un enfant est ouverte
  if (activeChild) {
    return (
      <ChildBuildingForm
        child={activeChild}
        zone={detectedZone}
        courtyardId={formattedCourtyardId}
        allChildrenCount={children.length}
        onSave={handleSaveChild}
        onBackToCourtyard={() => setActiveChildId(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* 🧭 EN-TÊTE PRINCIPALE DE LA CONCESSION */}
      <div className="bg-gradient-to-r from-amber-950/50 via-slate-900 to-slate-950 border border-amber-500/40 rounded-2xl p-4 shadow-xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold font-mono">
              <Home className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold bg-amber-950/80 px-2 py-0.5 rounded border border-amber-500/30">
                  PARCOURS A — COUR / CONCESSION
                </span>
              </div>
              <h3 className="text-sm font-bold text-white font-display mt-0.5">
                Cour Mère & Bâtiments Enfants
              </h3>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[9px] font-mono text-slate-400 uppercase block">Code Cour PostGIS</span>
            <span className="text-xs font-mono font-bold text-amber-300 bg-amber-950/60 px-2.5 py-1 rounded-lg border border-amber-500/30">
              {formattedCourtyardId}
            </span>
          </div>
        </div>

        {/* Détails calculs automatiques */}
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-800/80 text-xs font-mono">
          <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
            <span className="text-slate-400 text-[9px] uppercase block">Zone 200m</span>
            <span className="text-cyan-400 font-bold">{detectedZone}</span>
          </div>
          <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
            <span className="text-slate-400 text-[9px] uppercase block">Commune</span>
            <span className="text-slate-200 font-bold">{detectedCommune}</span>
          </div>
          <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
            <span className="text-slate-400 text-[9px] uppercase block">Enceinte Cour</span>
            <span className="text-amber-400 font-bold">{motherArea} m²</span>
          </div>
        </div>

        {/* Nom optionnel de la concession */}
        <div className="mt-3">
          <input
            type="text"
            value={courtyardName}
            onChange={(e) => setCourtyardName(e.target.value)}
            placeholder="Nom usuel de la concession (ex: Concession Haidara, Grande Cour Camara...)"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition"
          />
        </div>

        {/* Badge de confirmation détection spatiale OSM & Masquage automatique en bloc (Étape 1 & Étape 2) */}
        {detectedOsmCount !== null && detectedOsmCount > 0 && (
          <div className="mt-3 flex items-center justify-between gap-2 px-3 py-2 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs font-mono animate-fadeIn">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                <strong>{detectedOsmCount} ancien(s) bâtiment(s) OSM masqué(s)</strong> dans l'enceinte de cette cour.
              </span>
            </div>
            {onMaskOsmBuildings && (
              <button
                type="button"
                onClick={() => onMaskOsmBuildings(motherGeometry)}
                className="px-2 py-0.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] rounded font-mono border border-emerald-500/40 transition cursor-pointer"
                title="Forcer le re-masquage des bâtiments OSM"
              >
                Re-masquer
              </button>
            )}
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {/* ========================================================================= */}
        {/* ÉTAPE 1 : SAISIE DU NOMBRE DE BÂTIMENTS DANS CETTE COUR                   */}
        {/* ========================================================================= */}
        {currentStep === 'COUNT_SELECTION' && (
          <motion.div
            key="step-count-selection"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4"
          >
            <div className="border-b border-slate-800 pb-2">
              <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider block">
                Étape 1 / 3 — Inventaire Initial
              </span>
              <h4 className="text-sm font-bold text-white font-display mt-0.5">
                Combien de bâtiments se trouvent dans cette cour ?
              </h4>
              <p className="text-[11px] text-slate-400 font-sans mt-1">
                Indiquez le nombre de constructions physiques présentes à l'intérieur de l'enceinte de la cour. Vous délimiterez ensuite directement la toiture de chacune sur la carte satellite.
              </p>
            </div>

            {/* Boutons de sélection rapide du nombre N */}
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setTargetBuildingCount(num)}
                  className={`py-3 rounded-xl border font-mono font-bold text-base transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                    targetBuildingCount === num
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-lg shadow-cyan-500/20 scale-102'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <span>{num}</span>
                  <span className="text-[9px] font-sans font-normal text-slate-500">
                    {num === 1 ? 'bâtiment' : 'bâtiments'}
                  </span>
                </button>
              ))}
            </div>

            {/* Bouton de confirmation pour lancer le tracé */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={onCancel}
                className="text-xs text-slate-400 hover:text-slate-200 py-2 px-3 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={() => {
                  setTracingIndex(1);
                  setChildren([]);
                  handleToggleTracingMode('smart');
                  setCurrentStep('CHILDREN_TRACING');
                }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition shadow-xl shadow-cyan-600/30 active:scale-95 cursor-pointer"
              >
                <span>Démarrer le Tracé ({targetBuildingCount} {targetBuildingCount === 1 ? 'bâtiment' : 'bâtiments'})</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* ÉTAPE 2 : TRACÉ SATELLITE DIRECT SUR LA CARTE (UNIFIÉ 100% CARTE)          */}
        {/* ========================================================================= */}
        {currentStep === 'CHILDREN_TRACING' && (
          <motion.div
            key="step-children-tracing"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="bg-slate-900 border border-cyan-500/40 rounded-2xl p-4 shadow-2xl space-y-4"
          >
            {/* Bannière de progression du tracé */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-500/30">
                    Tracé {tracingIndex} / {targetBuildingCount}
                  </span>
                  <span className="text-xs font-bold text-white font-display">
                    [Bâtiment {tracingIndex}]
                  </span>
                </div>
                <h4 className="text-xs text-slate-300 font-sans mt-1">
                  Délimitez le contour de la toiture sur la carte satellite :
                </h4>
              </div>

              <div className="text-right">
                <span className="text-[9px] font-mono text-slate-400 uppercase block">Surface Toit</span>
                <span className="text-sm font-mono font-bold text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                  {activeChildArea} m²
                </span>
              </div>
            </div>

            {/* Stepper visuel des bâtiments */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {Array.from({ length: targetBuildingCount }, (_, i) => i + 1).map((idx) => {
                const isCurrent = idx === tracingIndex;
                const isDone = children.some(c => c.index === idx);
                return (
                  <div
                    key={idx}
                    className={`flex-1 min-w-[50px] p-1.5 rounded-lg border text-center text-[10px] font-mono font-bold transition-all ${
                      isCurrent
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-md'
                        : isDone
                        ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400'
                        : 'bg-slate-950 border-slate-800 text-slate-500'
                    }`}
                  >
                    {isDone ? `✓ B${idx}` : `Bât. ${idx}`}
                  </div>
                );
              })}
            </div>

            {/* 🎯 SÉLECTEUR UNIFIÉ DES 2 MODES DE TRACÉ CARTE */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => handleToggleTracingMode('smart')}
                  className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold font-mono transition-all border cursor-pointer ${
                    tracingMode === 'smart'
                      ? 'bg-cyan-950/70 text-cyan-300 border-cyan-500/50 shadow-md'
                      : 'bg-transparent text-slate-400 border-transparent hover:text-slate-200'
                  }`}
                >
                  <MousePointer className="w-3.5 h-3.5" />
                  <span>Clic Intelligent</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleTracingMode('draw')}
                  className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold font-mono transition-all border cursor-pointer ${
                    tracingMode === 'draw'
                      ? 'bg-cyan-950/70 text-cyan-300 border-cyan-500/50 shadow-md'
                      : 'bg-transparent text-slate-400 border-transparent hover:text-slate-200'
                  }`}
                >
                  <PenTool className="w-3.5 h-3.5" />
                  <span>Dessin Libre</span>
                </button>
              </div>

              {/* PANNEAU MODE 1 : CLIC INTELLIGENT */}
              {tracingMode === 'smart' && (
                <div className="p-3 bg-cyan-950/20 border border-cyan-500/30 rounded-xl space-y-2.5 animate-fadeIn">
                  <div className="flex items-start gap-2 text-xs text-cyan-200">
                    <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-cyan-300">
                        Cliquez directement sur la toiture du Bâtiment {tracingIndex}
                      </p>
                      <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                        Survolez l'image satellite à l'intérieur de la cour et cliquez sur le toit. L'algorithme détecte les contours et positionne le polygone instantanément.
                      </p>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800 text-[11px] font-mono flex items-center justify-between">
                    <span className="text-slate-400">Statut du tracé :</span>
                    {hasCapturedClick ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        Toit capturé ({activeChildArea} m²)
                      </span>
                    ) : (
                      <span className="text-amber-400 font-bold animate-pulse">
                        En attente du clic satellite...
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* PANNEAU MODE 2 : DESSIN LIBRE */}
              {tracingMode === 'draw' && (
                <div className="p-3 bg-cyan-950/20 border border-cyan-500/30 rounded-xl space-y-2.5 animate-fadeIn">
                  <div className="flex items-start gap-2 text-xs text-cyan-200">
                    <PenTool className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-cyan-300">
                        Tracez point par point le contour du Bâtiment {tracingIndex}
                      </p>
                      <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                        Cliquez successivement sur les coins de la toiture sur la carte satellite (minimum 3 points).
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between font-mono text-xs text-slate-300 bg-slate-950/80 p-2 rounded-lg border border-slate-800">
                    <span>Points tracés :</span>
                    <span className="font-bold text-cyan-300 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-500/40">
                      {drawPoints.length} points
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleValidateFreehandDraw}
                      disabled={drawPoints.length < 3}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold text-center transition-all ${
                        drawPoints.length >= 3 
                          ? 'bg-cyan-500 text-slate-950 cursor-pointer hover:bg-cyan-400 shadow-md shadow-cyan-500/20' 
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      Valider le Contour ({drawPoints.length} pts)
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (drawPoints.length === 0 || !setDrawPoints) return;
                        setDrawPoints(prev => prev.slice(0, -1));
                      }}
                      disabled={drawPoints.length === 0}
                      className={`py-2 px-2.5 rounded-lg text-xs font-bold border flex items-center justify-center gap-1 transition-all ${
                        drawPoints.length > 0 
                          ? 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-200 cursor-pointer' 
                          : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                      }`}
                      title="Annuler le dernier point"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>Retour</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (setDrawPoints) setDrawPoints([]);
                      }}
                      className="py-2 px-2.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 cursor-pointer"
                    >
                      Vider
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Actions de validation du tracé */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  if (tracingIndex > 1) {
                    setTracingIndex(prev => prev - 1);
                  } else {
                    if (setIsDrawMode) setIsDrawMode(false);
                    setCurrentStep('COUNT_SELECTION');
                  }
                }}
                className="text-xs text-slate-400 hover:text-slate-200 py-2 px-3 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                Précédent
              </button>

              {tracingMode === 'smart' && (
                <button
                  type="button"
                  onClick={() => handleConfirmChild()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition shadow-xl shadow-cyan-600/30 active:scale-95 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {tracingIndex < targetBuildingCount
                      ? `Valider Bâtiment ${tracingIndex} ➔ Passer au ${tracingIndex + 1}`
                      : `Valider Bâtiment ${tracingIndex} ➔ Tableau de bord`}
                  </span>
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* ÉTAPE 3 : TABLEAU DE BORD MASTER-DETAIL (LISTE ↔ POLYGONES CARTOGRAPHIQUES) */}
        {/* ========================================================================= */}
        {currentStep === 'MASTER_DETAIL' && (
          <motion.div
            key="step-master-detail"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4"
          >
            {/* Entête d'inventaire */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div>
                <h4 className="text-xs font-bold text-white font-display uppercase tracking-wide">
                  Bâtiments Tracés dans la Cour ({children.length})
                </h4>
                <p className="text-[10px] text-slate-400 font-sans mt-0.5">
                  Touchez un bâtiment pour ouvrir sa fiche d'identification ou corriger son tracé :
                </p>
              </div>

              <button
                type="button"
                onClick={handleAddExtraChild}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-xs font-bold transition active:scale-95 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajouter</span>
              </button>
            </div>

            {/* LISTE MASTER DES BÂTIMENTS ENFANTS */}
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {children.map((c) => {
                const isConfigured = c.isConfigured;
                const letter = String.fromCharCode(64 + c.index);
                return (
                  <motion.div
                    key={c.id}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setActiveChildId(c.id)}
                    className={`w-full p-3 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                      isConfigured
                        ? 'bg-emerald-950/20 border-emerald-500/40 hover:border-emerald-500/70 text-white'
                        : 'bg-slate-950/80 border-rose-500/40 hover:border-rose-500/70 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Pastille Indicatrice */}
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-mono font-bold text-xs ${
                        isConfigured 
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' 
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      }`}>
                        {isConfigured ? `R${letter}` : c.index}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs font-display text-white">
                            [Bâtiment {c.index}]
                          </span>
                          {isConfigured ? (
                            <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
                              🟢 Configuré
                            </span>
                          ) : (
                            <span className="text-[9px] font-mono font-bold text-rose-400 bg-rose-950/80 px-2 py-0.5 rounded-full border border-rose-500/30 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block"></span>
                              🔴 Non configuré
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-mono text-cyan-300">
                            Surface : <strong>{c.area.toFixed(0)} m²</strong>
                          </span>
                          <span className="text-slate-600">•</span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {c.hailandCode || `Code : GN-${detectedZone}-${formattedCourtyardId}-R${letter}`}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Bouton pour retracer la toiture directement sur la carte */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRetraceChild(c);
                        }}
                        className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan-400 hover:text-cyan-200 transition cursor-pointer"
                        title="Retracer la toiture sur la carte"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>

                      {/* Bouton pour configurer */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveChildId(c.id);
                        }}
                        className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                        title="Remplir la fiche d'identification"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      {children.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => handleRemoveChild(c.id, e)}
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950 text-slate-400 hover:text-rose-300 transition cursor-pointer"
                          title="Supprimer ce bâtiment"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* 🚪 BOUTON EXPLICITE INDICATION ENTRÉE DE LA COUR */}
            <div className="p-3 bg-slate-950/90 border border-slate-800 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5 font-display">
                  <DoorClosed className="w-4 h-4 text-cyan-400" />
                  Portail / Entrée Principale de la Cour
                </span>
                {courtyardEntryPoint && (
                  <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-500/30">
                    GPS Fixé
                  </span>
                )}
              </div>

              {isPickingCourtyardEntrance ? (
                <div className="p-3 bg-cyan-950/40 border border-cyan-500/50 rounded-xl text-center space-y-2 animate-pulse">
                  <p className="text-xs text-cyan-300 font-medium">
                    📍 <strong>Cliquez avec le curseur sur la carte</strong> à l'endroit identifié comme entrée / portail principal de la cour.
                  </p>
                  <button
                    type="button"
                    onClick={handleCancelPickCourtyardEntrance}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] rounded-lg border border-slate-700 transition cursor-pointer"
                  >
                    Annuler la sélection
                  </button>
                </div>
              ) : courtyardEntryPoint ? (
                <div className="flex items-center justify-between gap-2 p-2.5 bg-emerald-950/30 border border-emerald-500/30 rounded-xl">
                  <div className="text-[11px] font-mono text-emerald-300">
                    <span className="block text-[9px] uppercase text-emerald-400/70">Coordonnées GPS Fixes Portail :</span>
                    <span>Lat: {courtyardEntryPoint.coordinates[1].toFixed(6)}, Lng: {courtyardEntryPoint.coordinates[0].toFixed(6)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleStartPickCourtyardEntrance}
                      className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-bold rounded-lg border border-emerald-500/40 transition cursor-pointer"
                    >
                      Modifier l'entrée
                    </button>
                    <button
                      type="button"
                      onClick={handleResetCourtyardEntryPoint}
                      className="p-1 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded-lg transition cursor-pointer"
                      title="Réinitialiser"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleStartPickCourtyardEntrance}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-bold transition shadow-md active:scale-98 cursor-pointer"
                >
                  <MousePointer className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Indiquer l'entrée de la cour</span>
                </button>
              )}
            </div>

            {/* ACTIONS GÉNÉRALES & VALIDATION DE TOUTE LA CONCESSION */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setCurrentStep('COUNT_SELECTION')}
                className="text-xs text-slate-400 hover:text-slate-200 py-2 px-3 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                Modifier Inventaire
              </button>

              <button
                type="button"
                onClick={handleFinalSubmitAll}
                disabled={configuredCount === 0}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-xl cursor-pointer ${
                  configuredCount > 0
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 active:scale-95'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                <CheckCircle className="w-4 h-4" />
                <span>
                  {isAllConfigured
                    ? `Valider la Concession (${children.length} bâtiments)`
                    : `Enregistrer la Cour (${configuredCount}/${children.length} configurés)`}
                </span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
