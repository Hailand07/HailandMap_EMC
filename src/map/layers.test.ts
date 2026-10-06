import { describe, expect, it } from 'vitest';
import { computeRegisteredClip } from './layers';

const sq = (x: number, y: number, s: number): GeoJSON.Polygon => ({ type: 'Polygon', coordinates: [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]] });
const feat = (id: number | undefined, geometry: GeoJSON.Polygon): GeoJSON.Feature => ({ type: 'Feature', id, properties: {}, geometry });
const zone: GeoJSON.MultiPolygon = { type: 'MultiPolygon', coordinates: [sq(0, 0, 0.0001).coordinates] };

describe('computeRegisteredClip (empreintes à découper sous les bâtiments enregistrés)', () => {
  it('garde les empreintes qui touchent la zone, pas les autres', () => {
    const out = computeRegisteredClip([feat(1, sq(0.00005, 0.00005, 0.0001)), feat(2, sq(0.001, 0.001, 0.0001))], zone);
    expect(out).toHaveLength(1);
    expect(out[0].geometry).toEqual(sq(0.00005, 0.00005, 0.0001));
  });

  it('retient aussi les autres morceaux d’un bâtiment coupé par les tuiles (même identifiant)', () => {
    const out = computeRegisteredClip([feat(7, sq(0.00005, 0.00005, 0.0001)), feat(7, sq(0.002, 0.002, 0.0001)), feat(8, sq(0.003, 0.003, 0.0001))], zone);
    expect(out).toHaveLength(2);
  });

  it('une empreinte entièrement dans la zone est retenue', () => {
    expect(computeRegisteredClip([feat(1, sq(0.00002, 0.00002, 0.00002))], zone)).toHaveLength(1);
  });

  it('sans identifiant, seule l’intersection compte', () => {
    const out = computeRegisteredClip([feat(undefined, sq(0.00005, 0.00005, 0.0001)), feat(undefined, sq(0.002, 0.002, 0.0001))], zone);
    expect(out).toHaveLength(1);
  });

  it('ignore les géométries qui ne sont pas des polygones', () => {
    const point: GeoJSON.Feature = { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0.00005, 0.00005] } };
    expect(computeRegisteredClip([point], zone)).toHaveLength(0);
  });

  it('plusieurs bâtiments enregistrés : une empreinte touchant l’un d’eux suffit', () => {
    const z2: GeoJSON.MultiPolygon = { type: 'MultiPolygon', coordinates: [sq(0, 0, 0.0001).coordinates, sq(0.01, 0.01, 0.0001).coordinates] };
    expect(computeRegisteredClip([feat(1, sq(0.01005, 0.01005, 0.0001)), feat(2, sq(0.5, 0.5, 0.0001))], z2)).toHaveLength(1);
  });
});
