import { describe, expect, it } from 'vitest';
import { detect200mZoneFromCoords, generate200mGridGeoJSON } from './grid';

describe('detect200mZoneFromCoords', () => {
  it('est déterministe', () => {
    expect(detect200mZoneFromCoords(-13.6775, 9.5307)).toBe(detect200mZoneFromCoords(-13.6775, 9.5307));
  });
  it('retrouve le carreau Z4530 (Coleah Domino) vu sur la carte', () => {
    expect(detect200mZoneFromCoords(-13.67751, 9.53077)).toBe('Z4530');
  });
  it('garde les deux carreaux historiques Z014 et Z015', () => {
    expect(detect200mZoneFromCoords(-13.621, 9.59)).toBe('Z014');
    expect(detect200mZoneFromCoords(-13.625, 9.592)).toBe('Z015');
  });
  it('donne le même carreau à deux points voisins de quelques mètres', () => {
    expect(detect200mZoneFromCoords(-13.67751, 9.53077)).toBe(detect200mZoneFromCoords(-13.67745, 9.53072));
  });
  it('donne des carreaux différents à 500 m d’écart', () => {
    expect(detect200mZoneFromCoords(-13.67751, 9.53077)).not.toBe(detect200mZoneFromCoords(-13.67751, 9.5353));
  });
});

describe('generate200mGridGeoJSON', () => {
  it('produit des carreaux dont l’identifiant correspond à la détection par coordonnées', () => {
    const grid: any = generate200mGridGeoJSON({ minLng: -13.678, maxLng: -13.676, minLat: 9.530, maxLat: 9.532 });
    expect(grid.type).toBe('FeatureCollection');
    expect(grid.features.length).toBeGreaterThan(0);
    const f = grid.features[0];
    const ring = f.geometry.coordinates[0];
    const cx = (ring[0][0] + ring[2][0]) / 2;
    const cy = (ring[0][1] + ring[2][1]) / 2;
    expect(f.properties.id).toBe(detect200mZoneFromCoords(cx, cy));
  });
});
