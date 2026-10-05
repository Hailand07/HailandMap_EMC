import { useState, useEffect, useMemo } from 'react';
import { 
  Home, Building2, Store, Landmark, Hotel, ShieldAlert,
  Tent, 
} from 'lucide-react';
import type { BuildingType, PhysicalPosition } from '../types';
import type { LevelInfo } from './levels';
import { generateFloorDoors } from './floorDoors';
import { resolveAdministrativeHierarchy } from '../lib/administrativeAddressingService';

export interface ChildBuildingConfig {
  id: string;
  index: number;
  geometry: any;
  area: number;
  latitude: number;
  longitude: number;
  isConfigured: boolean;
  
  // 🧱 PHASE 1 : CARACTÉRISTIQUES PHYSIQUES DU BÂTIMENT
  hailandCode?: string;         // Code final (bâtiment ou unité si ciblée)
  buildingCode?: string;        // Code Bâtiment pur (ex: GN-Z4190-CR002-RL2)
  buildingType: BuildingType;   // R, C, M, A, H, P, T
  occupancyRelation?: 'family' | 'tenant'; // Pour R : family -> RA, tenant -> RL1
  customDesignation?: string;   // RA, RL1, C1, M1
  
  floorsCount: number;          // Nombre total d'étages (hauteur de l'immeuble : 0=RDC, 1=R+1, 2=R+2...)
  hasBasement?: boolean;        // SS1
  hasMezzanine?: boolean;       // MEZ
  
  isSubdivided: boolean;        // Bâtiment simple vs multi-unités
  totalUnitsCount?: number;     // Capacité globale / nombre total d'unités
  unitsPerFloor?: Record<string, number>; // Répartition précise par niveau
  
  physicalPosition?: PhysicalPosition | null;
  landmarkNote?: string;
  accessNote?: string;

  // 🧭 NAVIGATION & ACCÈS NIVEAU 3
  entryPointGeom?: any;
  entryPointNote?: string;
  internalDirections?: string;
  doorColor?: string;
  intercomCode?: string;

  // 🎯 PHASE 2 : EMPLACEMENT SPÉCIFIQUE (OPTIONNEL / CIBLÉ)
  hasSpecificLocation?: boolean; // True si une unité/adresse précise a été ciblée
  targetFloor?: string;         // 'RDC', 'E1', 'E2', 'SS1', 'MEZ'
  targetUnitType?: 'appartement' | 'chambre' | 'commerce' | 'bureau';
  targetUnitNumber?: number;    // ex: 202, 101, 1, 2...
  targetUnitCode?: string;      // '202', 'CH1', 'C01', 'BUR1'
  adminAddressCode?: string;
  formattedAddress?: string;
  communeNom?: string;
  quartierNom?: string;
}

interface ChildBuildingFormProps {
  child: ChildBuildingConfig;
  zone: string;
  courtyardId: string; // ex: CR002
  allChildrenCount: number;
  onSave: (updatedChild: ChildBuildingConfig) => void;
  onBackToCourtyard: () => void;
}

/**
 * Logique de ChildBuildingForm sans interface : états, calculs de codes et gestionnaires. Partagée par l'interface actuelle (v1)
 * et par l'assistant de l'Atelier v2, qui ne reprend que l'interface.
 */
export function useChildBuildingForm({
  child,
  zone,
  courtyardId,
  allChildrenCount,
  onSave,
  onBackToCourtyard
}: ChildBuildingFormProps) {
  // 🧭 GESTION DES 2 PHASES STRICTEMENT DISTINCTES
  // Phase 1 : Fiche Bâtiment (Caractéristiques physiques)
  // Phase 2 : Désignation Emplacement Spécifique (Point d'adresse final)
  const [activeModule, setActiveModule] = useState<'PHASE1_BUILDING' | 'PHASE2_LOCATION'>('PHASE1_BUILDING');

  // Sous-étapes de la Phase 1 (Fiche Bâtiment)
  // 1: Nature (Q1.1)
  // 2: Relation d'occupation (Q1.2 - Si R)
  // 3: Hauteur globale / Nombre d'étages (Q1.3)
  // 4: Structure globale des unités (Q1.4)
  // 5: Repères visuels & position physique (Q1.5)
  // 6: Récapitulatif & Validation Bâtiment (Q1.6)
  const [phase1Step, setPhase1Step] = useState<number>(1);

  // Sous-étapes de la Phase 2 (Emplacement Spécifique)
  // 1: Sélection de l'Étage visé (Q2.1)
  // 2: Sélection de l'Unité / Porte visée (Q2.2)
  // 3: Validation de l'Adresse Complète (Q2.3)
  const [phase2Step, setPhase2Step] = useState<number>(1);

  // ===== ÉTATS PHASE 1 : FICHE BÂTIMENT =====
  const [buildingType, setBuildingType] = useState<BuildingType>(child.buildingType || 'R');
  const [occupancyRelation, setOccupancyRelation] = useState<'family' | 'tenant'>(child.occupancyRelation || 'family');
  
  // Hauteur globale du bâtiment physique (combien d'étages a l'édifice)
  const [floorsCount, setFloorsCount] = useState<number>(child.floorsCount || 0);
  const [hasBasement, setHasBasement] = useState<boolean>(child.hasBasement || false);
  const [hasMezzanine, setHasMezzanine] = useState<boolean>(child.hasMezzanine || false);
  
  // Structure globale et saisie progressive par niveau
  const [isSubdivided, setIsSubdivided] = useState<boolean>(child.isSubdivided || false);
  
  // Génération dynamique de la liste ordonnée des niveaux du bâtiment
  const levels: LevelInfo[] = [];
  if (hasBasement) {
    levels.push({ id: 'SS1', label: 'Sous-sol', shortLabel: 'SS1', subtitle: 'Niveau inférieur', isSpecial: true });
  }
  levels.push({ id: 'RDC', label: 'Rez-de-chaussée', shortLabel: 'RDC', subtitle: 'Accès rue / cour' });
  for (let f = 1; f <= floorsCount; f++) {
    levels.push({ id: `E${f}`, label: `Étage ${f}`, shortLabel: `E${f}`, subtitle: f === floorsCount && floorsCount > 1 ? 'Dernier niveau' : `Niveau ${f}` });
  }
  if (hasMezzanine) {
    levels.push({ id: 'MEZ', label: 'Mezzanine', shortLabel: 'MEZ', subtitle: 'Niveau intermédiaire', isSpecial: true });
  }

  // État des unités par niveau
  const [unitsPerFloor, setUnitsPerFloor] = useState<Record<string, number>>(() => {
    if (child.unitsPerFloor && Object.keys(child.unitsPerFloor).length > 0) {
      return child.unitsPerFloor;
    }
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

  const [physicalPosition, setPhysicalPosition] = useState<PhysicalPosition | null>(child.physicalPosition || null);
  const [landmarkNote, setLandmarkNote] = useState<string>(child.landmarkNote || '');
  const [accessNote, setAccessNote] = useState<string>(child.accessNote || '');

  // 🧭 NAVIGATION & ACCÈS NIVEAU 3
  const [entryPointNote, setEntryPointNote] = useState<string>(child.entryPointNote || '');
  const [internalDirections, setInternalDirections] = useState<string>(child.internalDirections || '');
  const [doorColor, setDoorColor] = useState<string>(child.doorColor || '');
  const [intercomCode, setIntercomCode] = useState<string>(child.intercomCode || '');

  // ===== ÉTATS PHASE 2 : DÉSIGNATION DE L'EMPLACEMENT SPÉCIFIQUE =====
  const [hasSpecificLocation, setHasSpecificLocation] = useState<boolean>(child.hasSpecificLocation || false);
  const [targetFloor, setTargetFloor] = useState<string>(child.targetFloor || (floorsCount > 0 ? 'E1' : 'RDC'));
  const [selectedUnitCode, setSelectedUnitCode] = useState<string>(() => {
    if (child.targetUnitCode) return child.targetUnitCode;
    const initialFloor = child.targetFloor || (floorsCount > 0 ? 'E1' : 'RDC');
    const doors = generateFloorDoors(initialFloor, child.unitsPerFloor?.[initialFloor] || 2, child.buildingType);
    return doors[0]?.doorNumber || '101';
  });

  // Mettre à jour l'unité sélectionnée quand l'étage change si elle n'appartient plus à cet étage
  const handleFloorSelect = (floor: string) => {
    setTargetFloor(floor);
    const count = isSubdivided ? (unitsPerFloor[floor] ?? 1) : 1;
    const doors = generateFloorDoors(floor, count, buildingType);
    if (doors.length > 0 && !doors.some(d => d.doorNumber === selectedUnitCode)) {
      setSelectedUnitCode(doors[0].doorNumber);
    }
  };

  // 1. Calcul de la désignation du bâtiment dans la cour (ex: RA, RB, RL1, RL2, C1, M1...)
  const getBuildingDesignation = () => {
    const letter = String.fromCharCode(65 + (child.index - 1)); // 1->A, 2->B, 3->C...
    if (buildingType === 'R') {
      if (occupancyRelation === 'family') {
        return `R${letter}`;
      } else {
        return `RL${child.index}`;
      }
    } else {
      return `${buildingType}${child.index}`;
    }
  };

  const buildingDesignation = getBuildingDesignation();

  // 📌 2. CODE PÉRENNE DU BÂTIMENT PHYSIQUE (FIN DE PHASE 1)
  // Format : GN-[ZONE]-[COUR]-[BÂTIMENT] -> ex: GN-Z4190-CR002-RL2
  const computeBuildingCode = () => {
    return `GN-${zone}-${courtyardId}-${buildingDesignation}`;
  };

  const buildingCode = computeBuildingCode();

  // 3. Calcul dynamique de l'étage visé en Phase 2
  const getTargetFloorCode = () => {
    if (!hasSpecificLocation) return '';
    if (targetFloor === 'RDC') return '';
    return targetFloor; // ex: 'E1', 'E2', 'SS1', 'MEZ'
  };

  // 4. Code d'unité sélectionné (ex: 101, 202, 001, C01)
  const unitCode = hasSpecificLocation ? selectedUnitCode.trim().toUpperCase() : '';

  const floorLevelCode = getTargetFloorCode();

  // 🎯 5. CODE FINAL D'ADRESSE (FIN DE PHASE 2)
  // Format : GN-[ZONE]-[COUR]-[BÂTIMENT]-[ÉTAGE]*-[UNITÉ]* -> ex: GN-Z4190-CR002-RL2-E2-202
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

  // 🏛️ SYSTÈME D'ADRESSAGE ADMINISTRATIF DU BÂTIMENT ENFANT
  const adminHierarchy = useMemo(() => {
    const lotNum = courtyardId ? courtyardId.replace(/\D/g, '') || String(child.index) : String(child.index);
    return resolveAdministrativeHierarchy([child.longitude, child.latitude], {
      buildingType: buildingType,
      lotIndex: lotNum,
      unitCode: hasSpecificLocation ? (unitCode || undefined) : undefined,
      floorLevel: hasSpecificLocation ? (floorLevelCode || undefined) : undefined,
      parentHailandCode: courtyardId,
    });
  }, [child.longitude, child.latitude, buildingType, courtyardId, child.index, hasSpecificLocation, unitCode, floorLevelCode]);

  // Navigation séquentielle Phase 1 (Étapes conditionnelles 1 à 5)
  const handlePhase1Next = () => {
    if (phase1Step === 1) {
      if (buildingType === 'R') {
        setPhase1Step(2); // Q1.2 - Relation d'occupation
      } else {
        setPhase1Step(3); // Q1.3 - Hauteur & Structure
      }
    } else if (phase1Step === 2) {
      setPhase1Step(3);
    } else if (phase1Step === 3) {
      setPhase1Step(4);
    } else if (phase1Step === 4) {
      setPhase1Step(5); // Q1.5 - Récapitulatif Bâtiment
    }
  };

  const handlePhase1Back = () => {
    if (phase1Step === 5) {
      setPhase1Step(4);
    } else if (phase1Step === 4) {
      setPhase1Step(3);
    } else if (phase1Step === 3) {
      if (buildingType === 'R') {
        setPhase1Step(2);
      } else {
        setPhase1Step(1);
      }
    } else if (phase1Step === 2) {
      setPhase1Step(1);
    } else if (phase1Step === 1) {
      onBackToCourtyard();
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
    } else if (phase2Step === 1) {
      setActiveModule('PHASE1_BUILDING');
      setPhase1Step(5);
    }
  };

  // Enregistrement final (Bâtiment seul ou avec unité ciblée)
  const handleSave = (withSpecificLocation: boolean = false) => {
    const updated: ChildBuildingConfig = {
      ...child,
      isConfigured: true,
      hailandCode: withSpecificLocation ? finalCode : buildingCode,
      buildingCode: buildingCode,
      buildingType,
      occupancyRelation: buildingType === 'R' ? occupancyRelation : undefined,
      customDesignation: buildingDesignation,
      floorsCount,
      hasBasement,
      hasMezzanine,
      isSubdivided,
      totalUnitsCount: computedTotalUnits,
      unitsPerFloor: isSubdivided ? unitsPerFloor : undefined,
      physicalPosition,
      landmarkNote: landmarkNote.trim() || undefined,
      accessNote: accessNote.trim() || undefined,
      // 🧭 Navigation & Accès Niveau 3
      entryPointNote: entryPointNote.trim() || undefined,
      internalDirections: internalDirections.trim() || undefined,
      doorColor: doorColor.trim() || undefined,
      intercomCode: intercomCode.trim() || undefined,
      hasSpecificLocation: withSpecificLocation,
      targetFloor: withSpecificLocation ? targetFloor : undefined,
      targetUnitType: withSpecificLocation ? (buildingType === 'C' ? 'commerce' : 'appartement') : undefined,
      targetUnitNumber: withSpecificLocation ? parseInt(unitCode.replace(/\D/g, '')) || undefined : undefined,
      targetUnitCode: withSpecificLocation ? unitCode : undefined,
      adminAddressCode: adminHierarchy.adminAddressCode,
      formattedAddress: adminHierarchy.formattedAddress,
      communeNom: adminHierarchy.communeNom,
      quartierNom: adminHierarchy.quartierNom || undefined,
    };
    onSave(updated);
  };

  // Liste des types de bâtiment
  const buildingTypesList = [
    { type: 'R' as BuildingType, icon: Home, label: 'Résidentiel', desc: 'Maison, villa, habitation', color: 'border-orange-500 text-orange-400 bg-orange-950/20' },
    { type: 'C' as BuildingType, icon: Store, label: 'Commercial', desc: 'Boutique, magasin, marché', color: 'border-cyan-500 text-cyan-400 bg-cyan-950/20' },
    { type: 'M' as BuildingType, icon: Building2, label: 'Mixte', desc: 'Commerces en bas + Logements en haut', color: 'border-purple-500 text-purple-400 bg-purple-950/20' },
    { type: 'A' as BuildingType, icon: Landmark, label: 'Administratif / Bureau', desc: 'Bureaux, siège d\'entreprise, service', color: 'border-blue-500 text-blue-400 bg-blue-950/20' },
    { type: 'H' as BuildingType, icon: Hotel, label: 'Hébergement / Hôtel', desc: 'Hôtel, auberge, résidence meublée', color: 'border-amber-500 text-amber-400 bg-amber-950/20' },
    { type: 'P' as BuildingType, icon: ShieldAlert, label: 'Public / Établissement', desc: 'Mosquée, église, école, hôpital', color: 'border-emerald-500 text-emerald-400 bg-emerald-950/20' },
    { type: 'T' as BuildingType, icon: Tent, label: 'Temporaire / Kiosque / Container', desc: 'Container, hangar, kiosque léger', color: 'border-slate-400 text-slate-300 bg-slate-800/40' },
  ];

  // Liste des étages disponibles pour la Phase 2
  const availableFloorsList: string[] = ['RDC'];
  if (hasBasement) availableFloorsList.unshift('SS1');
  for (let f = 1; f <= floorsCount; f++) {
    availableFloorsList.push(`E${f}`);
  }
  if (hasMezzanine) availableFloorsList.push('MEZ');

  return {
    accessNote, activeModule, adminHierarchy, allChildrenCount, availableFloorsList, buildingCode, buildingDesignation, buildingType, buildingTypesList, child, computeBuildingCode, computeFullAddressCode, computedTotalUnits, courtyardId, doorColor, entryPointNote, finalCode, floorLevelCode, floorsCount, getBuildingDesignation, getTargetFloorCode, handleFloorSelect, handlePhase1Back, handlePhase1Next, handlePhase2Back, handlePhase2Next, handleSave, hasBasement, hasMezzanine, hasSpecificLocation, intercomCode, internalDirections, isSubdivided, landmarkNote, levels, occupancyRelation, onBackToCourtyard, onSave, phase1Step, phase2Step, physicalPosition, selectedUnitCode, setAccessNote, setActiveModule, setBuildingType, setDoorColor, setEntryPointNote, setFloorsCount, setHasBasement, setHasMezzanine, setHasSpecificLocation, setIntercomCode, setInternalDirections, setIsSubdivided, setLandmarkNote, setOccupancyRelation, setPhase1Step, setPhase2Step, setPhysicalPosition, setSelectedUnitCode, setTargetFloor, setUnitsPerFloor, targetFloor, unitCode, unitsPerFloor, zone,
  };
}
