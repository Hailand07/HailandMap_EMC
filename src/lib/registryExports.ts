import type { Building } from '../types';

/** Exports du registre (mêmes colonnes et même format que l'ancien Registre cadastral). */
function download(href: string, filename: string) {
  const a = document.createElement('a');
  a.setAttribute('href', href);
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const natureOf = (b: Building) => (b.has_courtyard ? 'Cour Mère' : b.parent_building_id ? 'Bâtiment Enfant' : 'Bâtiment Direct');

export function exportRegistryCSV(list: Building[]) {
  const headers = ['ID', 'Code Grille (HailandCode)', 'Code Administratif', 'Nature', 'Commune', 'Quartier', 'Type', 'Etages', 'Unites', 'Unite Cible', 'Etage Cible', 'Statut', 'Longitude', 'Latitude', 'Altitude (m)', 'Portail / Entree', 'Couleur Porte', 'Repere', 'Adresse Formatee', 'Date Creation'];
  const rows = list.map((b) => {
    const c = b.centroid?.coordinates || [0, 0];
    return [b.id, b.hailand_code || '', b.admin_address_code || '', natureOf(b), b.commune || '', b.quartier || '', b.building_type || '', b.floor_count || 1, b.unit_count || 1, b.unit_code || '', b.floor_level || '', b.status || '', c[0], c[1], b.altitude_m || 35, b.entry_point_note || '', b.door_color || '', b.landmark_note || '', b.formatted_address ? `"${b.formatted_address.replace(/"/g, '""')}"` : '', b.created_at || ''].join(';');
  });
  const csv = 'data:text/csv;charset=utf-8,﻿' + [headers.join(';'), ...rows].join('\n');
  download(encodeURI(csv), `registre_cadastral_guinee_${new Date().toISOString().slice(0, 10)}.csv`);
}

export function exportRegistryGeoJSON(list: Building[]) {
  const fc = {
    type: 'FeatureCollection',
    features: list.map((b) => ({
      type: 'Feature',
      id: b.id,
      geometry: b.geom || b.centroid,
      properties: { id: b.id, hailand_code: b.hailand_code, admin_address_code: b.admin_address_code, formatted_address: b.formatted_address, commune: b.commune, quartier: b.quartier, building_type: b.building_type, floor_count: b.floor_count, unit_count: b.unit_count, status: b.status, has_courtyard: b.has_courtyard, parent_building_id: b.parent_building_id, landmark_note: b.landmark_note, door_color: b.door_color, created_at: b.created_at },
    })),
  };
  download('data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(fc, null, 2)), `cadastre_guinee_${new Date().toISOString().slice(0, 10)}.geojson`);
}

/** Attestation provisoire d'un bâtiment (JSON), même contenu essentiel que l'ancienne fiche. */
export function exportAttestation(b: Building) {
  const doc = {
    titre: "Attestation Cadastrale et d'Adressage",
    emise_le: new Date().toISOString(),
    hailand_code: b.hailand_code,
    code_administratif: b.admin_address_code,
    adresse: b.formatted_address,
    commune: b.commune,
    quartier: b.quartier,
    type: b.building_type,
    niveaux: b.floor_count,
    unites: b.unit_count,
    statut: b.status,
    coordonnees: b.centroid?.coordinates,
  };
  download('data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(doc, null, 2)), `Attestation_${b.hailand_code || b.id}.json`);
}
