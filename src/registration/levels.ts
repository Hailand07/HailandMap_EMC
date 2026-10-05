export interface LevelInfo {
  id: string; // 'SS1', 'RDC', 'E1', 'E2', 'MEZ'
  label: string; // 'Sous-sol', 'Rez-de-chaussée', 'Étage 1'
  shortLabel: string; // 'SS1', 'RDC', 'E1'
  subtitle?: string;
  isSpecial?: boolean;
}
