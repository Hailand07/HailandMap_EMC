import { describe, expect, it } from 'vitest';
import { calculateDistance, calculatePolygonArea, generateSquarePolygon } from './geometry';

describe('calculateDistance', () => {
  it('vaut 0 pour un même point', () => {
    expect(calculateDistance(9.53, -13.67, 9.53, -13.67)).toBe(0);
  });
  it('donne environ 111 km pour un degré de latitude', () => {
    const d = calculateDistance(9, -13.6, 10, -13.6);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_500);
  });
  it('est symétrique', () => {
    expect(calculateDistance(9.5, -13.7, 9.6, -13.6)).toBeCloseTo(calculateDistance(9.6, -13.6, 9.5, -13.7), 6);
  });
});

describe('generateSquarePolygon', () => {
  it('renvoie un anneau fermé de 5 points centré sur le point demandé', () => {
    const poly = generateSquarePolygon(-13.62, 9.59, 10);
    const ring = poly.coordinates[0];
    expect(poly.type).toBe('Polygon');
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    const lng = ring.slice(0, 4).reduce((a, p) => a + p[0], 0) / 4;
    const lat = ring.slice(0, 4).reduce((a, p) => a + p[1], 0) / 4;
    expect(lng).toBeCloseTo(-13.62, 6);
    expect(lat).toBeCloseTo(9.59, 6);
  });
  it('a pour surface (2 × demi-côté)²', () => {
    const poly = generateSquarePolygon(-13.62, 9.59, 10);
    const area = calculatePolygonArea(poly.coordinates as [number, number][][]);
    expect(area).toBeGreaterThan(380);
    expect(area).toBeLessThan(420);
  });
});

describe('calculatePolygonArea', () => {
  it('vaut 0 pour une liste vide', () => {
    expect(calculatePolygonArea([])).toBe(0);
  });
});
