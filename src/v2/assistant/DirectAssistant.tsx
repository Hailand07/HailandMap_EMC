import React, { useEffect, useMemo, useState } from 'react';
import { useDirectBuildingForm } from '../../registration/useDirectBuildingForm';
import { generateFloorDoors } from '../../registration/floorDoors';
import type { Building, BuildingType, EntrancePickerConfig, PhysicalPosition } from '../../types';
import { actorId } from '../../lib/actor';
import { AssistantFrame, type AssistantStage } from './AssistantFrame';
import { Preview3D } from './Preview3D';
import { CheckRow, Chips, Note, NumberStepper, Section, Segmented, TextField } from '../atoms';
import { CheckList, type CheckItem } from './CheckList';

export interface DirectAssistantProps {
  initialCoords: { latitude: number; longitude: number; buildingId?: string | number; geometry?: any; area?: number };
  detectedZone: string;
  detectedCommune: string;
  existingBuildings: Building[];
  onSubmit: (b: Building) => void;
  onCancel: () => void;
  onChildMapClickRegistration?: (handler: ((lng: number, lat: number, geom?: any, area?: number) => void) | null) => void;
  onEntrancePointChange?: (coords: { lng: number; lat: number } | null) => void;
  onEntrancePickerModeChange?: (config: EntrancePickerConfig | null) => void;
  onStageChange?: (stage: string) => void;
  onSwitchPathway: (p: 'courtyard') => void;
}

const POSITIONS: { value: PhysicalPosition; label: string }[] = [
  { value: 'droite', label: 'À droite' },
  { value: 'milieu', label: 'Au milieu' },
  { value: 'gauche', label: 'À gauche' },
  { value: 'face_escalier', label: 'Face à l’escalier' },
  { value: 'fond_cour', label: 'Fond de cour' },
  { value: 'entree', label: 'À l’entrée' },
];

const levelsLabel = (n: number) => (n === 0 ? 'RDC' : `R+${n}`);

/** Assistant de création d'un bâtiment direct (maquettes Atelier v2). La logique (codes, adresse, enregistrement) vient du moteur existant. */
export const DirectAssistant: React.FC<DirectAssistantProps> = (props) => {
  const f = useDirectBuildingForm(props as any);
  const [stage, setStage] = useState<AssistantStage>('structure');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    props.onStageChange?.(stage);
  }, [stage]);

  const ring = useMemo<[number, number][]>(() => {
    const g = f.initialCoords?.geometry;
    const r = g?.type === 'Polygon' ? g.coordinates?.[0] : g?.type === 'MultiPolygon' ? g.coordinates?.[0]?.[0] : null;
    return (r as [number, number][]) ?? [];
  }, [f.initialCoords]);

  const code = f.hasSpecificLocation ? f.finalCode : f.buildingCode;
  const place = [f.adminHierarchy.quartierNom, f.adminHierarchy.communeNom].filter(Boolean).join(', ');
  const doors = generateFloorDoors(f.targetFloor, f.isSubdivided ? (f.unitsPerFloor[f.targetFloor] ?? 1) : 1, f.buildingType);

  const checks: CheckItem[] = [
    { ok: ring.length >= 4, label: 'Contour du bâtiment fermé' },
    { ok: !!f.adminHierarchy.quartierNom, label: f.adminHierarchy.quartierNom ? `Quartier identifié : ${f.adminHierarchy.quartierNom}` : 'Quartier non identifié (commune seule)', warn: !f.adminHierarchy.quartierNom },
    { ok: !!f.manualEntryPoint, label: f.manualEntryPoint ? 'Entrée posée sur le mur' : 'Entrée non posée : le point du clic sera utilisé', warn: !f.manualEntryPoint },
    { ok: !!f.landmarkNote.trim(), label: f.landmarkNote.trim() ? 'Repère pour les visiteurs renseigné' : 'Aucun repère pour les visiteurs', warn: !f.landmarkNote.trim() },
  ];

  const save = () => {
    setBusy(true);
    f.handleFinalSubmit(f.hasSpecificLocation);
  };

  const order: AssistantStage[] = ['structure', 'attributs', 'acces', 'verification'];
  const idx = order.indexOf(stage);
  const labels: Record<AssistantStage, string> = { structure: 'Structure', attributs: 'Attributs', acces: 'Accès', verification: 'Vérification' };

  return (
    <AssistantFrame
      stage={stage}
      onStage={setStage}
      title="Nouveau bâtiment"
      code={{ main: code, sub: f.adminHierarchy.adminAddressCode, place }}
      onQuit={f.onCancel}
      back={{ label: idx === 0 ? 'Annuler' : 'Précédent', onClick: () => (idx === 0 ? f.onCancel() : setStage(order[idx - 1])) }}
      next={
        stage === 'verification'
          ? { label: 'Enregistrer et certifier', onClick: save, hint: 'Ctrl Entrée', busy }
          : { label: `Suivant : ${labels[order[idx + 1]].toLowerCase()}`, onClick: () => setStage(order[idx + 1]) }
      }
    >
      {stage === 'structure' && (
        <>
          <Section title="Type d’emprise">
            <Segmented
              label="Type d'emprise"
              value="direct"
              onChange={(v) => v === 'courtyard' && props.onSwitchPathway('courtyard')}
              options={[
                { value: 'direct', label: 'Bâtiment direct', hint: 'Un seul bâtiment, accès sur la rue' },
                { value: 'courtyard', label: 'Concession', hint: 'Cour fermée, plusieurs bâtiments' },
              ]}
            />
          </Section>
          <Section title="Emplacement détecté">
            <dl className="m-0 grid grid-cols-[110px_1fr] gap-y-2 text-[13px]">
              <dt className="text-hx-dim">Carreau</dt>
              <dd className="m-0 font-mono">{f.detectedZone}</dd>
              <dt className="text-hx-dim">Quartier</dt>
              <dd className="m-0">{place || f.detectedCommune}</dd>
              <dt className="text-hx-dim">Surface</dt>
              <dd className="m-0 font-mono">{f.initialCoords.area ? `${Math.round(f.initialCoords.area)} m²` : 'non mesurée'}</dd>
              <dt className="text-hx-dim">Numéro d’ordre</dt>
              <dd className="m-0 font-mono">{f.sequenceNum}</dd>
            </dl>
          </Section>
          <Note>Le numéro du bâtiment suit l’ordre d’enregistrement dans le carreau.</Note>
        </>
      )}

      {stage === 'attributs' && (
        <>
          <Section title="Nature du bâtiment">
            <Segmented
              label="Nature"
              value={f.buildingType}
              onChange={(v) => f.setBuildingType(v as BuildingType)}
              options={f.buildingTypesList.map((t: any) => ({ value: t.type, label: t.label, hint: t.desc }))}
            />
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
                { value: 'single', label: 'Une seule unité', hint: 'Monobloc' },
                { value: 'multi', label: 'Plusieurs unités', hint: 'Appartements, lots, boutiques' },
              ]}
            />
            {f.isSubdivided && (
              <div className="flex flex-col gap-2.5 rounded-lg border border-hx-line2 p-3">
                {f.levels.map((l: any) => (
                  <NumberStepper
                    key={l.id}
                    label={`${l.label}`}
                    value={f.unitsPerFloor[l.id] ?? 1}
                    min={0}
                    max={50}
                    onChange={(n) => f.setUnitsPerFloor((prev: Record<string, number>) => ({ ...prev, [l.id]: n }))}
                  />
                ))}
                <div className="text-right text-[12.5px] text-hx-dim">
                  Total : <b className="font-mono text-hx-text">{f.computedTotalUnits}</b>
                </div>
              </div>
            )}
          </Section>
        </>
      )}

      {stage === 'acces' && (
        <>
          <Section title="Entrée principale" hint="Posée sur le mur du bâtiment : c’est le point où le livreur ou le visiteur arrive.">
            {f.isPickingEntrance ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-hx-accent bg-hx-accent-soft px-3 py-2.5 text-[13px]">
                <span>Cliquez sur la carte, près du mur du bâtiment…</span>
                <button type="button" onClick={f.handleCancelPickEntrance} className="text-hx-dim hover:text-hx-text">
                  Annuler
                </button>
              </div>
            ) : f.manualEntryPoint ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-hx-line2 px-3 py-2.5 text-[13px]">
                <span className="font-mono text-hx-dim">
                  {f.manualEntryPoint.coordinates[1].toFixed(6)}, {f.manualEntryPoint.coordinates[0].toFixed(6)}
                </span>
                <span className="flex gap-3">
                  <button type="button" onClick={f.handleStartPickEntrance} className="text-hx-accent-text hover:underline">
                    Déplacer
                  </button>
                  <button type="button" onClick={f.handleResetEntryPoint} className="text-hx-dim hover:text-hx-text">
                    Retirer
                  </button>
                </span>
              </div>
            ) : (
              <button type="button" onClick={f.handleStartPickEntrance} className="h-10 rounded-lg border border-dashed border-hx-line2 text-[13.5px] text-hx-text transition hover:bg-hx-hover/40">
                + Poser l’entrée sur la carte
              </button>
            )}
          </Section>
          <Section title="Position de la porte">
            <Chips label="Position" value={f.physicalPosition ?? ''} onChange={(v) => f.setPhysicalPosition(v as PhysicalPosition)} options={POSITIONS} />
          </Section>
          <Section title="Pour les visiteurs">
            <TextField label="Repère" optional value={f.landmarkNote} onChange={f.setLandmarkNote} placeholder="Ex. mur crépi jaune, face à la pharmacie" />
            <TextField label="Couleur de la porte" optional value={f.doorColor} onChange={f.setDoorColor} placeholder="Ex. bleue, bois verni" />
            <TextField label="Interphone ou sonnette" optional value={f.intercomCode} onChange={f.setIntercomCode} placeholder="Ex. #1234, sonnette « Diallo »" />
            <TextField label="Itinéraire à l’intérieur" optional multiline value={f.internalDirections} onChange={f.setInternalDirections} placeholder="Ex. escalier à gauche, 2ᵉ porte du couloir" />
            <TextField label="Consignes d’accès" optional multiline value={f.accessNote} onChange={f.setAccessNote} placeholder="Ex. clé chez le gardien, portail ouvert le jour" />
          </Section>
          <Section title="Porte précise" hint="Facultatif : désigner un étage et une porte pour obtenir l’adresse d’un logement.">
            <CheckRow label="Désigner une porte précise" checked={f.hasSpecificLocation} onChange={f.setHasSpecificLocation} />
            {f.hasSpecificLocation && (
              <>
                <Chips label="Étage visé" value={f.targetFloor} onChange={f.handleFloorSelect} options={f.availableFloorsList.map((x: string) => ({ value: x, label: x }))} />
                <Chips label="Porte visée" value={f.selectedUnitCode} onChange={f.setSelectedUnitCode} options={doors.map((d) => ({ value: d.doorNumber, label: `${d.doorNumber} · ${d.positionLabel}` }))} />
              </>
            )}
          </Section>
        </>
      )}

      {stage === 'verification' && (
        <>
          <Preview3D buildings={[{ ring, levels: f.floorsCount + 1, label: f.buildingDesignation }]} />
          <Section title="Code qui sera attribué">
            <div className="overflow-hidden rounded-lg border border-hx-line font-mono text-[12.5px]">
              <div className="flex justify-between bg-hx-card px-3 py-2.5">
                <span className="text-hx-accent-text">{code}</span>
                <span className="text-hx-dim">{f.hasSpecificLocation ? 'porte' : 'bâtiment'}</span>
              </div>
              {f.adminHierarchy.adminAddressCode && (
                <div className="flex justify-between border-t border-hx-line px-3 py-2.5">
                  <span>{f.adminHierarchy.adminAddressCode}</span>
                  <span className="text-hx-dim">administratif</span>
                </div>
              )}
            </div>
          </Section>
          <Section title="Contrôles automatiques">
            <CheckList items={checks} />
          </Section>
          <div className="flex flex-col gap-1.5 rounded-lg bg-hx-card p-3 text-[13px]">
            <div className="flex justify-between">
              <span className="text-hx-dim">Statut à l’enregistrement</span>
              <span className="font-semibold text-hx-ok">Actif · certifié</span>
            </div>
            <div className="flex justify-between">
              <span className="text-hx-dim">Certifié par</span>
              <span className="font-mono text-[12px]">{String(actorId()).slice(0, 8)}…</span>
            </div>
            <div className="flex justify-between">
              <span className="text-hx-dim">Niveaux · unités</span>
              <span className="font-mono">
                {levelsLabel(f.floorsCount)} · {f.computedTotalUnits}
              </span>
            </div>
          </div>
        </>
      )}
    </AssistantFrame>
  );
};
