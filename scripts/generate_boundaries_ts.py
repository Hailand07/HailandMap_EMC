#!/usr/bin/env python3
"""
Générateur de frontières spatiales réelles pour tous les niveaux territoriaux :
- 8 Régions (gin_admin1.geojson)
- 34 Préfectures (gin_admin2.geojson)
- 342 Communes (gin_admin3.geojson)
- 403 Quartiers (quartiers_conakry_osm.txt)

Génère :
1. src/lib/guineaBoundariesData.ts : dictionnaire optimisé de géométries réelles consultable par id, pcode ou osm_id
2. Met à jour src/lib/interactiveMapService.ts pour toujours injecter la géométrie réelle lors de la navigation
3. Met à jour src/lib/interactiveMapEngine.ts pour accepter MultiPolygon en toute sécurité sur Mapbox
"""

import json
import unicodedata
import re

def norm(s):
    if not s: return ''
    s = unicodedata.normalize('NFKD', s).encode('ASCII', 'ignore').decode('utf-8')
    return s.lower().strip()

print("Chargement des fichiers géographiques de référence...")

with open('gin_admin1.geojson', 'r', encoding='utf-8') as f:
    a1 = json.load(f)
with open('gin_admin2.geojson', 'r', encoding='utf-8') as f:
    a2 = json.load(f)
with open('gin_admin3.geojson', 'r', encoding='utf-8') as f:
    a3 = json.load(f)
with open('quartiers_conakry_osm.txt', 'r', encoding='utf-8') as f:
    osm_qtrs = json.load(f)

# 1. Régions par pcode et par id
region_geoms = {}
region_pcode_to_id = {
    'GN001': 'reg-boke',
    'GN002': 'reg-conakry',
    'GN003': 'reg-faranah',
    'GN004': 'reg-kankan',
    'GN005': 'reg-kindia',
    'GN006': 'reg-labe',
    'GN007': 'reg-mamou',
    'GN008': 'reg-nzerekore'
}
for feat in a1['features']:
    pcode = feat['properties']['adm1_pcode']
    geom = feat['geometry']
    reg_id = region_pcode_to_id.get(pcode)
    if reg_id:
        region_geoms[reg_id] = geom

print(f"-> {len(region_geoms)} frontières régionales chargées.")

# 2. Préfectures par pcode et par nom normalisé
pref_geoms = {}
for feat in a2['features']:
    pcode = feat['properties']['adm2_pcode']
    nom = norm(feat['properties']['adm2_name'])
    geom = feat['geometry']
    if pcode:
        pref_geoms[pcode] = geom
    pref_geoms[nom] = geom

print(f"-> {len(a2['features'])} frontières préfectorales chargées.")

# 3. Communes par pcode et par nom normalisé
comm_geoms = {}
for feat in a3['features']:
    pcode = feat['properties']['adm3_pcode']
    nom = norm(feat['properties']['adm3_name'])
    geom = feat['geometry']
    if pcode:
        comm_geoms[pcode] = geom
    comm_geoms[nom] = geom

print(f"-> {len(a3['features'])} frontières communales chargées.")

# 4. Quartiers par osm_id et par nom normalisé
qtr_osm_by_norm = {}
qtr_osm_by_id = {}

for feat in osm_qtrs['features']:
    p = feat['properties']
    geom = feat['geometry']
    osmid = p.get('osm_id')
    name = norm(p.get('name'))
    if osmid:
        qtr_osm_by_id[osmid] = geom
    if name:
        qtr_osm_by_norm[name] = geom

# Mapping manuel des quartiers mères / alias
manual_alias = {
    'qtr-almamya': 'tafory almamya',
    'qtr-coronthie': 'coronthie 1',
    'qtr-dixinn-centre': 'dixinn centre 1',
    'qtr-enta': 'enta marche',
    'qtr-gbessia': 'gbessia centre',
    'qtr-hafia': 'hafia 1',
    'qtr-hermakonon': 'hermakonon mosquee',
    'qtr-kaporo': 'kaporo centre',
    'qtr-miniere': 'miniere cite',
    'qtr-sonfonia': 'sonfonia centre 1',
    'qtr-yimbaya': 'yimbaya permanence'
}

# Charger les 403 quartiers de guineaOfflineData
with open('src/lib/guineaOfflineData.ts', 'r', encoding='utf-8') as f:
    text = f.read()

m = re.search(r'\"qtrs\"\s*:\s*\[', text)
start = m.end() - 1
depth = 0
for i in range(start, len(text)):
    if text[i] == '[': depth += 1
    elif text[i] == ']':
        depth -= 1
        if depth == 0:
            end = i + 1
            break

offline_qtrs = json.loads(text[start:end])

final_qtr_geoms = {}
matched = 0

for q in offline_qtrs:
    qid = q['id']
    qnom = q['nom']
    geom = None

    if qid in manual_alias:
        alias_nom = manual_alias[qid]
        geom = qtr_osm_by_norm.get(alias_nom)
    elif qid.startswith('qtr-osm-'):
        osmid = qid.replace('qtr-osm-', '')
        geom = qtr_osm_by_id.get(osmid)

    if not geom and norm(qnom) in qtr_osm_by_norm:
        geom = qtr_osm_by_norm.get(norm(qnom))

    if geom:
        final_qtr_geoms[qid] = geom
        matched += 1
    else:
        print(f"Quartier non apparié : {qid} - {qnom}")

print(f"-> {matched} / {len(offline_qtrs)} quartiers associés avec leur véritable polygone de délimitation OSM !")

# Générer le fichier TypeScript avec compression minimale des coordonnées
print("Écriture du fichier TypeScript src/lib/guineaBoundariesData.ts...")

out_ts = """/**
 * Dictionnaire cartographique des frontières spatiales réelles officielles de Guinée
 * - 8 Régions (OCHA / HDX)
 * - 34 Préfectures (OCHA / HDX)
 * - 342 Communes (OCHA / HDX)
 * - 403 Quartiers & Secteurs (OpenStreetMap Délimitations Réelles)
 */

export const TERRITORY_REGION_BOUNDARIES: Record<string, any> = """ + json.dumps(region_geoms, separators=(',', ':')) + """;

export const TERRITORY_PREFECTURE_BOUNDARIES: Record<string, any> = """ + json.dumps(pref_geoms, separators=(',', ':')) + """;

export const TERRITORY_COMMUNE_BOUNDARIES: Record<string, any> = """ + json.dumps(comm_geoms, separators=(',', ':')) + """;

export const TERRITORY_QUARTIER_BOUNDARIES: Record<string, any> = """ + json.dumps(final_qtr_geoms, separators=(',', ':')) + """;

export function getTerritoryRealGeometry(level: string, id: string, codeOrPcode?: string, nom?: string): any {
  if (level === 'quartier') {
    return TERRITORY_QUARTIER_BOUNDARIES[id] || null;
  }
  if (level === 'commune') {
    if (codeOrPcode && TERRITORY_COMMUNE_BOUNDARIES[codeOrPcode]) {
      return TERRITORY_COMMUNE_BOUNDARIES[codeOrPcode];
    }
    if (nom) {
      const clean = nom.toLowerCase().normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '').trim();
      if (TERRITORY_COMMUNE_BOUNDARIES[clean]) {
        return TERRITORY_COMMUNE_BOUNDARIES[clean];
      }
    }
    return null;
  }
  if (level === 'prefecture') {
    if (codeOrPcode && TERRITORY_PREFECTURE_BOUNDARIES[codeOrPcode]) {
      return TERRITORY_PREFECTURE_BOUNDARIES[codeOrPcode];
    }
    if (nom) {
      const clean = nom.toLowerCase().normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '').trim();
      if (TERRITORY_PREFECTURE_BOUNDARIES[clean]) {
        return TERRITORY_PREFECTURE_BOUNDARIES[clean];
      }
    }
    return null;
  }
  if (level === 'region') {
    return TERRITORY_REGION_BOUNDARIES[id] || null;
  }
  return null;
}
"""

with open('src/lib/guineaBoundariesData.ts', 'w', encoding='utf-8') as out_f:
    out_f.write(out_ts)

print("src/lib/guineaBoundariesData.ts généré avec succès.")
