import { describe, expect, it } from 'vitest';
import type { Building } from '../types';
import { computeDualAddressing, resolveAdministrativeHierarchy } from './administrativeAddressingService';

const COLEAH: [number, number] = [-13.67751, 9.53077]; // Coleah Domino, commune de Matam

describe('resolveAdministrativeHierarchy', () => {
  it('retrouve commune, quartier et région d’un point de Coleah Domino', () => {
    const r = resolveAdministrativeHierarchy(COLEAH, { buildingType: 'R', lotIndex: 3 });
    expect(r.communeNom).toBe('Matam');
    expect(r.quartierNom).toBe('Coleah Domino');
    expect(r.regionNom).toBe('Conakry');
  });
  it('code administratif : GN.{région}.{commune}.{quartier}-C{lot}-{bâtiment}', () => {
    const r = resolveAdministrativeHierarchy(COLEAH, { buildingType: 'R', lotIndex: 3 });
    expect(r.adminAddressCode).toBe('GN.CKY.MTM.CLH-C003-R01');
    expect(r.adminAddressCode).toMatch(/^GN\.[A-Z]{3}\.[A-Z]{3}\.[A-Z]{3}-C\d{3}(-[A-Z0-9]+)?$/);
  });
  it('lettre enfant : le bâtiment RA d’une concession', () => {
    const r = resolveAdministrativeHierarchy(COLEAH, { buildingType: 'R', lotIndex: 3, childLetter: 'A' });
    expect(r.adminAddressCode).toBe('GN.CKY.MTM.CLH-C003-RA');
  });
  it('l’adresse lisible nomme le quartier, la commune et le pays', () => {
    const r = resolveAdministrativeHierarchy(COLEAH, { buildingType: 'R', lotIndex: 3 });
    expect(r.formattedAddress).toContain('Quartier Coleah Domino');
    expect(r.formattedAddress).toContain('Commune de Matam');
    expect(r.formattedAddress).toContain('République de Guinée');
  });
  // Défaut connu (à corriger côté base avec la fonction fn_resolve_admin_address) : un point en pleine mer
  // reçoit aujourd'hui l'adresse du quartier le plus proche au lieu d'être refusé. Ce test échoue le jour où c'est corrigé.
  it.fails('un point hors de Guinée ne reçoit aucune adresse administrative', () => {
    const r = resolveAdministrativeHierarchy([0, 0], { buildingType: 'R', lotIndex: 1 });
    expect(r.quartierNom).toBeFalsy();
  });
});

describe('computeDualAddressing', () => {
  const b = { hailand_code: 'GN-Z4530-CR003-RA', zone_code: 'Z4530', building_type: 'R', centroid: { type: 'Point', coordinates: COLEAH } } as unknown as Building;
  it('garde le code grille tel que saisi et déduit le code administratif du lot et de la lettre', () => {
    const d = computeDualAddressing(b);
    expect(d.gridAddress.hailandCode).toBe('GN-Z4530-CR003-RA');
    expect(d.gridAddress.zoneCode).toBe('Z4530');
    expect(d.adminAddress.adminAddressCode).toBe('GN.CKY.MTM.CLH-C003-RA');
  });
  it('libellé unifié : code grille · code administratif · quartier, commune', () => {
    const d = computeDualAddressing(b);
    expect(d.unifiedAddress).toBe('[GN-Z4530-CR003-RA] · GN.CKY.MTM.CLH-C003-RA · Coleah Domino, Matam');
  });
  it('une concession mère déclare son code de cour', () => {
    const d = computeDualAddressing({ ...b, hailand_code: 'GN-Z4530-CR003', has_courtyard: true } as Building);
    expect(d.gridAddress.courtyardCode).toBe('CR003');
  });
});
