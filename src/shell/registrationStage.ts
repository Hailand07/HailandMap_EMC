/**
 * Étapes de l'assistant de création (Atelier v2). Les formulaires actuels restent le moteur : ils signalent seulement
 * où ils en sont (`onStageChange`), l'interface v2 en déduit la barre de progression.
 */
export type RegistrationStage = 'emprise' | 'structure' | 'attributs' | 'acces' | 'verification';

