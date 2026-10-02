import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowRight, ArrowLeft, Check, Sparkles, Home, Building2, Store, Landmark, Hotel, ShieldAlert,
  Tent, HelpCircle, Layers, FileText, CheckCircle2, ChevronRight, Eye, MapPin, MousePointer,
  RotateCcw, DoorClosed
} from 'lucide-react';
import type { Building, BuildingType, BuildingStatus, PhysicalPosition, EntrancePickerConfig } from '../../types';
import HailandCodeLiveBanner from './HailandCodeLiveBanner';
import UnitsPerFloorInput, { LevelInfo } from './UnitsPerFloorInput';
import FloorDoorsSelector, { generateFloorDoors } from './FloorDoorsSelector';
import { sanitizeGeometry, sanitizeObject, normalizeBuildingType, calculateFixedCentroid } from '../../utils/safeJson';
import { resolveAdministrativeHierarchy } from '../../lib/administrativeAddressingService';

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
}

export default function DirectBuildingForm({
  initialCoords,
  detectedZone,
  detectedCommune,
  existingBuildings,
  onSubmit,
  onCancel,
  onChildMapClickRegistration,
  onEntrancePointChange,
  onEntrancePickerModeChange
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
      validated_by: 'admin-auto',
      validated_at: new Date().toISOString(),
      submitted_by: 'admin',
      claimed_by: null,
      rejection_reason: null,
      modification_request: null,
      osm_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

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

  return (
    <div className="space-y-4">
      {/* En-tête Parcours B */}
      <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            title="Retour"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white font-display">
                Bâtiment Direct (Autonome)
              </span>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-orange-950/60 text-orange-300 border border-orange-500/30">
                Chrono #{sequenceNum}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-sans">
              Surface : <strong className="text-white">{initialCoords.area ? initialCoords.area.toFixed(0) : '60'} m²</strong>
            </span>
          </div>
        </div>

        {/* Sélecteur de module (Onglets Phase 1 / Phase 2) */}
        <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveModule('PHASE1_BUILDING')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeModule === 'PHASE1_BUILDING'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Phase 1 : Bâtiment</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setHasSpecificLocation(true);
              setActiveModule('PHASE2_LOCATION');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeModule === 'PHASE2_LOCATION'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Phase 2 : Emplacement</span>
          </button>
        </div>
      </div>

      {/* Bandeau HailandCode Live */}
      {/* En Phase 1 : Affiche STRICTEMENT le code du bâtiment physique (GN-Z00142-R004) sans étage ni unité */}
      {/* En Phase 2 : Affiche le code complet de l'emplacement (GN-Z00142-R004-E2-202) */}
      <HailandCodeLiveBanner
        code={activeModule === 'PHASE1_BUILDING' ? buildingCode : finalCode}
        zone={detectedZone}
        courtyard={null}
        buildingPart={buildingDesignation}
        floorPart={activeModule === 'PHASE2_LOCATION' ? floorLevelCode : null}
        unitPart={activeModule === 'PHASE2_LOCATION' ? unitCode : null}
        isComplete={activeModule === 'PHASE1_BUILDING' ? phase1Step === 4 : phase2Step === 2}
        phase={activeModule === 'PHASE1_BUILDING' ? 'building' : 'location'}
        adminAddressCode={adminHierarchy.adminAddressCode}
        formattedAddress={adminHierarchy.formattedAddress}
        communeNom={adminHierarchy.communeNom}
        quartierNom={adminHierarchy.quartierNom}
      />

      {/* ========================================================================= */}
      {/* MODULE A : PHASE 1 — RENSEIGNEMENT DU BÂTIMENT PHYSIQUE                   */}
      {/* ========================================================================= */}
      {activeModule === 'PHASE1_BUILDING' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl min-h-[320px] flex flex-col justify-between">
          <AnimatePresence mode="wait">
            {/* Q1.1 — NATURE ET STRUCTURE DU BÂTIMENT */}
            {phase1Step === 1 && (
              <motion.div
                key="q1.1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-3"
              >
                <div className="border-b border-slate-800 pb-2">
                  <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider block">
                    Phase 1 : Fiche Bâtiment — Étape 1/4
                  </span>
                  <h3 className="text-sm font-bold text-white font-display mt-0.5">
                    1. Nature & Structure du bâtiment
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Sélectionnez la catégorie physique et le mode d'occupation.
                  </p>
                </div>

                {/* Sélecteur de type */}
                <div className="grid grid-cols-1 gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                  {buildingTypesList.map((item) => {
                    const Icon = item.icon;
                    const isSelected = buildingType === item.type;
                    return (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => {
                          setBuildingType(item.type);
                          if (item.type === 'R') {
                            setIsSubdivided(true);
                            if (floorsCount === 0) setFloorsCount(1);
                          } else {
                            setIsSubdivided(false);
                          }
                        }}
                        className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                          isSelected 
                            ? `${item.color} border-2 shadow-lg scale-[1.01]` 
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-white/10' : 'bg-slate-900'}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-[10px] bg-slate-900 px-1 py-0.2 rounded border border-slate-800">
                                [{item.type}]
                              </span>
                              <span className="font-bold text-xs text-white">{item.label}</span>
                            </div>
                            <p className="text-[10px] text-slate-400">{item.desc}</p>
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                {/* Structure globale des unités */}
                <div className="pt-1 space-y-1.5">
                  <label className="text-[10px] font-mono uppercase text-slate-400 font-bold block">
                    Mode d'organisation :
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setIsSubdivided(false)}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        !isSubdivided
                          ? 'bg-amber-950/40 border-amber-500 border-2 text-white font-bold'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span className="block text-xs font-bold font-display">Bâtiment Simple</span>
                      <span className="text-[9.5px] text-slate-400">1 seule entité globale</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsSubdivided(true);
                        if (floorsCount === 0) setFloorsCount(1);
                      }}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        isSubdivided
                          ? 'bg-amber-950/40 border-amber-500 border-2 text-white font-bold'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span className="block text-xs font-bold font-display">Immeuble Multi-Unités</span>
                      <span className="text-[9.5px] text-slate-400">Plusieurs appartements / lots</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Q1.2 — HAUTEUR & ÉTAGES (100% CONDITIONNEL ET DYNAMIQUE) */}
            {phase1Step === 2 && (
              <motion.div
                key="q1.2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-3"
              >
                <div className="border-b border-slate-800 pb-2">
                  <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider block">
                    Phase 1 : Fiche Bâtiment — Étape 2/4
                  </span>
                  <h3 className="text-sm font-bold text-white font-display mt-0.5">
                    {isSubdivided 
                      ? "Combien d'étages comporte cet immeuble multi-unités ?" 
                      : "Ce bâtiment simple est-il de plain-pied ou à étages ?"}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {isSubdivided 
                      ? "Indiquez le nombre d'étages au-dessus du RDC (ex: R+1, R+2...) puis ajustez le nombre de portes par niveau :"
                      : "Indiquez la hauteur physique de cet édifice individuel :"}
                  </p>
                </div>

                {/* CAS 1 : BÂTIMENT SIMPLE (QUESTION BINAIRE) */}
                {!isSubdivided && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFloorsCount(0)}
                      className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                        floorsCount === 0 
                          ? 'bg-amber-950/40 border-amber-500 border-2 text-white font-bold' 
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span className="block text-xs font-bold font-display">Plain-pied (RDC)</span>
                      <span className="text-[10px] text-slate-400">0 étage au-dessus du sol</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (floorsCount === 0) setFloorsCount(1);
                      }}
                      className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                        floorsCount > 0 
                          ? 'bg-amber-950/40 border-amber-500 border-2 text-white font-bold' 
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span className="block text-xs font-bold font-display">Immeuble à étages (R+N)</span>
                      <span className="text-[10px] text-slate-400">R+1, R+2, R+3, R+4...</span>
                    </button>
                  </div>
                )}

                {/* SÉLECTEUR DU NOMBRE TOTAL D'ÉTAGES (AFFICHÉ DIRECTEMENT SI MULTI-UNITÉS OU SI R+N) */}
                {(isSubdivided || floorsCount > 0) && (
                  <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 space-y-2">
                    <label className="text-[10px] font-mono uppercase text-slate-400 font-bold block">
                      Nombre total d'étages au-dessus du RDC :
                    </label>
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setFloorsCount(f)}
                          className={`w-11 h-11 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer shrink-0 flex flex-col items-center justify-center ${
                            floorsCount === f
                              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
                              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          <span>R+{f}</span>
                          <span className="text-[8px] font-sans opacity-75">({f} ét.)</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* GRILLE PROGRESSIVE PAR NIVEAU INTÉGRÉE SI MULTI-UNITÉS */}
                {isSubdivided && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase text-amber-400 font-bold block">
                      Capacité & portes par niveau (Règle d'or droite ➔ gauche) :
                    </label>
                    <UnitsPerFloorInput
                      levels={levels}
                      unitsPerFloor={unitsPerFloor}
                      onChange={setUnitsPerFloor}
                      accentColor="amber"
                    />
                  </div>
                )}

                {/* Options Sous-sol & Mezzanine */}
                <div className="p-2.5 bg-slate-950/50 rounded-xl border border-slate-800/80 space-y-1.5">
                  <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">
                    Niveaux spécifiques :
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 border border-slate-800 cursor-pointer hover:border-slate-700">
                      <input
                        type="checkbox"
                        checked={hasBasement}
                        onChange={(e) => setHasBasement(e.target.checked)}
                        className="rounded border-slate-700 text-amber-500 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span className="text-[11px] text-slate-300 font-medium">Sous-sol (SS1)</span>
                    </label>
                    
                    <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 border border-slate-800 cursor-pointer hover:border-slate-700">
                      <input
                        type="checkbox"
                        checked={hasMezzanine}
                        onChange={(e) => setHasMezzanine(e.target.checked)}
                        className="rounded border-slate-700 text-amber-500 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span className="text-[11px] text-slate-300 font-medium">Mezzanine (MEZ)</span>
                    </label>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Q1.3 — REPÈRES VISUELS & NOTES D'ACCÈS */}
            {phase1Step === 3 && (
              <motion.div
                key="q1.3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-3.5"
              >
                <div className="border-b border-slate-800 pb-2">
                  <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider block">
                    Phase 1 : Fiche Bâtiment — Étape 3/4
                  </span>
                  <h3 className="text-sm font-bold text-white font-display mt-0.5">
                    3. Repères visuels & consignes d'accès
                  </h3>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400 font-bold block">
                    Repère visuel général (ex: "En face de la pharmacie", "Immeuble carrelé") :
                  </label>
                  <input
                    type="text"
                    value={landmarkNote}
                    onChange={(e) => setLandmarkNote(e.target.value)}
                    placeholder="ex: Immeuble blanc avec portail en fer forgé..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400 font-bold block">
                    Point d'accès / Portail (Niveau 3) :
                  </label>
                  <input
                    type="text"
                    value={entryPointNote}
                    onChange={(e) => setEntryPointNote(e.target.value)}
                    placeholder="ex: Grand portail métallique noir, portillon à gauche..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition"
                  />
                </div>

                {/* 🚪 BOUTON D'INDICATION MANUELLE DE L'ENTRÉE DU BÂTIMENT */}
                <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase text-amber-400 font-bold flex items-center gap-1.5">
                      <DoorClosed className="w-3.5 h-3.5" />
                      GPS Fixe de l'Entrée Principale
                    </span>
                    {manualEntryPoint && (
                      <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
                        GPS Fixé
                      </span>
                    )}
                  </div>

                  {isPickingEntrance ? (
                    <div className="p-3 bg-cyan-950/40 border border-cyan-500/50 rounded-xl text-center space-y-2 animate-pulse">
                      <p className="text-xs text-cyan-300 font-medium">
                        📍 <strong>Cliquez sur la carte</strong> à l'emplacement exact de la porte / entrée principale du bâtiment.
                      </p>
                      <button
                        type="button"
                        onClick={handleCancelPickEntrance}
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] rounded-lg border border-slate-700 transition cursor-pointer"
                      >
                        Annuler la sélection
                      </button>
                    </div>
                  ) : manualEntryPoint ? (
                    <div className="flex items-center justify-between gap-2 p-2.5 bg-emerald-950/30 border border-emerald-500/30 rounded-xl">
                      <div className="text-[11px] font-mono text-emerald-300">
                        <span className="block text-[9px] uppercase text-emerald-400/70">Coordonnées GPS Fixes :</span>
                        <span>Lat: {manualEntryPoint.coordinates[1].toFixed(6)}, Lng: {manualEntryPoint.coordinates[0].toFixed(6)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={handleStartPickEntrance}
                          className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-bold rounded-lg border border-emerald-500/40 transition cursor-pointer"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={handleResetEntryPoint}
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
                      onClick={handleStartPickEntrance}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition shadow-md active:scale-98 cursor-pointer"
                    >
                      <MousePointer className="w-3.5 h-3.5 text-amber-400" />
                      <span>Indiquer l'entrée du bâtiment</span>
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400 font-bold block">
                    Note d'accès & ruelle (Optionnel) :
                  </label>
                  <input
                    type="text"
                    value={accessNote}
                    onChange={(e) => setAccessNote(e.target.value)}
                    placeholder="ex: Entrée côté ruelle secondaire, sonner 2 fois..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition"
                  />
                </div>
              </motion.div>
            )}

            {/* Q1.4 — VALIDATION DE LA FICHE BÂTIMENT */}
            {phase1Step === 4 && (
              <motion.div
                key="q1.4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-3.5"
              >
                <div className="border-b border-slate-800 pb-2 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider block">
                      Phase 1 Terminée — Fiche Bâtiment
                    </span>
                    <h3 className="text-sm font-bold text-white font-display mt-0.5">
                      Identifiant Unique du Bâtiment
                    </h3>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center">
                    <Building2 className="w-5 h-5" />
                  </div>
                </div>

                {/* Synthèse de la fiche */}
                <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-900">
                    <span className="text-slate-400">Code Bâtiment Physique :</span>
                    <span className="font-mono font-bold text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-500/30">
                      {buildingCode}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-900">
                    <span className="text-slate-400">Nature & Usage :</span>
                    <span className="font-medium text-white">{buildingType} — {buildingTypesList.find(t => t.type === buildingType)?.label}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-900">
                    <span className="text-slate-400">Hauteur :</span>
                    <span className="font-medium text-amber-300">
                      {floorsCount === 0 ? 'Plain-pied (RDC)' : `Immeuble R+${floorsCount} (${floorsCount} étages)`}
                    </span>
                  </div>
                  <div className="flex justify-between items-start py-1 border-b border-slate-900">
                    <span className="text-slate-400">Structure :</span>
                    <div className="text-right">
                      <span className="font-medium text-slate-200 block">
                        {isSubdivided ? `Multi-unités (${computedTotalUnits} unités)` : 'Bâtiment simple / monobloc (1 unité)'}
                      </span>
                      {isSubdivided && (
                        <span className="text-[10px] text-amber-300/80 font-mono block">
                          {levels.map(l => `${l.shortLabel}:${unitsPerFloor[l.id] || 0}`).join(' · ')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Dual GPS : Centroïde automatique + Entrée Manuelle */}
                  <div className="pt-2 mt-1 border-t border-slate-850 space-y-1.5 font-mono text-[11px]">
                    <div className="flex justify-between items-center text-slate-400">
                      <span className="text-[10px] uppercase">GPS Centroïde Toiture (Auto) :</span>
                      <span className="text-slate-300">{initialCoords.latitude.toFixed(6)}, {initialCoords.longitude.toFixed(6)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] uppercase text-amber-400 font-bold">GPS Entrée Principale (Fixe) :</span>
                      {manualEntryPoint ? (
                        <span className="text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30 text-[10px]">
                          {manualEntryPoint.coordinates[1].toFixed(6)}, {manualEntryPoint.coordinates[0].toFixed(6)}
                        </span>
                      ) : (
                        <span className="text-slate-500 italic text-[10px]">Non fixé (utilise le centre)</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* BOUTON EXPLICITE INDICATION ENTRÉE BÂTIMENT (ÉTAPE DE SYNTHÈSE) */}
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <DoorClosed className="w-4 h-4 text-amber-400" />
                      Point d'accès & Entrée du bâtiment
                    </span>
                    {manualEntryPoint && (
                      <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-500/30">
                        Fixé
                      </span>
                    )}
                  </div>

                  {isPickingEntrance ? (
                    <div className="p-3 bg-cyan-950/40 border border-cyan-500/50 rounded-xl text-center space-y-2 animate-pulse">
                      <p className="text-xs text-cyan-300 font-medium">
                        📍 <strong>Cliquez avec le curseur sur la carte</strong> à l'endroit identifié comme entrée principale de ce bâtiment.
                      </p>
                      <button
                        type="button"
                        onClick={handleCancelPickEntrance}
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] rounded-lg border border-slate-700 transition cursor-pointer"
                      >
                        Annuler la sélection
                      </button>
                    </div>
                  ) : manualEntryPoint ? (
                    <div className="flex items-center justify-between gap-2 p-2 bg-emerald-950/30 border border-emerald-500/30 rounded-lg">
                      <span className="text-[11px] font-mono text-emerald-300">
                        Entrée fixée : {manualEntryPoint.coordinates[1].toFixed(6)}, {manualEntryPoint.coordinates[0].toFixed(6)}
                      </span>
                      <button
                        type="button"
                        onClick={handleStartPickEntrance}
                        className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-bold rounded-lg border border-emerald-500/40 transition cursor-pointer"
                      >
                        Modifier l'emplacement
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartPickEntrance}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition shadow-md active:scale-98 cursor-pointer"
                    >
                      <MousePointer className="w-3.5 h-3.5 text-amber-400" />
                      <span>Indiquer l'entrée du bâtiment</span>
                    </button>
                  )}
                </div>

                {/* Choix d'action pour l'utilisateur */}
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                  <p className="text-[11px] text-slate-300 leading-snug">
                    📌 <strong>Fiche Bâtiment prête :</strong> Vous pouvez enregistrer directement ce bâtiment physique (<strong className="text-amber-300 font-mono">{buildingCode}</strong>), ou poursuivre en <strong>Phase 2</strong> pour désigner un logement/porte précis.
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      setHasSpecificLocation(true);
                      setActiveModule('PHASE2_LOCATION');
                      setPhase2Step(1);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition cursor-pointer"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>🎯 Désigner un logement / porte précis (Phase 2)</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* BARRE DE NAVIGATION INFÉRIEURE PHASE 1 */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800/80 mt-4">
            <button
              type="button"
              onClick={handlePhase1Back}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-950 hover:bg-slate-850 text-slate-300 border border-slate-800 transition active:scale-95 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{phase1Step === 1 ? 'Annuler' : 'Précédent'}</span>
            </button>

            {phase1Step < 4 ? (
              <button
                type="button"
                onClick={handlePhase1Next}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/20 transition active:scale-95 cursor-pointer"
              >
                <span>Suivant</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleFinalSubmit(false)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/30 transition active:scale-95 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Valider le Bâtiment ({buildingCode})</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODULE B : PHASE 2 — DÉSIGNATION DE L'EMPLACEMENT SPÉCIFIQUE (UNITÉ)      */}
      {/* ========================================================================= */}
      {activeModule === 'PHASE2_LOCATION' && (
        <div className="bg-slate-900/90 border border-emerald-500/40 rounded-2xl p-4 shadow-xl min-h-[320px] flex flex-col justify-between">
          <AnimatePresence mode="wait">
            {/* Q2.1 — ÉTAPE 1/2 : SÉLECTION DU NIVEAU */}
            {phase2Step === 1 && (
              <motion.div
                key="q2.1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-3.5"
              >
                <div className="border-b border-slate-800 pb-2">
                  <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider block">
                    Phase 2 : Point d'Adresse — Étape 1/2
                  </span>
                  <h3 className="text-sm font-bold text-white font-display mt-0.5">
                    1. Sélection du Niveau / Étage
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Cliquez sur le niveau de l'unité. Les portes de cet étage seront générées automatiquement.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {availableFloorsList.map((floor) => {
                    const isSelected = targetFloor === floor;
                    const floorUnits = isSubdivided ? (unitsPerFloor[floor] ?? 1) : 1;
                    return (
                      <button
                        key={floor}
                        type="button"
                        onClick={() => handleFloorSelect(floor)}
                        className={`p-3 rounded-xl border text-center transition-all cursor-pointer font-mono font-bold ${
                          isSelected
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-500/20 scale-102 ring-1 ring-emerald-400'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                        }`}
                      >
                        <span className="block text-sm">{floor}</span>
                        <span className="text-[9px] font-sans font-normal text-slate-400 block mt-0.5">
                          {floor === 'RDC' ? 'Rez-de-chaussée' : floor === 'SS1' ? 'Sous-sol' : `Étage ${floor.replace('E', '')}`}
                        </span>
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[8.5px] font-mono bg-slate-900 text-emerald-400 border border-slate-800">
                          {floorUnits} {floorUnits > 1 ? 'unités' : 'unité'}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      Niveau choisi : <strong className="text-emerald-300 font-mono text-xs">{targetFloor}</strong> ({isSubdivided ? (unitsPerFloor[targetFloor] ?? 1) : 1} portes)
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">Étape 1/2</span>
                </div>
              </motion.div>
            )}

            {/* Q2.2 — ÉTAPE 2/2 : SÉLECTION INSTANTANÉE DE L'UNITÉ (RÈGLE D'OR : DROITE ➔ GAUCHE) */}
            {phase2Step === 2 && (
              <motion.div
                key="q2.2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-3.5"
              >
                <div className="border-b border-slate-800 pb-2 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider block">
                      Phase 2 : Point d'Adresse — Étape 2/2
                    </span>
                    <h3 className="text-sm font-bold text-white font-display mt-0.5">
                      2. Choix instantané de l'unité ({targetFloor})
                    </h3>
                  </div>
                  <div className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono font-bold">
                    1-Clic
                  </div>
                </div>

                {/* Sélecteur de portes généré automatiquement selon la Règle d'Or */}
                <FloorDoorsSelector
                  floorId={targetFloor}
                  floorLabel={targetFloor === 'RDC' ? 'Rez-de-chaussée' : `Étage ${targetFloor.replace('E', '')}`}
                  totalUnitsOnFloor={isSubdivided ? (unitsPerFloor[targetFloor] ?? 1) : 1}
                  buildingType={buildingType}
                  selectedUnitCode={selectedUnitCode}
                  onSelectUnitCode={setSelectedUnitCode}
                  accentColor="emerald"
                />

                {/* Précisions d'accès Niveau 3 (Optionnel) */}
                <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 space-y-2">
                  <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider block">
                    Précisions d'Accès Niveau 3 (Optionnel) :
                  </span>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">Couleur de la porte :</label>
                      <input
                        type="text"
                        value={doorColor}
                        onChange={(e) => setDoorColor(e.target.value)}
                        placeholder="ex: Bleue, Bois verni..."
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">Code interphone / sonnette :</label>
                      <input
                        type="text"
                        value={intercomCode}
                        onChange={(e) => setIntercomCode(e.target.value)}
                        placeholder="ex: #1234, Sonnerie 'Diallo'..."
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Itinéraire intérieur / escalier :</label>
                    <input
                      type="text"
                      value={internalDirections}
                      onChange={(e) => setInternalDirections(e.target.value)}
                      placeholder="ex: Prendre l'escalier à gauche, 2ème porte dans le couloir..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition"
                    />
                  </div>
                </div>

                {/* Aperçu direct du HailandCode verrouillé */}
                <div className="p-3 bg-emerald-950/30 rounded-xl border border-emerald-500/40 text-xs flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[10px] uppercase font-mono text-emerald-400 font-bold block">
                      HailandCode Verrouillé :
                    </span>
                    <span className="font-mono font-bold text-sm text-emerald-200 tracking-wide">
                      {finalCode}
                    </span>
                  </div>
                  <div className="text-right text-[10px] text-slate-400">
                    <span className="block text-slate-300 font-semibold">{buildingDesignation} · {targetFloor} · Porte {unitCode}</span>
                    <span className="text-emerald-400 font-mono">Prêt pour enregistrement</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* BARRE DE NAVIGATION INFÉRIEURE PHASE 2 */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800/80 mt-4">
            <button
              type="button"
              onClick={handlePhase2Back}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-950 hover:bg-slate-850 text-slate-300 border border-slate-800 transition active:scale-95 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Précédent</span>
            </button>

            {phase2Step === 1 ? (
              <button
                type="button"
                onClick={handlePhase2Next}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition active:scale-95 cursor-pointer"
              >
                <span>Choisir l'unité ({targetFloor})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleFinalSubmit(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 transition active:scale-95 cursor-pointer animate-pulse"
              >
                <Check className="w-4 h-4" />
                <span>Enregistrer cette adresse ({finalCode})</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
