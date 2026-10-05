import { describe, expect, it } from 'vitest';
import type { Building } from '../types';
import { generate3DEntitiesFromBuildingList } from './buildings3d';

const square = (lng: number, lat: number, d = 0.0001) => ({
  type: 'Polygon',
  coordinates: [[[lng, lat], [lng + d, lat], [lng + d, lat + d], [lng, lat + d], [lng, lat]]],
});

const base = (over: Partial<Building>): Building =>
  ({
    id: 'b1',
    hailand_code: 'GN-Z4530-R001',
    building_type: 'R',
    floor_count: 0,
    unit_count: 1,
    has_courtyard: false,
    parent_building_id: null,
    status: 'actif',
    geom: square(-13.6775, 9.5307) as any,
    centroid: { type: 'Point', coordinates: [-13.67745, 9.53075] },
    created_at: '2026-10-01T00:00:00Z',
    ...over,
  }) as unknown as Building;

describe('generate3DEntitiesFromBuildingList', () => {
  it('renvoie une liste vide sans fiche', () => {
    expect(generate3DEntitiesFromBuildingList([])).toEqual([]);
  });
  it('un rez-de-chaussée fait 1 niveau de 3,2 m', () => {
    const [e] = generate3DEntitiesFromBuildingList([base({ floor_count: 0 })]);
    expect(e.floors).toBe(1);
    expect(e.height).toBe(3.2);
  });
  it('R+1 fait 2 niveaux et R+3 fait 4 niveaux de 3,2 m', () => {
    const [r1] = generate3DEntitiesFromBuildingList([base({ floor_count: 1 })]);
    const [r3] = generate3DEntitiesFromBuildingList([base({ floor_count: 3 })]);
    expect(r1.height).toBe(6.4);
    expect(r3.floors).toBe(4);
    expect(r3.height).toBe(12.8);
  });
  it('ignore une fiche sans géométrie', () => {
    expect(generate3DEntitiesFromBuildingList([base({ geom: null as any })])).toEqual([]);
  });
  it('colore selon le type (commerce ambre, résidentiel clair)', () => {
    const [c] = generate3DEntitiesFromBuildingList([base({ building_type: 'C' as any })]);
    const [r] = generate3DEntitiesFromBuildingList([base({ building_type: 'R' as any })]);
    expect(c.color).not.toBe(r.color);
  });
  it('une concession avec enfants n’extrude que les enfants, et ajoute un mur d’enceinte de 2,2 m', () => {
    const mother = base({ id: 'm', has_courtyard: true, hailand_code: 'GN-Z4530-CR003', geom: square(-13.6776, 9.5306, 0.0003) as any, courtyard_geom: square(-13.6776, 9.5306, 0.0003) as any });
    const child = base({ id: 'c', parent_building_id: 'm', hailand_code: 'GN-Z4530-CR003-RA' });
    const out = generate3DEntitiesFromBuildingList([mother, child]);
    const volumes = out.filter((e) => e.id.startsWith('3d-auto-'));
    const walls = out.filter((e) => !e.id.startsWith('3d-auto-'));
    expect(volumes.map((e) => e.id)).toEqual(['3d-auto-c']);
    expect(walls.length).toBeGreaterThan(0);
    expect(walls.every((w) => w.height === 2.2)).toBe(true);
  });
});
