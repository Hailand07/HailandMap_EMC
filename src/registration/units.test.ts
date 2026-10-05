import { describe, expect, it } from 'vitest';
import { buildUnits, levelIds } from './units';

describe('levelIds', () => {
  it('ordonne sous-sol, RDC, étages, mezzanine', () => {
    expect(levelIds(2, true, true)).toEqual(['SS1', 'RDC', 'E1', 'E2', 'MEZ']);
    expect(levelIds(0)).toEqual(['RDC']);
  });
});

describe('buildUnits', () => {
  it('maison familiale : une seule unité qui couvre tout le bâtiment', () => {
    const u = buildUnits({ levels: ['RDC', 'E1'], isSubdivided: false, unitsPerFloor: {}, buildingType: 'R' });
    expect(u).toEqual([{ code: 'UNIQUE', floor_label: null, door: null, kind: 'maison', sort: 0 }]);
  });

  it('immeuble : une unité par porte, numérotée selon la règle d’or', () => {
    const u = buildUnits({ levels: ['RDC', 'E1'], isSubdivided: true, unitsPerFloor: { RDC: 2, E1: 3 }, buildingType: 'R' });
    expect(u.map((x) => x.code)).toEqual(['RDC-001', 'RDC-002', 'E1-101', 'E1-102', 'E1-103']);
    expect(new Set(u.map((x) => x.code)).size).toBe(u.length);
    expect(u.every((x) => x.kind === 'logement')).toBe(true);
  });

  it('bâtiment de concession : codes préfixés de sa désignation', () => {
    const u = buildUnits({ levels: ['RDC'], isSubdivided: true, unitsPerFloor: { RDC: 2 }, buildingType: 'R', prefix: 'RL3' });
    expect(u.map((x) => x.code)).toEqual(['RL3-RDC-001', 'RL3-RDC-002']);
  });

  it('mixte : le rez-de-chaussée est commercial', () => {
    const u = buildUnits({ levels: ['RDC', 'E1'], isSubdivided: true, unitsPerFloor: { RDC: 1, E1: 1 }, buildingType: 'M' });
    expect(u.map((x) => x.kind)).toEqual(['commerce', 'logement']);
  });

  it('aucune porte saisie : repli sur une unité unique', () => {
    const u = buildUnits({ levels: ['RDC'], isSubdivided: true, unitsPerFloor: { RDC: 0 }, buildingType: 'R' });
    expect(u).toHaveLength(1);
  });
});
