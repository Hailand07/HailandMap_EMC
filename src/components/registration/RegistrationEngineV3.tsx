import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { Building, EntrancePickerConfig } from '../../types';
import StructureChoiceStep from './StructureChoiceStep';
import CourtyardManager from './CourtyardManager';
import DirectBuildingForm from './DirectBuildingForm';

export interface RegistrationEngineV3Props {
  clickedCoords: {
    latitude: number;
    longitude: number;
    buildingId?: string | number;
    geometry?: any;
    area?: number;
  };
  buildings: Building[];
  onCancel: () => void;
  onSubmit: (newBuilding: Building | Building[]) => void;
  detect200mZoneFromCoords: (lng: number, lat: number) => string;
  detectCommuneFromCoords: (lng: number, lat: number) => string;
  currentStyle?: string;
  handleStyleChange?: (style: string) => void;
  initialHasCourtyard?: boolean;
  targetNature?: 'single' | 'courtyard';
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
}

export default function RegistrationEngineV3({
  clickedCoords,
  buildings,
  onCancel,
  onSubmit,
  detect200mZoneFromCoords,
  detectCommuneFromCoords,
  initialHasCourtyard,
  targetNature,
  onUpdateCourtyardGeometries,
  isDrawMode,
  setIsDrawMode,
  drawPoints,
  setDrawPoints,
  onChildMapClickRegistration,
  onChildDrawCompleteRegistration,
  onEntrancePointChange,
  onEntrancePickerModeChange,
  onDetectOsmBuildings,
  onMaskOsmBuildings
}: RegistrationEngineV3Props) {
  // Détection automatique PostGIS
  const detectedZone = detect200mZoneFromCoords(clickedCoords.longitude, clickedCoords.latitude) || 'Z00142';
  const detectedCommune = detectCommuneFromCoords(clickedCoords.longitude, clickedCoords.latitude) || 'Ratoma';

  // Étape 0 : Choix initial de la structure ('courtyard' | 'direct' | null)
  const [selectedPathway, setSelectedPathway] = useState<'courtyard' | 'direct' | null>(() => {
    if (initialHasCourtyard === true || targetNature === 'courtyard') return 'courtyard';
    if (initialHasCourtyard === false || targetNature === 'single') return 'direct';
    return null; // Affiche l'écran de départ Étape 0
  });

  // Quand une nouvelle coordonnée arrive, si aucune sélection préalable n'était figée
  useEffect(() => {
    if (targetNature === 'courtyard') {
      setSelectedPathway('courtyard');
    } else if (targetNature === 'single') {
      setSelectedPathway('direct');
    }
  }, [targetNature, clickedCoords]);

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {/* ÉTAPE 0 — CHOIX INITIAL DE LA STRUCTURE */}
        {!selectedPathway && (
          <motion.div
            key="step-0-choice"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <StructureChoiceStep
              detectedZone={detectedZone}
              detectedCommune={detectedCommune}
              onSelectOption={(option) => setSelectedPathway(option)}
              onCancel={onCancel}
            />
          </motion.div>
        )}

        {/* PARCOURS A : COUR / CONCESSION */}
        {selectedPathway === 'courtyard' && (
          <motion.div
            key="pathway-courtyard"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <CourtyardManager
              initialCoords={clickedCoords}
              detectedZone={detectedZone}
              detectedCommune={detectedCommune}
              existingBuildings={buildings}
              onUpdateCourtyardGeometries={onUpdateCourtyardGeometries}
              isDrawMode={isDrawMode}
              setIsDrawMode={setIsDrawMode}
              drawPoints={drawPoints}
              setDrawPoints={setDrawPoints}
              onChildMapClickRegistration={onChildMapClickRegistration}
              onChildDrawCompleteRegistration={onChildDrawCompleteRegistration}
              onEntrancePointChange={onEntrancePointChange}
              onEntrancePickerModeChange={onEntrancePickerModeChange}
              onDetectOsmBuildings={onDetectOsmBuildings}
              onMaskOsmBuildings={onMaskOsmBuildings}
              onFinalSubmit={(courtyardBuildings) => {
                onSubmit(courtyardBuildings);
              }}
              onCancel={() => {
                // Possibilité de revenir au choix d'étape 0
                setSelectedPathway(null);
              }}
            />
          </motion.div>
        )}

        {/* PARCOURS B : BÂTIMENT DIRECT */}
        {selectedPathway === 'direct' && (
          <motion.div
            key="pathway-direct"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <DirectBuildingForm
              initialCoords={clickedCoords}
              detectedZone={detectedZone}
              detectedCommune={detectedCommune}
              existingBuildings={buildings}
              onChildMapClickRegistration={onChildMapClickRegistration}
              onEntrancePointChange={onEntrancePointChange}
              onEntrancePickerModeChange={onEntrancePickerModeChange}
              onSubmit={(directBuilding) => {
                onSubmit(directBuilding);
              }}
              onCancel={() => {
                // Possibilité de revenir au choix d'étape 0
                setSelectedPathway(null);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
