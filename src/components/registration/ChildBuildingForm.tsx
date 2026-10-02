import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowRight, ArrowLeft, Check, Sparkles, Home, Building2, Store, Landmark, Hotel, ShieldAlert,
  Tent, HelpCircle, Layers, FileText, CheckCircle2, ChevronRight, Eye, MapPin, Hash, Plus,
  Compass
} from 'lucide-react';
import type { Building, BuildingType, BuildingStatus, PhysicalPosition } from '../../types';
import HailandCodeLiveBanner from './HailandCodeLiveBanner';
import UnitsPerFloorInput, { LevelInfo } from './UnitsPerFloorInput';
import FloorDoorsSelector, { generateFloorDoors } from './FloorDoorsSelector';
import { resolveAdministrativeHierarchy } from '../../lib/administrativeAddressingService';

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

export default function ChildBuildingForm({
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

  return (
    <div className="space-y-4">
      {/* 🧭 BANDEAU SUPÉRIEUR DE NAVIGATION ENTRE MODULES */}
      <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBackToCourtyard}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            title="Retour à la cour"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white font-display">
                Fiche Bâtiment {child.index}
              </span>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-300 border border-amber-500/30">
                Cour {courtyardId}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-sans">
              Surface toiture : <strong className="text-white">{child.area.toFixed(0)} m²</strong>
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

      {/* 🏷️ BANDEAU HAILANDCODE LIVE ADAPTATIF */}
      {/* En Phase 1 : Affiche STRICTEMENT le code du bâtiment physique (GN-Z4190-CR002-RL2) sans étage/unité */}
      {/* En Phase 2 : Affiche le code complet de l'emplacement (GN-Z4190-CR002-RL2-E2-202) */}
      <HailandCodeLiveBanner
        code={activeModule === 'PHASE1_BUILDING' ? buildingCode : finalCode}
        zone={zone}
        courtyard={courtyardId}
        buildingPart={buildingDesignation}
        floorPart={activeModule === 'PHASE2_LOCATION' ? floorLevelCode : null}
        unitPart={activeModule === 'PHASE2_LOCATION' ? unitCode : null}
        isComplete={activeModule === 'PHASE1_BUILDING' ? phase1Step === 5 : phase2Step === 2}
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
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl min-h-[340px] flex flex-col justify-between">
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
                    Phase 1 : Fiche Bâtiment — Étape 1/{buildingType === 'R' ? '5' : '4'}
                  </span>
                  <h3 className="text-sm font-bold text-white font-display mt-0.5">
                    1. Nature physique & structure du bâtiment
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Définissez la catégorie d'usage et la structure d'unités de ce bâtiment dans la cour.
                  </p>
                </div>

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
                      <span className="text-[9.5px] text-slate-400">1 seule entité / monobloc</span>
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

            {/* Q1.2 — RELATION D'OCCUPATION (SI RÉSIDENTIEL R) */}
            {phase1Step === 2 && buildingType === 'R' && (
              <motion.div
                key="q1.2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-3.5"
              >
                <div className="border-b border-slate-800 pb-2">
                  <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider block">
                    Phase 1 : Fiche Bâtiment — Étape 2/5
                  </span>
                  <h3 className="text-sm font-bold text-white font-display mt-0.5">
                    2. Relation d'occupation pour ce bâtiment résidentiel
                  </h3>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {/* OPTION 1 : Même famille */}
                  <button
                    type="button"
                    onClick={() => setOccupancyRelation('family')}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                      occupancyRelation === 'family'
                        ? 'bg-amber-950/30 border-amber-500 border-2 shadow-lg text-white'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold font-mono">
                          RA
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-white">Même famille / Concession familiale</h4>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Génère une désignation par lettre alphabétique (<strong className="text-amber-300 font-mono">RA, RB, RC...</strong>).
                          </p>
                        </div>
                      </div>
                      {occupancyRelation === 'family' && <Check className="w-4 h-4 text-amber-400" />}
                    </div>
                  </button>

                  {/* OPTION 2 : Locataires indépendants */}
                  <button
                    type="button"
                    onClick={() => setOccupancyRelation('tenant')}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                      occupancyRelation === 'tenant'
                        ? 'bg-orange-950/30 border-orange-500 border-2 shadow-lg text-white'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold font-mono">
                          RL1
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-white">Locataires indépendants</h4>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Génère une désignation par lot locatif (<strong className="text-orange-300 font-mono">RL1, RL2, RL3...</strong>).
                          </p>
                        </div>
                      </div>
                      {occupancyRelation === 'tenant' && <Check className="w-4 h-4 text-orange-400" />}
                    </div>
                  </button>
                </div>

                <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    Désignation calculée du bâtiment : <strong className="text-amber-300 font-mono text-xs">{buildingDesignation}</strong>
                  </span>
                </div>
              </motion.div>
            )}

            {/* Q1.3 — HAUTEUR & ÉTAGES (100% CONDITIONNEL ET DYNAMIQUE) */}
            {phase1Step === 3 && (
              <motion.div
                key="q1.3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-3"
              >
                <div className="border-b border-slate-800 pb-2">
                  <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider block">
                    Phase 1 : Fiche Bâtiment — Étape {buildingType === 'R' ? '3/5' : '2/4'}
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
                    Niveaux spécifiques de l'édifice :
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 border border-slate-800 cursor-pointer hover:border-slate-700">
                      <input
                        type="checkbox"
                        checked={hasBasement}
                        onChange={(e) => setHasBasement(e.target.checked)}
                        className="rounded border-slate-700 text-amber-500 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span className="text-[11px] text-slate-300 font-medium">Comporte un Sous-sol (SS1)</span>
                    </label>
                    
                    <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 border border-slate-800 cursor-pointer hover:border-slate-700">
                      <input
                        type="checkbox"
                        checked={hasMezzanine}
                        onChange={(e) => setHasMezzanine(e.target.checked)}
                        className="rounded border-slate-700 text-amber-500 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span className="text-[11px] text-slate-300 font-medium">Comporte une Mezzanine (MEZ)</span>
                    </label>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Q1.4 — REPÈRES VISUELS & POSITION PHYSIQUE DANS LA COUR */}
            {phase1Step === 4 && (
              <motion.div
                key="q1.4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-3.5"
              >
                <div className="border-b border-slate-800 pb-2">
                  <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider block">
                    Phase 1 : Fiche Bâtiment — Étape {buildingType === 'R' ? '4/5' : '3/4'}
                  </span>
                  <h3 className="text-sm font-bold text-white font-display mt-0.5">
                    {buildingType === 'R' ? '4' : '3'}. Repères physiques & position dans la concession
                  </h3>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400 font-bold block">
                    Repère visuel (ex: "Bâtiment au fond de la cour", "Peinture bleue") :
                  </label>
                  <input
                    type="text"
                    value={landmarkNote}
                    onChange={(e) => setLandmarkNote(e.target.value)}
                    placeholder="ex: Bâtiment au fond à droite, mur crépi jaune..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400 font-bold block">
                    Point d'entrée du bâtiment / escalier (Niveau 3) :
                  </label>
                  <input
                    type="text"
                    value={entryPointNote}
                    onChange={(e) => setEntryPointNote(e.target.value)}
                    placeholder="ex: Entrée par la véranda, escalier extérieur..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition"
                  />
                </div>

                {/* Précisions Niveau 3 : door_color, intercom_code, internal_directions */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono uppercase text-slate-400 font-bold block">
                      Couleur de porte (Niveau 3) :
                    </label>
                    <input
                      type="text"
                      value={doorColor}
                      onChange={(e) => setDoorColor(e.target.value)}
                      placeholder="ex: Bleue, Bois verni..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono uppercase text-slate-400 font-bold block">
                      Interphone / Sonnette (Niveau 3) :
                    </label>
                    <input
                      type="text"
                      value={intercomCode}
                      onChange={(e) => setIntercomCode(e.target.value)}
                      placeholder="ex: #1234, Sonnerie..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400 font-bold block">
                    Itinéraire intérieur / Directions (Niveau 3) :
                  </label>
                  <input
                    type="text"
                    value={internalDirections}
                    onChange={(e) => setInternalDirections(e.target.value)}
                    placeholder="ex: Première maisonnette sur la droite, monter 2 marches..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400 font-bold block">
                    Consigne d'accès spécifique (Optionnel) :
                  </label>
                  <input
                    type="text"
                    value={accessNote}
                    onChange={(e) => setAccessNote(e.target.value)}
                    placeholder="ex: Clé chez le gardien, barrière ouverte le jour..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition"
                  />
                </div>

                <div className="space-y-1.5 pt-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400 font-bold block">
                    Position physique dans la cour :
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 text-xs">
                    {[
                      { id: 'fond_cour', label: 'Fond de cour' },
                      { id: 'droite', label: 'Côté droit' },
                      { id: 'gauche', label: 'Côté gauche' },
                      { id: 'milieu', label: 'Au milieu' },
                      { id: 'entree', label: 'À l\'entrée' },
                      { id: 'face_escalier', label: 'Face escalier' },
                    ].map((pos) => (
                      <button
                        key={pos.id}
                        type="button"
                        onClick={() => setPhysicalPosition(physicalPosition === pos.id ? null : (pos.id as any))}
                        className={`p-2 rounded-lg border text-center transition cursor-pointer text-[11px] ${
                          physicalPosition === pos.id
                            ? 'bg-amber-600 border-amber-500 text-white font-bold'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {pos.label}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Q1.5 — VALIDATION DE LA PHASE 1 (FICHE BÂTIMENT TERMINÉE) */}
            {phase1Step === 5 && (
              <motion.div
                key="q1.5"
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
                      Identifiant Physique du Bâtiment
                    </h3>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center">
                    <Building2 className="w-5 h-5" />
                  </div>
                </div>

                {/* Résumé de l'édifice */}
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
                    <span className="text-slate-400">Hauteur de l'immeuble :</span>
                    <span className="font-medium text-amber-300">
                      {floorsCount === 0 ? 'Plain-pied (RDC seul)' : `Immeuble R+${floorsCount} (${floorsCount} étages)`}
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
                  {landmarkNote && (
                    <div className="flex justify-between items-center py-1">
                      <span className="text-slate-400">Repère :</span>
                      <span className="text-slate-300 italic text-[11px]">{landmarkNote}</span>
                    </div>
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
              <span>{phase1Step === 1 ? 'Retour Cour' : 'Précédent'}</span>
            </button>

            {phase1Step < 5 ? (
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
                onClick={() => handleSave(false)}
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
        <div className="bg-slate-900/90 border border-emerald-500/40 rounded-2xl p-4 shadow-xl min-h-[340px] flex flex-col justify-between">
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
                onClick={() => handleSave(true)}
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
