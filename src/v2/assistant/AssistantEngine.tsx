import React, { useEffect, useState } from 'react';
import type { Building, EntrancePickerConfig } from '../../types';
import { DirectAssistant } from './DirectAssistant';
import { CourtyardAssistant } from './CourtyardAssistant';

export interface AssistantEngineProps {
  clickedCoords: { latitude: number; longitude: number; buildingId?: string | number; geometry?: any; area?: number };
  buildings: Building[];
  onCancel: () => void;
  onSubmit: (b: Building | Building[]) => void;
  detect200mZoneFromCoords: (lng: number, lat: number) => string;
  detectCommuneFromCoords: (lng: number, lat: number) => string;
  initialHasCourtyard?: boolean;
  targetNature?: 'single' | 'courtyard';
  onUpdateCourtyardGeometries?: any;
  isDrawMode?: boolean;
  setIsDrawMode?: (d: boolean) => void;
  drawPoints?: [number, number][];
  setDrawPoints?: React.Dispatch<React.SetStateAction<[number, number][]>>;
  onChildMapClickRegistration?: (h: any) => void;
  onChildDrawCompleteRegistration?: (h: any) => void;
  onEntrancePointChange?: (c: { lng: number; lat: number } | null) => void;
  onEntrancePickerModeChange?: (c: EntrancePickerConfig | null) => void;
  onDetectOsmBuildings?: (g: any) => string[] | void;
  onMaskOsmBuildings?: (g?: any) => number;
  onStageChange?: (stage: string) => void;
}

/** Moteur de l'assistant v2 : choisit le parcours (bâtiment direct ou concession) selon l'outil, puis monte l'assistant correspondant. */
export const AssistantEngine: React.FC<AssistantEngineProps> = (p) => {
  const zone = p.detect200mZoneFromCoords(p.clickedCoords.longitude, p.clickedCoords.latitude) || 'Z00142';
  const commune = p.detectCommuneFromCoords(p.clickedCoords.longitude, p.clickedCoords.latitude) || 'Ratoma';
  const [pathway, setPathway] = useState<'direct' | 'courtyard'>(p.targetNature === 'courtyard' || p.initialHasCourtyard ? 'courtyard' : 'direct');

  useEffect(() => {
    if (p.targetNature) setPathway(p.targetNature === 'courtyard' ? 'courtyard' : 'direct');
  }, [p.targetNature, p.clickedCoords]);

  return pathway === 'courtyard' ? (
    <CourtyardAssistant
      key="courtyard"
      initialCoords={p.clickedCoords}
      detectedZone={zone}
      detectedCommune={commune}
      existingBuildings={p.buildings}
      onUpdateCourtyardGeometries={p.onUpdateCourtyardGeometries}
      isDrawMode={p.isDrawMode}
      setIsDrawMode={p.setIsDrawMode}
      drawPoints={p.drawPoints}
      setDrawPoints={p.setDrawPoints}
      onChildMapClickRegistration={p.onChildMapClickRegistration}
      onChildDrawCompleteRegistration={p.onChildDrawCompleteRegistration}
      onEntrancePointChange={p.onEntrancePointChange}
      onEntrancePickerModeChange={p.onEntrancePickerModeChange}
      onDetectOsmBuildings={p.onDetectOsmBuildings}
      onMaskOsmBuildings={p.onMaskOsmBuildings}
      onStageChange={p.onStageChange}
      onSwitchPathway={setPathway}
      onFinalSubmit={(bs) => p.onSubmit(bs)}
      onCancel={p.onCancel}
    />
  ) : (
    <DirectAssistant
      key="direct"
      initialCoords={p.clickedCoords}
      detectedZone={zone}
      detectedCommune={commune}
      existingBuildings={p.buildings}
      onChildMapClickRegistration={p.onChildMapClickRegistration}
      onEntrancePointChange={p.onEntrancePointChange}
      onEntrancePickerModeChange={p.onEntrancePickerModeChange}
      onStageChange={p.onStageChange}
      onSwitchPathway={setPathway}
      onSubmit={(b) => p.onSubmit(b)}
      onCancel={p.onCancel}
    />
  );
};
