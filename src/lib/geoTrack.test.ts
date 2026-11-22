import { describe, expect, it } from 'vitest';
import { accuracyDiameterPx, accuracyText, isPrecise, metersPerPixel, nextGpsAction } from './geoTrack';

describe('suivi GPS de l’Atelier', () => {
  it('échelle de la carte à Conakry', () => {
    // zoom 18 à 9,6° N : ≈ 0,30 m par pixel
    expect(metersPerPixel(9.6, 18)).toBeCloseTo(0.295, 2);
    expect(accuracyDiameterPx(10, 9.6, 18)).toBe(68);
    expect(accuracyDiameterPx(50000, 9.6, 18)).toBe(2400);
  });
  it('texte et seuil de précision', () => {
    expect(accuracyText(12.4)).toBe('± 12 m');
    expect(accuracyText(1250)).toBe('± 1,3 km');
    expect(isPrecise(25)).toBe(true);
    expect(isPrecise(120)).toBe(false);
  });
  it('bouton : démarrer, suivre, arrêter', () => {
    expect(nextGpsAction('off')).toBe('start');
    expect(nextGpsAction('free')).toBe('follow');
    expect(nextGpsAction('follow')).toBe('stop');
    expect(nextGpsAction('searching')).toBe('none');
  });
});
