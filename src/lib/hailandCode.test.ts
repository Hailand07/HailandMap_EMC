import { describe, expect, it } from 'vitest';
import { generateHailandCode } from './supabase';

// Format du code métrique (voir ECOSYSTEME_HAILAND.md §3) : GN-{zone}[-CR{n}]-{type}{n}[-E{étage}][-{unité}]
describe('generateHailandCode', () => {
  it('bâtiment direct : type + chrono sur 3 chiffres', () => {
    expect(generateHailandCode('CKY', 'Matam', 'Z4530', 'R', 8)).toBe('GN-Z4530-R008');
    expect(generateHailandCode('CKY', 'Matam', 'Z4530', 'M', 7)).toBe('GN-Z4530-M007');
  });
  it('met la zone en majuscules et retire les espaces', () => {
    expect(generateHailandCode('CKY', 'Matam', ' z4530 ', 'R', 1)).toBe('GN-Z4530-R001');
  });
  it('bâtiment dans une concession : CR + désignation (RA par défaut)', () => {
    expect(generateHailandCode('CKY', 'Matam', 'Z4530', 'R', 0, undefined, undefined, 'CR003')).toBe('GN-Z4530-CR003-RA');
    expect(generateHailandCode('CKY', 'Matam', 'Z4530', 'R', 0, undefined, undefined, '3', 'B')).toBe('GN-Z4530-CR003-RB');
  });
  it('désignation déjà préfixée par le type : non doublée', () => {
    expect(generateHailandCode('CKY', 'Matam', 'Z4530', 'R', 0, undefined, undefined, 'CR003', 'RL1')).toBe('GN-Z4530-CR003-RL1');
  });
  it('ajoute étage et unité', () => {
    expect(generateHailandCode('CKY', 'Matam', 'Z4530', 'M', 7, '1', '101')).toBe('GN-Z4530-M007-E1-101');
    expect(generateHailandCode('CKY', 'Matam', 'Z4530', 'M', 7, 'E2')).toBe('GN-Z4530-M007-E2');
  });
  it('zone absente : repli sur la zone par défaut', () => {
    expect(generateHailandCode('CKY', 'Matam', '', 'R', 1)).toBe('GN-Z00142-R001');
  });
});
