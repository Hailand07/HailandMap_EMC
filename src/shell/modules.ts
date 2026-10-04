import type { View } from '../types';

/**
 * Les cinq modules de l'Atelier v2 et la vue actuelle qui les porte pendant la transition (phase 0) :
 * Atelier = Cartographie 3D, Revue = Modération, Registre = Registre cadastral, Territoire = Frontières, Pilotage = Tour de contrôle.
 */
export type ModuleId = 'atelier' | 'revue' | 'registre' | 'territoire' | 'pilotage';

export interface ModuleInfo {
  id: ModuleId;
  label: string;
  view: View;
}

export const MODULES: ModuleInfo[] = [
  { id: 'atelier', label: 'Atelier', view: 'carte' },
  { id: 'revue', label: 'Revue', view: 'validations' },
  { id: 'registre', label: 'Registre', view: 'batiments' },
  { id: 'territoire', label: 'Territoire', view: 'zones' },
  { id: 'pilotage', label: 'Pilotage', view: 'dashboard' },
];

export const moduleOfView = (v: View): ModuleInfo => MODULES.find((m) => m.view === v) ?? MODULES[0];
