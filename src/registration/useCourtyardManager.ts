import type { RegistrationStage } from '../shell/registrationStage';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Building, EntrancePickerConfig } from '../types';
import type { ChildBuildingConfig } from './useChildBuildingForm';
import { 
  sanitizeGeometry, 
  sanitizeObject, 
  safeCalculateArea, 
  generateSquarePolygon, 
  calculatePolygonArea,
  normalizeBuildingType,
  calculateFixedCentroid
} from '../utils/safeJson';
import { saveCourtyardWithBuildings } from '../lib/supabase';
import { resolveAdministrativeHierarchy } from '../lib/administrativeAddressingService';
import { actorId } from '../lib/actor';

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
      submitted_by: actorId(),
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
        submitted_by: actorId(),
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
