import React, { useEffect, useMemo, useState } from 'react';
import { useCourtyardManager } from '../../registration/useCourtyardManager';
import type { Building, EntrancePickerConfig } from '../../types';
import { actorId } from '../../lib/actor';
import { AssistantFrame, type AssistantStage } from './AssistantFrame';
import { BuildingEditor } from './BuildingEditor';
import { Preview3D } from './Preview3D';
import { CheckList, type CheckItem } from './CheckList';
import { GhostButton, Note, Section, Segmented, TextField } from '../atoms';

export interface CourtyardAssistantProps {
  initialCoords: { latitude: number; longitude: number; geometry?: any; area?: number };
  detectedZone: string;
  detectedCommune: string;
  existingBuildings: Building[];
  onFinalSubmit: (b: Building[]) => void;
  onCancel: () => void;
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
  onSwitchPathway: (p: 'direct') => void;
}

const levelsLabel = (n: number) => (n === 0 ? 'RDC' : `R+${n}`);
const ringOf = (g: any): [number, number][] => ((g?.type === 'Polygon' ? g.coordinates?.[0] : g?.type === 'MultiPolygon' ? g.coordinates?.[0]?.[0] : null) as [number, number][]) ?? [];

/** Assistant de création d'une concession (maquettes Atelier v2). La logique (tracé, codes, enregistrement) vient du moteur existant. */
export const CourtyardAssistant: React.FC<CourtyardAssistantProps> = (props) => {
  const f = useCourtyardManager(props as any);
  const [stage, setStage] = useState<AssistantStage>('structure');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    props.onStageChange?.(stage);
  }, [stage]);

  const tracing = f.currentStep === 'CHILDREN_TRACING';
  const motherCode = `GN-${f.detectedZone}-${f.formattedCourtyardId}`;
  const letter = (i: number) => String.fromCharCode(64 + i);

  const addBuilding = () => {
    const n = f.children.length + 1;
    f.setTargetBuildingCount(n);
    f.setTracingIndex(n);
    f.handleToggleTracingMode('smart');
    f.setCurrentStep('CHILDREN_TRACING');
  };
  const stopTracing = () => {
    f.setIsDrawMode?.(false);
    f.setDrawPoints?.([]);
    f.setCurrentStep('MASTER_DETAIL');
  };

  const previewBuildings = useMemo(
    () => f.children.map((c: any) => ({ ring: ringOf(c.geometry), levels: (c.floorsCount ?? 0) + 1, label: letter(c.index) })),
    [f.children],
  );

  const checks: CheckItem[] = [
    { ok: f.children.length > 0, label: `${f.children.length} bâtiment${f.children.length > 1 ? 's' : ''} retenu${f.children.length > 1 ? 's' : ''}` },
    { ok: f.isAllConfigured, label: f.isAllConfigured ? 'Tous les bâtiments ont leurs attributs' : `${f.children.length - f.configuredCount} bâtiment(s) sans attributs`, warn: !f.isAllConfigured },
    { ok: !!f.courtyardEntryPoint, label: f.courtyardEntryPoint ? 'Portail posé sur le mur de la cour' : 'Portail non posé : le point du clic sera utilisé', warn: !f.courtyardEntryPoint },
    { ok: !!f.courtyardName.trim(), label: f.courtyardName.trim() ? `Nom usuel : ${f.courtyardName}` : 'Aucun nom usuel pour la concession', warn: !f.courtyardName.trim() },
  ];

  const order: AssistantStage[] = ['structure', 'attributs', 'acces', 'verification'];
  const idx = order.indexOf(stage);
  const labels: Record<AssistantStage, string> = { structure: 'Structure', attributs: 'Attributs', acces: 'Accès', verification: 'Vérification' };

  const canNext =
    stage === 'structure' ? f.children.length > 0 && !tracing : stage === 'attributs' ? f.isAllConfigured && !f.activeChild : true;

  const save = async () => {
    setBusy(true);
    await f.handleFinalSubmitAll();
  };

  const goNext = () => {
    if (stage === 'structure') f.setCurrentStep('MASTER_DETAIL');
    setStage(order[idx + 1]);
  };

  return (
    <AssistantFrame
      stage={stage}
      onStage={(s) => { f.setActiveChildId(null); setStage(s); }}
      title="Nouvelle concession"
      code={{ main: motherCode, sub: null, place: f.detectedCommune }}
      onQuit={f.onCancel}
      back={{ label: idx === 0 ? 'Annuler' : 'Précédent', onClick: () => { f.setActiveChildId(null); idx === 0 ? f.onCancel() : setStage(order[idx - 1]); } }}
      next={
        stage === 'verification'
          ? { label: 'Enregistrer et certifier', onClick: save, hint: 'Ctrl Entrée', busy }
          : { label: `Suivant : ${labels[order[idx + 1]].toLowerCase()}`, onClick: goNext, disabled: !canNext }
      }
      note={
        stage === 'attributs' && !f.isAllConfigured && !f.activeChild ? (
          <div className="text-[12.5px] text-hx-warn">Renseignez les attributs de chaque bâtiment pour continuer.</div>
        ) : undefined
      }
    >
      {stage === 'structure' && (
        <>
          <Section title="Type d’emprise">
            <Segmented
              label="Type d'emprise"
              value="courtyard"
              onChange={(v) => v === 'direct' && props.onSwitchPathway('direct')}
              options={[
                { value: 'direct', label: 'Bâtiment direct', hint: 'Un seul bâtiment, accès sur la rue' },
                { value: 'courtyard', label: 'Concession', hint: 'Cour fermée, plusieurs bâtiments' },
              ]}
            />
          </Section>
          <TextField label="Nom usuel" optional value={f.courtyardName} onChange={f.setCourtyardName} placeholder="Ex. Concession Haidara" />

          <Section
            title="Bâtiments de l’enceinte"
            right={<span className="text-[12px] text-hx-dim">{f.children.length} retenu{f.children.length > 1 ? 's' : ''}{f.detectedOsmCount ? ` · ${f.detectedOsmCount} détecté${f.detectedOsmCount > 1 ? 's' : ''} OSM` : ''}</span>}
          >
            {f.children.length > 0 && (
              <div className="flex flex-col overflow-hidden rounded-lg border border-hx-line">
                {f.children.map((c: any, i: number) => (
                  <div key={c.id} className={`flex items-center gap-2.5 px-3 py-2.5 ${i ? 'border-t border-hx-line' : ''}`}>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-hx-accent text-[13px] font-bold text-white">{letter(c.index)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px]">Bâtiment {letter(c.index)}</div>
                      <div className="font-mono text-[11.5px] text-hx-dim">{Math.round(c.area)} m²</div>
                    </div>
                    <button type="button" onClick={() => f.handleRetraceChild(c)} className="text-[12px] text-hx-accent-text hover:underline">Retracer</button>
                    <button type="button" onClick={(e) => f.handleRemoveChild(c.id, e)} className="text-[12px] text-hx-dim hover:text-hx-bad">Retirer</button>
                  </div>
                ))}
              </div>
            )}

            {tracing ? (
              <div className="flex flex-col gap-3 rounded-lg border border-hx-accent bg-hx-accent-soft p-3">
                <div className="text-[13px] font-semibold">Bâtiment {letter(f.tracingIndex)} : {f.tracingMode === 'smart' ? 'cliquez-le sur la carte' : 'tracez-le sommet par sommet'}</div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => f.handleToggleTracingMode('smart')} className={`h-8 flex-1 rounded-md text-[12.5px] ${f.tracingMode === 'smart' ? 'bg-hx-accent text-white' : 'bg-hx-hover text-hx-text'}`}>Clic intelligent</button>
                  <button type="button" onClick={() => f.handleToggleTracingMode('draw')} className={`h-8 flex-1 rounded-md text-[12.5px] ${f.tracingMode === 'draw' ? 'bg-hx-accent text-white' : 'bg-hx-hover text-hx-text'}`}>Tracé libre</button>
                </div>
                {f.tracingMode === 'smart' ? (
                  <div className="text-[12.5px] text-hx-dim">{f.hasCapturedClick ? `Bâtiment repéré : ${Math.round(f.activeChildArea)} m²` : 'Cliquez un bâtiment à l’intérieur de l’enceinte.'}</div>
                ) : (
                  <div className="text-[12.5px] text-hx-dim">{f.drawPoints?.length ?? 0} sommet(s) · double-clic ou premier point pour fermer</div>
                )}
                <div className="flex gap-2">
                  <GhostButton type="button" onClick={stopTracing}>Annuler</GhostButton>
                  {f.tracingMode === 'smart' ? (
                    <button type="button" disabled={!f.hasCapturedClick} onClick={() => f.handleConfirmChild()} className="h-10 flex-1 rounded-lg bg-hx-accent text-[13.5px] font-semibold text-white disabled:opacity-40">Retenir ce bâtiment</button>
                  ) : (
                    <button type="button" disabled={(f.drawPoints?.length ?? 0) < 3} onClick={() => f.handleValidateFreehandDraw()} className="h-10 flex-1 rounded-lg bg-hx-accent text-[13.5px] font-semibold text-white disabled:opacity-40">Valider le tracé</button>
                  )}
                </div>
              </div>
            ) : (
              <button type="button" onClick={addBuilding} className="h-9 rounded-lg border border-dashed border-hx-line2 text-[13px] text-hx-text transition hover:bg-hx-hover/40">
                + {f.children.length === 0 ? 'Ajouter le premier bâtiment' : 'Ajouter un bâtiment'}
              </button>
            )}
          </Section>
          <Note>Les lettres suivent l’ordre d’ajout. Les bâtiments OSM de l’enceinte sont masqués sur la carte pendant la création.</Note>
        </>
      )}

      {stage === 'attributs' && (
        f.activeChild ? (
          <BuildingEditor
            key={f.activeChild.id}
            child={f.activeChild}
            zone={f.detectedZone}
            courtyardId={f.formattedCourtyardId}
            allChildrenCount={f.children.length}
            onSave={f.handleSaveChild}
            onBack={() => f.setActiveChildId(null)}
          />
        ) : (
          <Section title="Attributs de chaque bâtiment" hint="Ouvrez un bâtiment pour renseigner sa nature, ses niveaux et son accès.">
            <div className="flex flex-col overflow-hidden rounded-lg border border-hx-line">
              {f.children.map((c: any, i: number) => (
                <button key={c.id} type="button" onClick={() => f.setActiveChildId(c.id)} className={`flex items-center gap-2.5 px-3 py-3 text-left transition hover:bg-hx-hover/40 ${i ? 'border-t border-hx-line' : ''}`}>
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-hx-accent text-[13px] font-bold text-white">{letter(c.index)}</span>
                  <div className="flex-1">
                    <div className="text-[13.5px]">Bâtiment {letter(c.index)}</div>
                    <div className="font-mono text-[11.5px] text-hx-dim">{c.isConfigured ? `${c.hailandCode} · ${levelsLabel(c.floorsCount)}` : 'à renseigner'}</div>
                  </div>
                  <span className={`text-[12px] ${c.isConfigured ? 'text-hx-ok' : 'text-hx-warn'}`}>{c.isConfigured ? '✓ saisi' : 'à saisir'}</span>
                </button>
              ))}
            </div>
          </Section>
        )
      )}

      {stage === 'acces' && (
        <>
          <Section title="Portail de la cour" hint="Posé sur le mur de l’enceinte : c’est le point où l’on entre dans la concession.">
            {f.isPickingCourtyardEntrance ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-hx-accent bg-hx-accent-soft px-3 py-2.5 text-[13px]">
                <span>Cliquez sur la carte, sur le mur de la cour…</span>
                <button type="button" onClick={f.handleCancelPickCourtyardEntrance} className="text-hx-dim hover:text-hx-text">Annuler</button>
              </div>
            ) : f.courtyardEntryPoint ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-hx-line2 px-3 py-2.5 text-[13px]">
                <span className="font-mono text-hx-dim">{f.courtyardEntryPoint.coordinates[1].toFixed(6)}, {f.courtyardEntryPoint.coordinates[0].toFixed(6)}</span>
                <span className="flex gap-3">
                  <button type="button" onClick={f.handleStartPickCourtyardEntrance} className="text-hx-accent-text hover:underline">Déplacer</button>
                  <button type="button" onClick={f.handleResetCourtyardEntryPoint} className="text-hx-dim hover:text-hx-text">Retirer</button>
                </span>
              </div>
            ) : (
              <button type="button" onClick={f.handleStartPickCourtyardEntrance} className="h-10 rounded-lg border border-dashed border-hx-line2 text-[13.5px] text-hx-text transition hover:bg-hx-hover/40">+ Poser le portail sur la carte</button>
            )}
          </Section>
          <Note>Les accès propres à chaque bâtiment (porte, interphone, itinéraire) se renseignent dans leur fiche, à l’étape précédente.</Note>
        </>
      )}

      {stage === 'verification' && (
        <>
          <Preview3D buildings={previewBuildings} courtyard={ringOf(f.motherGeometry)} />
          <Section title="Codes qui seront attribués">
            <div className="overflow-hidden rounded-lg border border-hx-line font-mono text-[12.5px]">
              <div className="flex justify-between bg-hx-card px-3 py-2.5"><span className="text-hx-accent-text">{motherCode}</span><span className="text-hx-dim">cour</span></div>
              {f.children.map((c: any) => (
                <div key={c.id} className="flex justify-between border-t border-hx-line px-3 py-2.5"><span>{c.hailandCode || c.buildingCode}</span><span className="text-hx-dim">{letter(c.index)} · {levelsLabel(c.floorsCount ?? 0)}</span></div>
              ))}
            </div>
            <div className="text-[12px] text-hx-dim">Confirmés par le système au moment de l’enregistrement.</div>
          </Section>
          <Section title="Contrôles automatiques"><CheckList items={checks} /></Section>
          <div className="flex flex-col gap-1.5 rounded-lg bg-hx-card p-3 text-[13px]">
            <div className="flex justify-between"><span className="text-hx-dim">Statut à l’enregistrement</span><span className="font-semibold text-hx-ok">Actif · certifié</span></div>
            <div className="flex justify-between"><span className="text-hx-dim">Certifié par</span><span className="font-mono text-[12px]">{String(actorId()).slice(0, 8)}…</span></div>
          </div>
        </>
      )}
    </AssistantFrame>
  );
};
