import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCoordinates, searchPlaces } from './placeSearch';

describe('recherche d’un endroit', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('coordonnées collées, dans les deux ordres, en Guinée seulement', () => {
    expect(parseCoordinates('9.6412, -13.6203')).toEqual({ lat: 9.6412, lng: -13.6203 });
    expect(parseCoordinates('-13.6203 9.6412')).toEqual({ lat: 9.6412, lng: -13.6203 });
    expect(parseCoordinates('9,6412 -13,6203')).toEqual({ lat: 9.6412, lng: -13.6203 });
    expect(parseCoordinates('48.85, 2.35')).toBeNull();
    expect(parseCoordinates('Kobaya')).toBeNull();
  });

  it('lieux Mapbox : nom, détail, centre ; liste vide en cas d’erreur', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ features: [{ geometry: { coordinates: [-13.62, 9.64] }, properties: { mapbox_id: 'x', name: 'Marché de Kobaya', place_formatted: 'Ratoma, Conakry' } }] }) })));
    expect(await searchPlaces('marché kobaya', 'pk.test')).toEqual([{ id: 'x', name: 'Marché de Kobaya', detail: 'Ratoma, Conakry', center: [-13.62, 9.64] }]);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('hors ligne'); }));
    expect(await searchPlaces('marché kobaya', 'pk.test')).toEqual([]);
    expect(await searchPlaces('ma', 'pk.test')).toEqual([]);
  });
});
