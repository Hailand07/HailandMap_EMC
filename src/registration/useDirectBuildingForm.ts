import { buildUnits } from './units';
import type { RegistrationStage } from '../shell/registrationStage';
import { useState, useEffect, useMemo } from 'react';
import { 
  Home, Building2, Store, Landmark, Hotel, ShieldAlert,
  Tent, 
} from 'lucide-react';
import type { Building, BuildingType, PhysicalPosition, EntrancePickerConfig } from '../types';
import type { LevelInfo } from './levels';
import { generateFloorDoors } from './floorDoors';
import { sanitizeGeometry, sanitizeObject, normalizeBuildingType, calculateFixedCentroid } from '../utils/safeJson';
import { resolveAdministrativeHierarchy } from '../lib/administrativeAddressingService';
import { actorId } from '../lib/actor';

interface DirectBuildingFormProps {
  initialCoords: {
    latitude: number;
    longitude: number;
    buildingId?: string | number;
    geometry?: any;
    area?: number;
  };
  detectedZone: string;
  detectedCommune: string;
  existingBuildings: Building[];
  onSubmit: (newBuilding: Building) => void;
  onCancel: () => void;
  onChildMapClickRegistration?: (handler: ((lng: number, lat: number, geom?: any, area?: number) => void) | null) => void;
  onEntrancePointChange?: (coords: { lng: number; lat: number } | null) => void;
  onEntrancePickerModeChange?: (config: EntrancePickerConfig | null) => void;
  onStageChange?: (stage: RegistrationStage) => void;
}

/**
 * Logique de DirectBuildingForm sans interface : états, calculs de codes et gestionnaires. Partagée par l'interface actuelle (v1)
 * et par l'assistant de l'Atelier v2, qui ne reprend que l'interface.
 */
export function useDirectBuildingForm({
  initialCoords,
  detectedZone,
  detectedCommune,
  existingBuildings,
  onSubmit,
  onCancel,
  onChildMapClickRegistration,
  onEntrancePointChange,
  onEntrancePickerModeChange,
  onStageChange
}: DirectBuildingFormProps) {
  // 🧭 SÉPARATION STRICTE EN 2 MODULES :
  // Module A : Phase 1 — Fiche Bâtiment (Caractéristiques physiques)
  // Module B : Phase 2 — Désignation Emplacement Spécifique (Point d'adresse final)
  const [activeModule, setActiveModule] = useState<'PHASE1_BUILDING' | 'PHASE2_LOCATION'>('PHASE1_BUILDING');

  // Sous-étapes Phase 1
  // 1: Classification / Nature (Q1.1)
  // 2: Hauteur globale / Nombre total d'étages (Q1.2)
  // 3: Structure globale des unités / Capacité par niveau (Q1.3)
  // 4: Repères & Notes d'accès (Q1.4)
  // 5: Validation Fiche Bâtiment (Q1.5)
  const [phase1Step, setPhase1Step] = useState<number>(1);

  // Sous-étapes Phase 2
  // 1: Sélection de l'Étage visé (Q2.1)
  // 2: Sélection de l'Unité / Porte visée (Q2.2)
  // 3: Validation de l'Adresse Finale (Q2.3)
  const [phase2Step, setPhase2Step] = useState<number>(1);

  // Progression signalée à l'interface : fiche (étapes 1-3) = attributs ; repères, étage et porte = accès ; adresse finale = vérification.
  useEffect(() => {
    if (!onStageChange) return;
    if (activeModule === 'PHASE1_BUILDING') onStageChange(phase1Step <= 3 ? 'attributs' : 'acces');
    else onStageChange(phase2Step >= 2 ? 'verification' : 'acces');
  }, [activeModule, phase1Step, phase2Step, onStageChange]);

  // Calculs automatiques séquentiels PostGIS
  const buildingsInZone = existingBuildings.filter(b => b.zone_code === detectedZone);
  const sequenceNum = buildingsInZone.length + 1;
  const formattedSeq = String(sequenceNum).padStart(3, '0');

  // ===== ÉTATS PHASE 1 : FICHE BÂTIMENT =====
  const [buildingType, setBuildingType] = useState<BuildingType>('R');
  
  // Hauteur globale du bâtiment
  const [floorsCount, setFloorsCount] = useState<number>(0);
  const [hasBasement, setHasBasement] = useState<boolean>(false);
  const [hasMezzanine, setHasMezzanine] = useState<boolean>(false);
  
  // Structure globale et saisie progressive par niveau
  const [isSubdivided, setIsSubdivided] = useState<boolean>(false);

  // Génération dynamique de la liste ordonnée des niveaux du bâtiment
  const levels: LevelInfo[] = [];
  if (hasBasement) {
    levels.push({ id: 'SS1', label: 'Sous-sol', shortLabel: 'SS1', subtitle: 'Niveau inférieur', isSpecial: true });
  }
  levels.push({ id: 'RDC', label: 'Rez-de-chaussée', shortLabel: 'RDC', subtitle: 'Accès rue direct' });
  for (let f = 1; f <= floorsCount; f++) {
    levels.push({ id: `E${f}`, label: `Étage ${f}`, shortLabel: `E${f}`, subtitle: f === floorsCount && floorsCount > 1 ? 'Dernier niveau' : `Niveau ${f}` });
  }
  if (hasMezzanine) {
    levels.push({ id: 'MEZ', label: 'Mezzanine', shortLabel: 'MEZ', subtitle: 'Niveau intermédiaire', isSpecial: true });
  }

  // État des unités par niveau
  const [unitsPerFloor, setUnitsPerFloor] = useState<Record<string, number>>(() => {
    const initialMap: Record<string, number> = {};
    levels.forEach(lvl => {
      initialMap[lvl.id] = 2;
    });
    return initialMap;
  });

  // Synchronisation dynamique si le nombre d'étages change
  useEffect(() => {
    setUnitsPerFloor(prev => {
      const nextMap = { ...prev };
      let changed = false;
      levels.forEach(lvl => {
        if (typeof nextMap[lvl.id] !== 'number') {
          nextMap[lvl.id] = 2;
          changed = true;
        }
      });
      return changed ? nextMap : prev;
    });
  }, [floorsCount, hasBasement, hasMezzanine]);

  // Calcul automatique de la somme totale des unités
  const computedTotalUnits = isSubdivided 
    ? levels.reduce((acc, lvl) => acc + (typeof unitsPerFloor[lvl.id] === 'number' ? Math.max(0, unitsPerFloor[lvl.id]) : 0), 0)
    : 1;
  
  const [physicalPosition, setPhysicalPosition] = useState<PhysicalPosition | null>(null);
  const [landmarkNote, setLandmarkNote] = useState<string>('');
  const [accessNote, setAccessNote] = useState<string>('');
  
  // 🚪 GPS FIXE D'ENTRÉE MANUELLE DU BÂTIMENT
  const [manualEntryPoint, setManualEntryPoint] = useState<{ type: 'Point', coordinates: [number, number] } | null>(null);
  const [isPickingEntrance, setIsPickingEntrance] = useState<boolean>(false);

  // Navigation & Accès Niveau 3
  const [entryPointNote, setEntryPointNote] = useState<string>('');
  const [internalDirections, setInternalDirections] = useState<string>('');
  const [doorColor, setDoorColor] = useState<string>('');
  const [intercomCode, setIntercomCode] = useState<string>('');

  // Nettoyage du handler au démontage
  useEffect(() => {
    return () => {
      if (onChildMapClickRegistration) {
        onChildMapClickRegistration(null);
      }
      if (onEntrancePickerModeChange) {
        onEntrancePickerModeChange(null);
      }
    };
  }, [onChildMapClickRegistration, onEntrancePickerModeChange]);

  // Déclencher le mode de sélection manuelle de l'entrée du bâtiment sur la carte
  const handleStartPickEntrance = () => {
    setIsPickingEntrance(true);
    if (onEntrancePickerModeChange) {
      onEntrancePickerModeChange({
        active: true,
        type: 'building',
        wallGeometry: initialCoords?.geometry,
        onPicked: (coords) => {
          const pLng = Number(coords.lng.toFixed(6));
          const pLat = Number(coords.lat.toFixed(6));
          const newPoint = { type: 'Point' as const, coordinates: [pLng, pLat] as [number, number] };
          setManualEntryPoint(newPoint);
          setIsPickingEntrance(false);
          onEntrancePointChange?.({ lng: pLng, lat: pLat });
        },
        onCancel: () => {
          setIsPickingEntrance(false);
        }
      });
    } else if (onChildMapClickRegistration) {
      onChildMapClickRegistration((lng, lat) => {
        const pLng = Number(lng.toFixed(6));
        const pLat = Number(lat.toFixed(6));
        const newPoint = { type: 'Point' as const, coordinates: [pLng, pLat] as [number, number] };
        setManualEntryPoint(newPoint);
        setIsPickingEntrance(false);
        onEntrancePointChange?.({ lng: pLng, lat: pLat });
        onChildMapClickRegistration(null);
      });
    }
  };

  const handleCancelPickEntrance = () => {
    setIsPickingEntrance(false);
    if (onEntrancePickerModeChange) {
      onEntrancePickerModeChange(null);
    }
    if (onChildMapClickRegistration) {
      onChildMapClickRegistration(null);
    }
  };

  const handleResetEntryPoint = () => {
    setManualEntryPoint(null);
    setIsPickingEntrance(false);
    onEntrancePointChange?.(null);
    if (onEntrancePickerModeChange) {
      onEntrancePickerModeChange(null);
    }
    if (onChildMapClickRegistration) {
      onChildMapClickRegistration(null);
    }
  };

  // ===== ÉTATS PHASE 2 : EMPLACEMENT SPÉCIFIQUE =====
  const [hasSpecificLocation, setHasSpecificLocation] = useState<boolean>(false);
  const [targetFloor, setTargetFloor] = useState<string>('RDC');
  const [selectedUnitCode, setSelectedUnitCode] = useState<string>(() => {
    const doors = generateFloorDoors('RDC', 2, 'R');
    return doors[0]?.doorNumber || '001';
  });

  // Mettre à jour l'unité sélectionnée quand l'étage change
  const handleFloorSelect = (floor: string) => {
    setTargetFloor(floor);
    const count = isSubdivided ? (unitsPerFloor[floor] ?? 1) : 1;
    const doors = generateFloorDoors(floor, count, buildingType);
    if (doors.length > 0 && !doors.some(d => d.doorNumber === selectedUnitCode)) {
      setSelectedUnitCode(doors[0].doorNumber);
    }
  };

  // Identifiant bâtiment autonome : [TYPE][CHRONO] ex: M007, R004, C002
  const buildingDesignation = `${buildingType}${formattedSeq}`;

  // 📌 CODE DU BÂTIMENT PHYSIQUE (FIN DE PHASE 1)
  // Format : GN-[ZONE]-[BÂTIMENT] -> ex: GN-Z00142-R004 ou GN-Z00142-M007
  const computeBuildingCode = () => {
    return `GN-${detectedZone}-${buildingDesignation}`;
  };

  const buildingCode = computeBuildingCode();

  // Calcul dynamique de l'étage visé en Phase 2
  const getTargetFloorCode = () => {
    if (!hasSpecificLocation) return '';
    if (targetFloor === 'RDC') return '';
    return targetFloor; // ex: 'E1', 'E2', 'SS1', 'MEZ'
  };

  // Code d'unité sélectionné (ex: 001, 101, 202, C01)
  const unitCode = hasSpecificLocation ? selectedUnitCode.trim().toUpperCase() : '';

  const floorLevelCode = getTargetFloorCode();

  // 🎯 CODE FINAL D'ADRESSE (FIN DE PHASE 2)
  // Format : GN-[ZONE]-[BÂTIMENT]-[ÉTAGE]*-[UNITÉ]* -> ex: GN-Z00142-M007-E2-202
  const computeFullAddressCode = () => {
    let code = buildingCode;
    if (hasSpecificLocation) {
      if (floorLevelCode) {
        code += `-${floorLevelCode}`;
      }
      if (unitCode) {
        code += `-${unitCode}`;
      }
    }
    return code;
  };

  const finalCode = computeFullAddressCode();

  // 🏛️ SYSTÈME D'ADRESSAGE ADMINISTRATIF (Résolu automatiquement en direct)
  const adminHierarchy = useMemo(() => {
    return resolveAdministrativeHierarchy([initialCoords.longitude, initialCoords.latitude], {
      buildingType: buildingType,
      lotIndex: formattedSeq,
      unitCode: hasSpecificLocation ? (unitCode || undefined) : undefined,
      floorLevel: hasSpecificLocation ? (floorLevelCode || undefined) : undefined,
    });
  }, [initialCoords.longitude, initialCoords.latitude, buildingType, formattedSeq, hasSpecificLocation, unitCode, floorLevelCode]);

  // Navigation séquentielle Phase 1 (4 étapes logiques)
  const handlePhase1Next = () => {
    if (phase1Step < 4) {
      setPhase1Step(prev => prev + 1);
    }
  };

  const handlePhase1Back = () => {
    if (phase1Step > 1) {
      setPhase1Step(prev => prev - 1);
    } else {
      onCancel();
    }
  };

  // Navigation séquentielle Phase 2 (Étape 1: Étage, Étape 2: Unité / Validation instantanée)
  const handlePhase2Next = () => {
    if (phase2Step === 1) {
      setPhase2Step(2);
    }
  };

  const handlePhase2Back = () => {
    if (phase2Step === 2) {
      setPhase2Step(1);
    } else {
      setActiveModule('PHASE1_BUILDING');
      setPhase1Step(5);
    }
  };

  // Enregistrement final du bâtiment autonome
  const handleFinalSubmit = (withSpecificLocation: boolean = false) => {
    const safeGeom = sanitizeGeometry(initialCoords.geometry) || {
      type: 'Polygon',
      coordinates: [
        [
          [initialCoords.longitude - 0.0001, initialCoords.latitude - 0.0001],
          [initialCoords.longitude + 0.0001, initialCoords.latitude - 0.0001],
          [initialCoords.longitude + 0.0001, initialCoords.latitude + 0.0001],
          [initialCoords.longitude - 0.0001, initialCoords.latitude + 0.0001],
          [initialCoords.longitude - 0.0001, initialCoords.latitude - 0.0001],
        ]
      ]
    };

    const rawBuildingId = initialCoords.buildingId ? String(initialCoords.buildingId) : '';
    const isValidUniqueId = rawBuildingId && 
      rawBuildingId !== "Tracé Personnalisé" && 
      !rawBuildingId.toLowerCase().includes("tracé");
    const uniqueBuildingId = isValidUniqueId 
      ? rawBuildingId 
      : `building-direct-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const newBuilding: Building = sanitizeObject({
      id: uniqueBuildingId,
      hailand_code: withSpecificLocation ? finalCode : buildingCode,
      parent_building_id: null,
      zone_id: null,
      zone_code: detectedZone,
      building_type: normalizeBuildingType(buildingType),
      has_courtyard: false,
      courtyard_geom: null,
      floor_count: floorsCount,
      unit_count: computedTotalUnits,
      floor_level: withSpecificLocation ? (floorLevelCode || null) : null,
      unit_code: withSpecificLocation ? (unitCode || null) : null,
      physical_position: physicalPosition || null,
      status: 'actif',
      geom: safeGeom,
      centroid: calculateFixedCentroid(safeGeom, [initialCoords.longitude, initialCoords.latitude]),
      altitude_m: 40,
      commune: adminHierarchy.communeNom || detectedCommune,
      quartier: adminHierarchy.quartierNom,
      commune_id: adminHierarchy.communeId,
      quartier_id: adminHierarchy.quartierId,
      region: adminHierarchy.regionNom,
      region_id: adminHierarchy.regionId,
      prefecture: adminHierarchy.prefectureNom,
      prefecture_id: adminHierarchy.prefectureId,
      admin_address_code: adminHierarchy.adminAddressCode,
      formatted_address: adminHierarchy.formattedAddress,
      // Navigation & Accès Niveau 3
      entry_point_geom: manualEntryPoint 
        ? sanitizeGeometry(manualEntryPoint) 
        : (initialCoords ? {
            type: 'Point',
            coordinates: [Number(initialCoords.longitude.toFixed(6)), Number(initialCoords.latitude.toFixed(6))]
          } : null),
      entry_point_note: entryPointNote.trim() || null,
      internal_directions: internalDirections.trim() || null,
      door_color: doorColor.trim() || null,
      intercom_code: intercomCode.trim() || null,
      // Notes & Repères
      landmark_note: landmarkNote.trim() || `Bâtiment ${buildingDesignation}`,
      access_note: accessNote.trim() || null,
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

    // Unités du bâtiment (maison familiale = une seule unité) : enregistrées après le bâtiment (building_units).
    (newBuilding as any).units = buildUnits({ levels: availableFloorsList, isSubdivided, unitsPerFloor, buildingType });
    onSubmit(newBuilding);
  };

  // Liste des natures de bâtiment
  const buildingTypesList = [
    { type: 'R' as BuildingType, icon: Home, label: 'Résidentiel', desc: 'Maison, villa, habitation', color: 'border-orange-500 text-orange-400 bg-orange-950/20' },
    { type: 'C' as BuildingType, icon: Store, label: 'Commercial', desc: 'Boutique, magasin, marché', color: 'border-cyan-500 text-cyan-400 bg-cyan-950/20' },
    { type: 'M' as BuildingType, icon: Building2, label: 'Mixte', desc: 'Commerces en bas + Logements en haut', color: 'border-purple-500 text-purple-400 bg-purple-950/20' },
    { type: 'A' as BuildingType, icon: Landmark, label: 'Administratif / Entreprise', desc: 'Bureaux, siège, entreprise', color: 'border-blue-500 text-blue-400 bg-blue-950/20' },
    { type: 'H' as BuildingType, icon: Hotel, label: 'Hébergement / Hôtel', desc: 'Hôtel, auberge, motel', color: 'border-amber-500 text-amber-400 bg-amber-950/20' },
    { type: 'P' as BuildingType, icon: ShieldAlert, label: 'Public / Établissement', desc: 'Mosquée, école, clinique', color: 'border-emerald-500 text-emerald-400 bg-emerald-950/20' },
    { type: 'T' as BuildingType, icon: Tent, label: 'Temporaire / Kiosque / Container', desc: 'Container, kiosque, abri léger', color: 'border-slate-400 text-slate-300 bg-slate-800/40' },
  ];

  // Liste des étages disponibles pour la Phase 2
  const availableFloorsList: string[] = ['RDC'];
  if (hasBasement) availableFloorsList.unshift('SS1');
  for (let f = 1; f <= floorsCount; f++) {
    availableFloorsList.push(`E${f}`);
  }
  if (hasMezzanine) availableFloorsList.push('MEZ');

  return {
    accessNote, activeModule, adminHierarchy, availableFloorsList, buildingCode, buildingDesignation, buildingType, buildingTypesList, buildingsInZone, computeBuildingCode, computeFullAddressCode, computedTotalUnits, detectedCommune, detectedZone, doorColor, entryPointNote, existingBuildings, finalCode, floorLevelCode, floorsCount, formattedSeq, getTargetFloorCode, handleCancelPickEntrance, handleFinalSubmit, handleFloorSelect, handlePhase1Back, handlePhase1Next, handlePhase2Back, handlePhase2Next, handleResetEntryPoint, handleStartPickEntrance, hasBasement, hasMezzanine, hasSpecificLocation, initialCoords, intercomCode, internalDirections, isPickingEntrance, isSubdivided, landmarkNote, levels, manualEntryPoint, onCancel, onChildMapClickRegistration, onEntrancePickerModeChange, onEntrancePointChange, onStageChange, onSubmit, phase1Step, phase2Step, physicalPosition, selectedUnitCode, sequenceNum, setAccessNote, setActiveModule, setBuildingType, setDoorColor, setEntryPointNote, setFloorsCount, setHasBasement, setHasMezzanine, setHasSpecificLocation, setIntercomCode, setInternalDirections, setIsPickingEntrance, setIsSubdivided, setLandmarkNote, setManualEntryPoint, setPhase1Step, setPhase2Step, setPhysicalPosition, setSelectedUnitCode, setTargetFloor, setUnitsPerFloor, targetFloor, unitCode, unitsPerFloor,
  };
}
