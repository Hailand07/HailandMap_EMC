/**
 * Étapes de l'assistant de création (Atelier v2). Les formulaires actuels restent le moteur : ils signalent seulement
 * où ils en sont (`onStageChange`), l'interface v2 en déduit la barre de progression.
 */
export type RegistrationStage = 'emprise' | 'structure' | 'attributs' | 'acces' | 'verification';

export const STAGES: { id: RegistrationStage; label: string }[] = [
  { id: 'emprise', label: 'Emprise' },
  { id: 'structure', label: 'Structure' },
  { id: 'attributs', label: 'Attributs' },
  { id: 'acces', label: 'Accès' },
  { id: 'verification', label: 'Vérification' },
];
