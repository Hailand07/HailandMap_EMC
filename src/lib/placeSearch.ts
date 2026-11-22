/**
 * Recherche d'un endroit dans l'Atelier (2026-11-22, `HAILANDMAP.md` §11) : coordonnées collées et lieux (Mapbox Search Box,
 * limité à la Guinée). Les bâtiments relevés et les quartiers / communes sont cherchés ailleurs (registre et territoire).
 */

export interface PlaceHit {
  id: string;
  name: string;
  /** Rue, quartier, ville… tel que Mapbox le donne. */
  detail: string;
  center: [number, number];
}

const inGuinea = (lat: number, lng: number) => lat >= 7 && lat <= 13 && lng >= -15.5 && lng <= -7.5;

/**
 * « 9.6412, -13.6203 », « 9,6412 -13,6203 » ou l'ordre inverse (longitude d'abord) → { lat, lng } en Guinée ; sinon null.
 * Une virgule décimale n'est acceptée que si les deux nombres sont séparés par une espace ou un point-virgule.
 */
export function parseCoordinates(input: string): { lat: number; lng: number } | null {
  const t = input.trim();
  let parts: string[] | null = null;
  const dot = t.match(/^(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (dot) parts = [dot[1]!, dot[2]!];
  else {
    const comma = t.match(/^(-?\d{1,3}(?:,\d+)?)\s*[;\s]\s*(-?\d{1,3}(?:,\d+)?)$/);
    if (comma) parts = [comma[1]!.replace(',', '.'), comma[2]!.replace(',', '.')];
  }
  if (!parts) return null;
  const [a, b] = parts.map(Number) as [number, number];
  if (inGuinea(a, b)) return { lat: a, lng: b };
  if (inGuinea(b, a)) return { lat: b, lng: a };
  return null;
}

/** Lieux, rues et adresses connus de Mapbox en Guinée, les plus proches de `proximity` d'abord. Erreur réseau ou jeton absent : liste vide. */
export async function searchPlaces(query: string, token: string, proximity?: [number, number], signal?: AbortSignal): Promise<PlaceHit[]> {
  const q = query.trim();
  if (q.length < 3 || !token) return [];
  const params = new URLSearchParams({ q, country: 'gn', language: 'fr', limit: '6', access_token: token });
  if (proximity) params.set('proximity', `${proximity[0]},${proximity[1]}`);
  try {
    const r = await fetch(`https://api.mapbox.com/search/searchbox/v1/forward?${params}`, { signal });
    if (!r.ok) return [];
    const body = (await r.json()) as { features?: { id?: string; geometry?: { coordinates?: [number, number] }; properties?: { mapbox_id?: string; name?: string; full_address?: string; place_formatted?: string } }[] };
    return (body.features ?? [])
      .filter((f) => Array.isArray(f.geometry?.coordinates))
      .map((f, i) => ({
        id: f.properties?.mapbox_id ?? f.id ?? String(i),
        name: f.properties?.name ?? 'Lieu',
        detail: f.properties?.place_formatted ?? f.properties?.full_address ?? '',
        center: f.geometry!.coordinates as [number, number],
      }));
  } catch {
    return [];
  }
}
