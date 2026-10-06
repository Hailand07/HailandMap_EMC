import { describe, expect, it } from 'vitest';
import { findRegisteredAt, findRegisteredCovering, registeredMaskZone } from './registered';

const square = (x: number, y: number, d: number) => ({
  type: 'Polygon' as const,
  coordinates: [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]],
});
const b = (over: any) => ({ status: 'actif', is_validated: true, has_courtyard: false, parent_building_id: null, courtyard_geom: null, ...over }) as any;

const court = b({ id: 'cour', has_courtyard: true, geom: square(0, 0, 0.001), courtyard_geom: square(0, 0, 0.001) });
const child = b({ id: 'enfant', parent_building_id: 'cour', geom: square(0.0002, 0.0002, 0.0002) });
const direct = b({ id: 'direct', geom: square(0.01, 0.01, 0.0002) });
const old = b({ id: 'retire', status: 'inactif', geom: square(0.02, 0.02, 0.0002) });
const all = [court, child, direct, old];

describe('findRegisteredAt', () => {
  it('reconnaît un bâtiment direct enregistré', () => {
    expect(findRegisteredAt(all, 0.0101, 0.0101)?.id).toBe('direct');
  });
  it('dans une concession : le bâtiment avant la cour', () => {
    expect(findRegisteredAt(all, 0.0003, 0.0003)?.id).toBe('enfant');
  });
  it('dans la cour hors bâtiment : la concession', () => {
    expect(findRegisteredAt(all, 0.0008, 0.0008)?.id).toBe('cour');
  });
  it('terrain libre ou bâtiment retiré : rien', () => {
    expect(findRegisteredAt(all, 0.005, 0.005)).toBeNull();
    expect(findRegisteredAt(all, 0.0201, 0.0201)).toBeNull();
  });
});

describe('findRegisteredCovering', () => {
  it('un polygone OSM déjà repris par Hailand est reconnu', () => {
    expect(findRegisteredCovering(all, square(0.01, 0.01, 0.0002))?.id).toBe('direct');
    expect(findRegisteredCovering(all, square(0.03, 0.03, 0.0002))).toBeNull();
  });
});

describe('registeredMaskZone', () => {
  it('une zone par concession ou bâtiment direct, sans les bâtiments de cour ni les retirés', () => {
    const z = registeredMaskZone(all);
    expect(z?.type).toBe('MultiPolygon');
    expect(z?.coordinates.length).toBe(2);
  });
  it('aucun bâtiment : aucune zone', () => {
    expect(registeredMaskZone([])).toBeNull();
  });
});
