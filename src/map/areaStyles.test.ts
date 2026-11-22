import { describe, expect, it } from 'vitest';
import { AREA_STYLES, areaText, areaTitle, isCountryQuery } from './areaStyles';

describe('styles des niveaux administratifs', () => {
  it('chaque niveau a sa couleur ; plus il est grand, plus la teinte est légère', () => {
    const colors = new Set(Object.values(AREA_STYLES).map((s) => s.color));
    expect(colors.size).toBe(5);
    expect(AREA_STYLES.pays.fill).toBeLessThan(AREA_STYLES.quartier.fill);
  });
  it('titres, superficies, recherche du pays', () => {
    expect(areaTitle('commune', 'Ratoma')).toBe('Commune de Ratoma');
    expect(areaTitle('quartier', 'Kobaya')).toBe('Quartier Kobaya');
    expect(areaText(0.85)).toBe('85 ha');
    expect(areaText(12.44)).toBe('12,4 km²');
    expect(isCountryQuery('Guinée')).toBe(true);
    expect(isCountryQuery('Kobaya')).toBe(false);
  });
});
