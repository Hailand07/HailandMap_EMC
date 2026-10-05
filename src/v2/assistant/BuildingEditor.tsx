import React from 'react';
import { useChildBuildingForm, type ChildBuildingConfig } from '../../registration/useChildBuildingForm';
import { generateFloorDoors } from '../../registration/floorDoors';
import type { BuildingType, PhysicalPosition } from '../../types';
import { CheckRow, Chips, GhostButton, NumberStepper, PrimaryButton, Section, Segmented, TextField } from '../atoms';

const POSITIONS: { value: PhysicalPosition; label: string }[] = [
  { value: 'droite', label: 'À droite' },
  { value: 'milieu', label: 'Au milieu' },
  { value: 'gauche', label: 'À gauche' },
  { value: 'face_escalier', label: 'Face à l’escalier' },
  { value: 'fond_cour', label: 'Fond de cour' },
  { value: 'entree', label: 'À l’entrée' },
];
const levelsLabel = (n: number) => (n === 0 ? 'RDC' : `R+${n}`);

interface Props {
  child: ChildBuildingConfig;
  zone: string;
  courtyardId: string;
  allChildrenCount: number;
  onSave: (c: ChildBuildingConfig) => void;
  onBack: () => void;
}

/** Fiche d'un bâtiment de la concession (attributs + accès du bâtiment). Logique : moteur existant `useChildBuildingForm`. */
export const BuildingEditor: React.FC<Props> = ({ child, zone, courtyardId, allChildrenCount, onSave, onBack }) => {
  const f = useChildBuildingForm({ child, zone, courtyardId, allChildrenCount, onSave, onBackToCourtyard: onBack } as any);
  const letter = String.fromCharCode(64 + child.index);
  const doors = generateFloorDoors(f.targetFloor, f.isSubdivided ? (f.unitsPerFloor[f.targetFloor] ?? 1) : 1, f.buildingType);
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-hx-accent text-[13px] font-bold text-white">{letter}</span>
          <div>
            <div className="text-[14px] font-semibold">Bâtiment {letter}</div>
            <div className="font-mono text-[12px] text-hx-dim">{f.hasSpecificLocation ? f.finalCode : f.buildingCode}</div>
          </div>
        </div>
        <button type="button" onClick={onBack} className="text-[12.5px] text-hx-faint hover:text-hx-text">
          ← Liste
        </button>
      </div>

      <Section title="Nature">
        <Segmented
          label="Nature"
          value={f.buildingType}
          onChange={(v) => f.setBuildingType(v as BuildingType)}
          options={f.buildingTypesList.map((t: any) => ({ value: t.type, label: t.label, hint: t.desc }))}
        />
        {f.buildingType === 'R' && (
          <Segmented
            label="Occupation"
            value={f.occupancyRelation}
            onChange={(v) => f.setOccupancyRelation(v as 'family' | 'tenant')}
            options={[
              { value: 'family', label: 'Même famille', hint: `Code R${letter}` },
              { value: 'tenant', label: 'Locataires indépendants', hint: `Code RL${child.index}` },
            ]}
          />
        )}
      </Section>

      <Section title="Hauteur">
        <NumberStepper label="Niveaux" value={f.floorsCount} onChange={f.setFloorsCount} max={30} format={levelsLabel} />
        <div className="grid grid-cols-2 gap-2">
          <CheckRow label="Sous-sol" checked={f.hasBasement} onChange={f.setHasBasement} />
          <CheckRow label="Mezzanine" checked={f.hasMezzanine} onChange={f.setHasMezzanine} />
        </div>
      </Section>

      <Section title="Logements ou unités">
        <Segmented
          label="Structure"
          value={f.isSubdivided ? 'multi' : 'single'}
          onChange={(v) => f.setIsSubdivided(v === 'multi')}
          options={[
            { value: 'single', label: 'Une seule unité' },
            { value: 'multi', label: 'Plusieurs unités' },
          ]}
        />
        {f.isSubdivided && (
          <div className="flex flex-col gap-2.5 rounded-lg border border-hx-line2 p-3">
            {f.levels.map((l: any) => (
              <NumberStepper key={l.id} label={l.label} value={f.unitsPerFloor[l.id] ?? 1} min={0} max={50} onChange={(n) => f.setUnitsPerFloor((prev: Record<string, number>) => ({ ...prev, [l.id]: n }))} />
            ))}
            <div className="text-right text-[12.5px] text-hx-dim">
              Total : <b className="font-mono text-hx-text">{f.computedTotalUnits}</b>
            </div>
          </div>
        )}
      </Section>

      <Section title="Accès du bâtiment">
        <Chips label="Position" value={f.physicalPosition ?? ''} onChange={(v) => f.setPhysicalPosition(v as PhysicalPosition)} options={POSITIONS} />
        <TextField label="Repère" optional value={f.landmarkNote} onChange={f.setLandmarkNote} placeholder="Ex. première maisonnette à droite" />
        <TextField label="Couleur de la porte" optional value={f.doorColor} onChange={f.setDoorColor} placeholder="Ex. bleue" />
        <TextField label="Interphone ou sonnette" optional value={f.intercomCode} onChange={f.setIntercomCode} />
        <TextField label="Itinéraire à l’intérieur" optional multiline value={f.internalDirections} onChange={f.setInternalDirections} />
        <TextField label="Consignes d’accès" optional multiline value={f.accessNote} onChange={f.setAccessNote} />
      </Section>

      <Section title="Porte précise" hint="Facultatif : désigner un étage et une porte.">
        <CheckRow label="Désigner une porte précise" checked={f.hasSpecificLocation} onChange={f.setHasSpecificLocation} />
        {f.hasSpecificLocation && (
          <>
            <Chips label="Étage visé" value={f.targetFloor} onChange={f.handleFloorSelect} options={f.availableFloorsList.map((x: string) => ({ value: x, label: x }))} />
            <Chips label="Porte visée" value={f.selectedUnitCode} onChange={f.setSelectedUnitCode} options={doors.map((d) => ({ value: d.doorNumber, label: `${d.doorNumber} · ${d.positionLabel}` }))} />
          </>
        )}
      </Section>

      <div className="flex gap-2.5">
        <GhostButton type="button" onClick={onBack}>
          Retour
        </GhostButton>
        <PrimaryButton type="button" onClick={() => f.handleSave(f.hasSpecificLocation)}>
          Enregistrer le bâtiment {letter}
        </PrimaryButton>
      </div>
    </div>
  );
};
