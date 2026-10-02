import React from 'react';
import type { Building, EntrancePickerConfig } from '../types';
import RegistrationEngineV3 from './registration/RegistrationEngineV3';

export interface InteractiveBuildingFormProps {
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

/**
 * MOTEUR D'ENREGISTREMENT HAILANDMAP ADMIN v3.0
 * 
 * Saisie séquentielle à une seule question par écran (Machine d'état).
 * L'utilisateur ne saisit jamais de code manuellement : le HailandCode est calculé dynamiquement.
 * 
 * 🛑 ÉTAPE 0 — CHOIX INITIAL DE LA STRUCTURE :
 *   - [ Option A : COUR / CONCESSION ]
 *   - [ Option B : BÂTIMENT DIRECT ]
 * 
 * 🔷 PARCOURS A : COUR / CONCESSION
 *   - Tracé Cour Mère (PostGIS CRxxx)
 *   - Tracé & Inventaire Bâtiments Enfants (🔴 Non configuré ➔ 🟢 Configuré)
 *   - Saisie séquentielle individuelle (Nature, Relation occupation, Niveaux, Subdivision Unités, Repères)
 * 
 * 🟧 PARCOURS B : BÂTIMENT DIRECT
 *   - Tracé Bâtiment Autonome (PostGIS Chrono M007/R001...)
 *   - Saisie séquentielle (Nature, Niveaux, Subdivision Unités, Repères)
 */
export default function InteractiveBuildingForm(props: InteractiveBuildingFormProps) {
  return <RegistrationEngineV3 {...props} />;
}
