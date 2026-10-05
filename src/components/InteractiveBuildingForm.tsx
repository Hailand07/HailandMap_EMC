import React from 'react';
import type { Building, EntrancePickerConfig } from '../types';
import type { RegistrationStage } from '../shell/registrationStage';
import { AssistantEngine } from '../v2/assistant/AssistantEngine';

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
  onStageChange?: (stage: RegistrationStage) => void;
}

/** Formulaire d'enregistrement : l'assistant en 5 étapes (v2). La logique de codes et d'enregistrement est dans `src/registration/`. */
export default function InteractiveBuildingForm(props: InteractiveBuildingFormProps) {
  return <AssistantEngine {...(props as any)} />;
}
