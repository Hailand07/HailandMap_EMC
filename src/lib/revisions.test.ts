import { describe, expect, it } from 'vitest';
import { computeChanges, fmtValue, revisionErrorMessage } from './revisions';
import { isLegacyFilter } from '../map/layers';

const b = { landmark_note: 'Maison bleue', floor_count: 1, unit_count: 2, door_color: null, building_type: 'R', status: 'actif' } as any;

describe('computeChanges', () => {
  it('ne garde que les champs réellement modifiés', () => {
    expect(computeChanges(b, { landmark_note: 'Maison bleue', floor_count: '2' as any, door_color: '' })).toEqual({ floor_count: 2 });
  });
  it('un champ vidé devient « aucune valeur »', () => {
    expect(computeChanges(b, { landmark_note: '' })).toEqual({ landmark_note: null });
  });
  it('ignore les champs non modifiables', () => {
    expect(computeChanges(b, { geom: {} } as any)).toEqual({});
  });
});

describe('fmtValue / messages', () => {
  it('niveaux et types lisibles', () => {
    expect(fmtValue('floor_count', 0)).toBe('RDC');
    expect(fmtValue('floor_count', 2)).toBe('R+2');
    expect(fmtValue('building_type', 'C')).toBe('Commercial');
    expect(fmtValue('door_color', null)).toBe('—');
  });
  it('erreurs de la base traduites', () => {
    expect(revisionErrorMessage({ message: 'JUSTIFICATION_OBLIGATOIRE' })).toMatch(/10 caractères/);
    expect(revisionErrorMessage({ message: 'CONFLIT: floor_count a changé' })).toMatch(/a changé/);
  });
});

describe('isLegacyFilter', () => {
  it('reconnaît l’ancienne syntaxe Mapbox (non combinable)', () => {
    expect(isLegacyFilter(['==', 'extrude', 'true'])).toBe(true);
    expect(isLegacyFilter(['all', ['==', 'type', 'x'], ['has', 'height']])).toBe(true);
    expect(isLegacyFilter(['==', ['get', 'extrude'], 'true'])).toBe(false);
    expect(isLegacyFilter(null)).toBe(false);
  });
});
