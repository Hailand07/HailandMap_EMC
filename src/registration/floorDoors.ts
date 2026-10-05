export interface GeneratedDoorOption {
  doorNumber: string;       // ex: '001', '101', '202', 'SS01', 'M01'
  positionLabel: string;    // ex: 'Droite', 'Centre', 'Gauche' ou 'Porte 1 (Droite)', etc.
  positionDetail: string;   // 'Droite (Règle d'or)', 'Centre', 'Gauche'
  isDefault?: boolean;
}


/**
 * Générateur automatique des numéros de porte selon la Règle d'Or HailandCode :
 * Numérotation de Droite vers la Gauche en faisant face au palier.
 * - RDC : 001 (Droite), 002 (Centre), 003 (Gauche)...
 * - Étage 1 : 101 (Droite), 102 (Centre), 103 (Gauche)...
 * - Étage 2 : 201 (Droite), 202 (Gauche)...
 * - Sous-Sol SS1 : SS01, SS02...
 * - Mezzanine : MEZ01, MEZ02...
 */
export function generateFloorDoors(floorId: string, count: number, buildingType?: string): GeneratedDoorOption[] {
  const safeCount = Math.max(1, count || 1);
  const options: GeneratedDoorOption[] = [];

  // Détermination du préfixe d'étage
  let prefix = '';
  if (floorId === 'RDC') {
    prefix = '0';
  } else if (floorId.startsWith('E')) {
    prefix = floorId.replace('E', '');
  } else if (floorId === 'SS1' || floorId.startsWith('SS')) {
    prefix = 'SS';
  } else if (floorId === 'MEZ') {
    prefix = 'MEZ';
  } else {
    prefix = floorId;
  }

  // Position physique selon la Règle d'Or (de Droite vers la Gauche)
  const getPositionText = (index: number, total: number) => {
    if (total === 1) return { label: 'Entrée Unique', detail: 'Unité seule sur le palier' };
    if (total === 2) {
      if (index === 0) return { label: 'Porte Droite', detail: '1ère porte à droite (Règle d\'Or)' };
      return { label: 'Porte Gauche', detail: '2ème porte à gauche' };
    }
    if (total === 3) {
      if (index === 0) return { label: 'Porte Droite', detail: '1ère porte à droite' };
      if (index === 1) return { label: 'Porte Centre', detail: 'Porte centrale' };
      return { label: 'Porte Gauche', detail: 'Porte à gauche' };
    }
    if (total === 4) {
      if (index === 0) return { label: 'Extrême Droite', detail: '1ère porte à droite' };
      if (index === 1) return { label: 'Centre Droit', detail: '2ème porte' };
      if (index === 2) return { label: 'Centre Gauche', detail: '3ème porte' };
      return { label: 'Extrême Gauche', detail: '4ème porte à gauche' };
    }
    // Général pour > 4 portes
    if (index === 0) return { label: `Porte ${index + 1} (Droite)`, detail: '1ère porte à droite' };
    if (index === total - 1) return { label: `Porte ${index + 1} (Gauche)`, detail: 'Dernière porte à gauche' };
    return { label: `Porte ${index + 1} (Centre)`, detail: `Position ${index + 1}/${total}` };
  };

  for (let i = 1; i <= safeCount; i++) {
    let doorNumber = '';
    const index0 = i - 1;

    if (floorId === 'RDC') {
      // 001, 002, 003... ou C01 si pur commerce direct
      doorNumber = buildingType === 'C' ? `C0${i}` : `00${i}`.slice(-3);
    } else if (floorId.startsWith('E')) {
      // Étage 1 -> 101, 102; Étage 2 -> 201, 202...
      const numPart = `0${i}`.slice(-2);
      doorNumber = `${prefix}${numPart}`;
    } else if (floorId.startsWith('SS')) {
      doorNumber = `SS0${i}`.slice(-4);
    } else if (floorId === 'MEZ') {
      doorNumber = `MEZ0${i}`.slice(-5);
    } else {
      doorNumber = `${floorId}-${i}`;
    }

    const pos = getPositionText(index0, safeCount);
    options.push({
      doorNumber,
      positionLabel: pos.label,
      positionDetail: pos.detail,
      isDefault: i === 1
    });
  }

  return options;
}
