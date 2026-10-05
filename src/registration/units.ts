import { generateFloorDoors } from './floorDoors';

/** Une unité d'un bâtiment (porte, logement, commerce), telle qu'enregistrée dans `building_units`. */
export interface UnitInput {
  code: string;
  floor_label: string | null;
  door: string | null;
  kind: 'logement' | 'commerce' | 'maison' | 'bureau' | 'autre';
  sort: number;
}

/** Niveaux d'un bâtiment dans l'ordre (sous-sol, RDC, étages, mezzanine). */
export function levelIds(floorsCount: number, hasBasement = false, hasMezzanine = false): string[] {
  const ids: string[] = [];
  if (hasBasement) ids.push('SS1');
  ids.push('RDC');
  for (let f = 1; f <= Math.max(0, floorsCount || 0); f++) ids.push(`E${f}`);
  if (hasMezzanine) ids.push('MEZ');
  return ids;
}

/**
 * Unités à créer pour un bâtiment certifié (§16.2 de ECOSYSTEME_HAILAND.md).
 * - Bâtiment non subdivisé (« maison familiale » ou local unique) : UNE unité qui couvre tout le bâtiment.
 * - Bâtiment à plusieurs unités : une unité par porte, numérotée selon la règle d'or (droite → gauche).
 * `prefix` distingue les bâtiments d'une même concession (ils partagent le code public de la cour), ex. « RL3 ».
 */
export function buildUnits(opts: {
  levels: string[];
  isSubdivided: boolean;
  unitsPerFloor: Record<string, number>;
  buildingType: string;
  prefix?: string | null;
}): UnitInput[] {
  const pre = opts.prefix ? `${opts.prefix}-` : '';
  const type = (opts.buildingType || 'R').toUpperCase();
  if (!opts.isSubdivided) {
    const kind: UnitInput['kind'] = type === 'C' ? 'commerce' : type === 'A' ? 'bureau' : type === 'R' ? 'maison' : 'autre';
    return [{ code: `${pre}UNIQUE`, floor_label: null, door: null, kind, sort: 0 }];
  }
  const out: UnitInput[] = [];
  let sort = 0;
  for (const level of opts.levels) {
    const n = Math.max(0, Math.floor(opts.unitsPerFloor[level] ?? 0));
    if (n === 0) continue;
    for (const d of generateFloorDoors(level, n, type)) {
      const isShop = type === 'C' || (type === 'M' && level === 'RDC') || /^C/.test(d.doorNumber);
      out.push({
        code: `${pre}${level}-${d.doorNumber}`,
        floor_label: level,
        door: d.doorNumber,
        kind: isShop ? 'commerce' : type === 'A' ? 'bureau' : 'logement',
        sort: sort++,
      });
    }
  }
  return out.length ? out : [{ code: `${pre}UNIQUE`, floor_label: null, door: null, kind: 'autre', sort: 0 }];
}
