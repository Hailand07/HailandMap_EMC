#!/usr/bin/env python3
"""
Générateur de lots SQL pour l'ingestion massive des 273 937 bâtiments OSM dans Supabase (batiments_3d).
Découpe les 273 937 bâtiments par commune ou par lots de 10 000 pour insertion sans timeout.
"""

import glob
import os
import unicodedata
import json
import re

def norm(s):
    if not s:
        return ''
    s = unicodedata.normalize('NFKD', s).encode('ASCII', 'ignore').decode('utf-8')
    return s.lower().strip()

# 1. Charger les correspondances quartiers existants
with open('src/lib/guineaOfflineData.ts', 'r', encoding='utf-8') as f:
    text = f.read()

m = re.search(r'\"qtrs\"\s*:\s*\[', text)
start = m.end() - 1
depth = 0
end = start
for i in range(start, len(text)):
    if text[i] == '[':
        depth += 1
    elif text[i] == ']':
        depth -= 1
        if depth == 0:
            end = i + 1
            break

qtrs = json.loads(text[start:end])
qtr_lookup = {norm(q['nom']): q['id'] for q in qtrs}

# 2. Scanner les 55 fichiers
files = sorted(glob.glob('fichier.txt */*.txt'))
os.makedirs('sql_batches_batiments', exist_ok=True)

batch_size = 10000
batch_index = 1
current_batch = []
total_count = 0

print(f"Préparation des lots d'insertion pour 273 937 bâtiments...")

for fl in files:
    with open(fl, 'r', encoding='utf-8', errors='ignore') as fp:
        fp.readline() # Entête
        for line in fp:
            p = line.strip().split('|')
            if len(p) >= 9:
                osm_id = p[0].strip()
                code = p[1].strip()
                fclass = p[2].strip() or 'building'
                name = p[3].strip().replace("'", "''")
                btype = p[4].strip() or 'residentiel'
                qname = p[5].strip()
                commune = p[6].strip()
                
                # Mapper vers quartier_id
                norm_q = norm(qname)
                qid = qtr_lookup.get(norm_q, 'qtr-matoto-centre')
                
                current_batch.append((osm_id, qid, code, fclass, name, btype))
                total_count += 1

                if len(current_batch) >= batch_size:
                    # Écrire le lot
                    out_path = f"sql_batches_batiments/batch_{batch_index:02d}.sql"
                    with open(out_path, 'w', encoding='utf-8') as out_f:
                        out_f.write("-- Lot d'insertion batiments_3d\n")
                        out_f.write("INSERT INTO batiments_3d (id, quartier_id, osm_id, code, fclass, nom, usage) VALUES\n")
                        values = []
                        for b in current_batch:
                            values.append(f"('b3d-{b[0]}', '{b[1]}', '{b[0]}', '{b[2]}', '{b[3]}', '{b[4]}', '{b[5]}')")
                        out_f.write(',\n'.join(values))
                        out_f.write("\nON CONFLICT (osm_id) DO UPDATE SET quartier_id = EXCLUDED.quartier_id;\n")
                    batch_index += 1
                    current_batch = []

if current_batch:
    out_path = f"sql_batches_batiments/batch_{batch_index:02d}.sql"
    with open(out_path, 'w', encoding='utf-8') as out_f:
        out_f.write("-- Lot d'insertion batiments_3d\n")
        out_f.write("INSERT INTO batiments_3d (id, quartier_id, osm_id, code, fclass, nom, usage) VALUES\n")
        values = []
        for b in current_batch:
            values.append(f"('b3d-{b[0]}', '{b[1]}', '{b[0]}', '{b[2]}', '{b[3]}', '{b[4]}', '{b[5]}')")
        out_f.write(',\n'.join(values))
        out_f.write("\nON CONFLICT (osm_id) DO UPDATE SET quartier_id = EXCLUDED.quartier_id;\n")

print(f"-> {total_count} bâtiments structurés en {batch_index} lots SQL dans ./sql_batches_batiments/")
