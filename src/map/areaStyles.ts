/**
 * Style de chaque niveau administratif quand il est trouvé par la recherche (2026-11-23, `HAILANDMAP.md` §11 C) :
 * toute la surface teintée et la frontière en trait plein, une couleur et une épaisseur propres à chaque niveau,
 * du pays au quartier. Plus le niveau est grand, plus la teinte est légère (on voit la carte dessous) et le trait épais.
 */
export type AreaLevel = 'pays' | 'region' | 'prefecture' | 'commune' | 'quartier';

export interface AreaStyle { label: string; color: string; line: string; fill: number; width: number }

export const AREA_STYLES: Record<AreaLevel, AreaStyle> = {
  pays: { label: 'Pays', color: '#e63946', line: '#e63946', fill: 0.06, width: 4 },
  region: { label: 'Région', color: '#9b5de5', line: '#9b5de5', fill: 0.1, width: 3.5 },
  prefecture: { label: 'Préfecture / ville', color: '#4c8dff', line: '#4c8dff', fill: 0.13, width: 3 },
  commune: { label: 'Commune', color: '#2ec4b6', line: '#14a396', fill: 0.17, width: 2.5 },
  quartier: { label: 'Quartier', color: '#ffd166', line: '#ffb703', fill: 0.24, width: 2.5 },
};

export const areaStyle = (level: string | undefined): AreaStyle => AREA_STYLES[(level ?? 'quartier') as AreaLevel] ?? AREA_STYLES.quartier;

/** « Commune de Ratoma », « Quartier Kobaya », « Guinée ». */
export function areaTitle(level: string | undefined, nom: string): string {
  if (level === 'pays') return nom;
  if (level === 'commune') return `Commune de ${nom}`;
  if (level === 'prefecture') return `Préfecture de ${nom}`;
  if (level === 'region') return `Région de ${nom}`;
  return `Quartier ${nom}`;
}

/** Superficie lisible : « 85 ha », « 12,4 km² », « 245 738 km² ». */
export function areaText(km2: number): string {
  if (km2 <= 0) return '';
  if (km2 < 1) return `${Math.round(km2 * 100)} ha`;
  return `${km2.toLocaleString('fr-FR', { maximumFractionDigits: km2 < 100 ? 1 : 0 })} km²`;
}

/** La recherche vise-t-elle le pays ? */
export const isCountryQuery = (q: string): boolean => /^(guin[ée]e?|guinea|pays|gn|r[ée]publique de guin[ée]e)$/i.test(q.trim());
