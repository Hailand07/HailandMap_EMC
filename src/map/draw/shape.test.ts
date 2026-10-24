import { describe, expect, it } from 'vitest';
import { circleRing, constrainRightAngle, formatMeters, maxCornerOffset, selfIntersects, signedArea, squareDiagnosis, squareRing, type Vec2 } from './shape';

const angleAt = (r: Vec2[], i: number) => {
  const a = r[(i - 1 + r.length) % r.length]; const o = r[i]; const b = r[(i + 1) % r.length];
  const p = [a[0] - o[0], a[1] - o[1]]; const q = [b[0] - o[0], b[1] - o[1]];
  return (Math.acos((p[0] * q[0] + p[1] * q[1]) / (Math.hypot(p[0], p[1]) * Math.hypot(q[0], q[1]))) * 180) / Math.PI;
};

describe('équerrer (adapté d’iD)', () => {
  const tordu: Vec2[] = [[0, 0], [100, 4], [103, 62], [-3, 58]];
  it('un rectangle tordu de quelques degrés devient droit, sans bouger beaucoup', () => {
    expect(squareDiagnosis(tordu)).toBe('ok');
    expect(maxCornerOffset(tordu)!).toBeGreaterThan(2);
    const sq = squareRing(tordu)!;
    expect(sq).toHaveLength(4);
    for (let i = 0; i < 4; i++) expect(angleAt(sq, i)).toBeCloseTo(90, 1);
    sq.forEach((p, i) => expect(Math.hypot(p[0] - tordu[i][0], p[1] - tordu[i][1])).toBeLessThan(6));
    expect(squareDiagnosis(sq)).toBe('square_enough');
  });
  it('un point presque aligné au milieu d’un mur est retiré', () => {
    const r: Vec2[] = [[0, 0], [50, 1], [100, 0], [100, 60], [0, 60]];
    expect(squareRing(r)).toHaveLength(4);
  });
  it('une forme sans coin proche de 90° n’est pas modifiée', () => {
    const hexa: Vec2[] = Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3) * 50, Math.sin((i * Math.PI) / 3) * 50]);
    expect(squareDiagnosis(hexa)).toBe('not_squarish');
    expect(squareRing(hexa)).toBeNull();
  });
  it('un bâtiment en L reste en L', () => {
    const L: Vec2[] = [[0, 0], [60, 2], [61, 30], [30, 31], [31, 80], [-1, 79]];
    const sq = squareRing(L)!;
    expect(sq).toHaveLength(6);
    for (let i = 0; i < 6; i++) expect(angleAt(sq, i)).toBeCloseTo(90, 1);
  });
});

describe('autres aides', () => {
  it('arrondir : 20 sommets à égale distance du centre, même sens de parcours', () => {
    const sq: Vec2[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const c = circleRing(sq);
    expect(c).toHaveLength(20);
    const r = c.map((p) => Math.hypot(p[0] - 5, p[1] - 5));
    expect(Math.max(...r) - Math.min(...r)).toBeLessThan(1e-9);
    expect(Math.sign(signedArea(c))).toBe(Math.sign(signedArea(sq)));
  });
  it('contour croisé détecté (nœud papillon), contour normal accepté', () => {
    expect(selfIntersects([[0, 0], [10, 10], [10, 0], [0, 10]])).toBe(true);
    expect(selfIntersects([[0, 0], [10, 0], [10, 10], [0, 10]])).toBe(false);
  });
  it('Maj : le nouveau segment est parallèle ou perpendiculaire au précédent', () => {
    expect(constrainRightAngle([0, 0], [10, 0], [12, 7])).toEqual([10, 7]);
    expect(constrainRightAngle([0, 0], [10, 0], [20, 1])).toEqual([20, 0]);
  });
  it('mesures en français', () => {
    expect(formatMeters(4.25).replace(/\s/g, ' ')).toBe('4,3 m');
    expect(formatMeters(1234).replace(/\s/g, ' ')).toBe('1 234 m');
  });
});
