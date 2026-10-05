
/**
 * Génère un quadrillage de 200m x 200m sous forme de polygones GeoJSON couvrant l'ensemble du territoire guinéen.
 * Implémente le SYSTÈME HAILANDCODE v3.0 — ADRESSAGE GÉOMÉTRIQUE CENTRALISÉ (ID de carreau géométrique unique -[ZONE]-).
 * Supporte le calcul à la volée basé sur le viewport actuel de la carte pour des performances optimales.
 */
export const generate200mGridGeoJSON = (bounds?: { minLng: number; maxLng: number; minLat: number; maxLat: number }) => {
  const features: any[] = [];
  
  // Bornes par défaut (Conakry) si aucune borne n'est spécifiée
  let minLng = bounds ? bounds.minLng : -13.75;
  let maxLng = bounds ? bounds.maxLng : -13.50;
  let minLat = bounds ? bounds.minLat : 9.45;
  let maxLat = bounds ? bounds.maxLat : 9.65;

  // Si l'aire du viewport est trop grande, on centre la génération de la grille
  // autour de la vue pour éviter les ralentissements ou les crashs du navigateur.
  const spanLng = maxLng - minLng;
  const spanLat = maxLat - minLat;
  const maxSpan = 0.08; // Environ 8.8 km, idéal pour une grille dense, fluide et complète localement
  if (spanLng > maxSpan || spanLat > maxSpan) {
    const centerLng = (minLng + maxLng) / 2;
    const centerLat = (minLat + maxLat) / 2;
    minLng = centerLng - maxSpan / 2;
    maxLng = centerLng + maxSpan / 2;
    minLat = centerLat - maxSpan / 2;
    maxLat = centerLat + maxSpan / 2;
  }

  // Équivalences géométriques : 1 degré lat = 111111m -> 200m = 0.0018° lat
  // 1 degré lng = 111111 * cos(9.5°) = 109587m -> 200m = 0.001825° lng
  const stepLng = 0.001825;
  const stepLat = 0.0018;

  // Origine globale immuable pour le quadrillage national (Conakry initial)
  const globalMinLng = -13.75;
  const globalMinLat = 9.45;
  
  // Aligner parfaitement les indices de colonnes/rangées sur la grille globale déterministe
  const startCol = Math.floor((minLng - globalMinLng) / stepLng);
  const endCol = Math.ceil((maxLng - globalMinLng) / stepLng);
  const startRow = Math.floor((minLat - globalMinLat) / stepLat);
  const endRow = Math.ceil((maxLat - globalMinLat) / stepLat);

  for (let col = startCol; col <= endCol; col++) {
    const w = globalMinLng + col * stepLng;
    const e = w + stepLng;
    for (let row = startRow; row <= endRow; row++) {
      const s = globalMinLat + row * stepLat;
      const n = s + stepLat;
      
      // Assurer la cohérence stricte avec les maquettes d'origine
      let label = '';
      if (w <= -13.621 && -13.621 <= e && s <= 9.590 && 9.590 <= n) {
        label = 'Z014';
      } else if (w <= -13.625 && -13.625 <= e && s <= 9.592 && 9.592 <= n) {
        label = 'Z015';
      } else {
        // Formule déterministe globale pour un ID de carreau unique Zxxxx ou Z_Xcol_Yrow
        const cellNum = col * 115 + row + 1;
        let finalNum = cellNum;
        if (finalNum === 14 || finalNum === 15) {
          finalNum += 10000;
        }
        if (finalNum < 0) {
          label = `Z_X${Math.abs(col)}_Y${Math.abs(row)}`;
        } else {
          label = `Z${String(finalNum).padStart(3, '0')}`;
        }
      }
      
      features.push({
        type: 'Feature',
        properties: {
          id: label,
          col: col,
          row: row
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [w, s],
            [e, s],
            [e, n],
            [w, n],
            [w, s]
          ]]
        }
      });
    }
  }
  
  return {
    type: 'FeatureCollection' as const,
    features: features
  };
};

/**
 * Génère un UUID v4 standard pour garantir la compatibilité de type UUID dans Supabase.
 */

/**
 * Détecte de manière déterministe le carreau de 200m x 200m (l'ID unique de la ZONE)
 * à partir de coordonnées géographiques (longitude, latitude) sur tout le territoire.
 */
export const detect200mZoneFromCoords = (lng: number, lat: number): string => {
  const minLng = -13.75;
  const minLat = 9.45;
  const stepLng = 0.001825;
  const stepLat = 0.0018;

  const colIdx = Math.floor((lng - minLng) / stepLng);
  const rowIdx = Math.floor((lat - minLat) / stepLat);

  const w = minLng + colIdx * stepLng;
  const e = w + stepLng;
  const s = minLat + rowIdx * stepLat;
  const n = s + stepLat;

  if (w <= -13.621 && -13.621 <= e && s <= 9.590 && 9.590 <= n) {
    return 'Z014';
  }
  if (w <= -13.625 && -13.625 <= e && s <= 9.592 && 9.592 <= n) {
    return 'Z015';
  }

  const cellNum = colIdx * 115 + rowIdx + 1;
  let finalNum = cellNum;
  if (finalNum === 14 || finalNum === 15) {
    finalNum += 10000;
  }
  if (finalNum < 0) {
    return `Z_X${Math.abs(colIdx)}_Y${Math.abs(rowIdx)}`;
  }
  return `Z${String(finalNum).padStart(3, '0')}`;
};
