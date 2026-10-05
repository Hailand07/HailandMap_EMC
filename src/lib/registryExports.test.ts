import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Building } from '../types';
import { exportAttestation, exportRegistryCSV, exportRegistryGeoJSON } from './registryExports';

// Les exports déclenchent un téléchargement : on remplace `document` pour récupérer le lien généré.
let clicked: { href: string; download: string }[] = [];
beforeEach(() => {
  clicked = [];
  (globalThis as any).document = {
    createElement: () => {
      const attrs: Record<string, string> = {};
      return { setAttribute: (k: string, v: string) => (attrs[k] = v), click: () => clicked.push({ href: attrs.href, download: attrs.download }), remove: () => {} };
    },
    body: { appendChild: () => {} },
  };
});
afterEach(() => {
  delete (globalThis as any).document;
  vi.restoreAllMocks();
});

const b = {
  id: 'b1',
  hailand_code: 'GN-Z4530-R008',
  admin_address_code: 'GN.CKY.MTM.CLH-C008-R01',
  building_type: 'R',
  floor_count: 1,
  unit_count: 2,
  status: 'actif',
  has_courtyard: false,
  parent_building_id: null,
  commune: 'Matam',
  quartier: 'Coleah Domino',
  formatted_address: 'Rue "A", Coleah Domino',
  centroid: { type: 'Point', coordinates: [-13.6775, 9.5307] },
  geom: { type: 'Polygon', coordinates: [] },
  created_at: '2026-10-01T00:00:00Z',
} as unknown as Building;

describe('exports du registre', () => {
  it('CSV : en-tête, séparateur « ; », guillemets doublés dans l’adresse', () => {
    exportRegistryCSV([b]);
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toMatch(/^registre_cadastral_guinee_\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = decodeURI(clicked[0].href);
    expect(csv).toContain('Code Grille (HailandCode);Code Administratif');
    expect(csv).toContain('GN-Z4530-R008;GN.CKY.MTM.CLH-C008-R01;Bâtiment Direct;Matam;Coleah Domino');
    expect(csv).toContain('"Rue ""A"", Coleah Domino"');
  });
  it('GeoJSON : une entité par fiche avec son code', () => {
    exportRegistryGeoJSON([b]);
    const json = JSON.parse(decodeURIComponent(clicked[0].href.replace('data:text/json;charset=utf-8,', '')));
    expect(json.type).toBe('FeatureCollection');
    expect(json.features).toHaveLength(1);
    expect(json.features[0].properties.hailand_code).toBe('GN-Z4530-R008');
  });
  it('attestation : nom de fichier et contenu', () => {
    exportAttestation(b);
    expect(clicked[0].download).toBe('Attestation_GN-Z4530-R008.json');
    const doc = JSON.parse(decodeURIComponent(clicked[0].href.replace('data:text/json;charset=utf-8,', '')));
    expect(doc.hailand_code).toBe('GN-Z4530-R008');
    expect(doc.commune).toBe('Matam');
  });
});
