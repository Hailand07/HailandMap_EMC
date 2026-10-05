/**
 * Calcule la distance entre deux coordonnées géographiques en mètres (formule de Haversine).
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Rayon de la Terre en mètres
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calcule l'aire d'un polygone de coordonnées en mètres carrés (m²) de façon plane locale.
 */
export function calculatePolygonArea(coordinates: [number, number][][]): number {
  if (!coordinates || coordinates.length === 0 || coordinates[0].length < 3) return 0;
  const ring = coordinates[0];
  const n = ring.length;
  if (n < 3) return 0;
  
  // Barycentre pour la projection locale plane
  let sumLng = 0;
  let sumLat = 0;
  ring.forEach(pt => {
    sumLng += pt[0];
    sumLat += pt[1];
  });
  const refLng = sumLng / n;
  const refLat = sumLat / n;
  
  const radLat = (refLat * Math.PI) / 180;
  const kx = 111320 * Math.cos(radLat); // mètres par degré de long
  const ky = 110540; // mètres par degré de lat
  
  // Formule de Shoelace
  let area = 0;
  for (let i = 0; i < n; i++) {
    const pt1 = ring[i];
    const pt2 = ring[(i + 1) % n];
    
    const x1 = (pt1[0] - refLng) * kx;
    const y1 = (pt1[1] - refLat) * ky;
    const x2 = (pt2[0] - refLng) * kx;
    const y2 = (pt2[1] - refLat) * ky;
    
    area += (x1 * y2) - (x2 * y1);
  }
  
  return Math.round(Math.abs(area / 2));
}

/**
 * Génère un polygone carré de dimension donnée autour de coordonnées géographiques (pour simulation de zone).
 */
export function generateSquarePolygon(lng: number, lat: number, halfSideMeters: number = 8): { type: "Polygon"; coordinates: [number, number][][] } {
  const radLat = (lat * Math.PI) / 180;
  const deltaLat = halfSideMeters / 110540;
  const deltaLng = halfSideMeters / (111320 * Math.cos(radLat));
  
  const p1: [number, number] = [lng - deltaLng, lat - deltaLat];
  const p2: [number, number] = [lng + deltaLng, lat - deltaLat];
  const p3: [number, number] = [lng + deltaLng, lat + deltaLat];
  const p4: [number, number] = [lng - deltaLng, lat + deltaLat];
  const p5: [number, number] = [lng - deltaLng, lat - deltaLat]; // Refermer
  
  return {
    type: 'Polygon',
    coordinates: [[p1, p2, p3, p4, p5]]
  };
}
