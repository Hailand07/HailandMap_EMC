/**
 * Suivi GPS de l'Atelier (2026-11-22, `HAILANDMAP.md` §11) : calculs sans état, testés à part.
 * Le point bleu suit l'agent en continu ; un cercle montre la précision réelle annoncée par le téléphone.
 */

/** Au-delà de cette précision (m), la position est signalée comme approximative : trop large pour relever un bâtiment. */
export const PRECISE_M = 30;

/** Mètres par pixel à l'écran pour Mapbox GL (tuiles de 512 px) à une latitude et un zoom donnés. */
export function metersPerPixel(latitude: number, zoom: number): number {
  return (40075016.686 * Math.cos((latitude * Math.PI) / 180)) / (512 * 2 ** zoom);
}

/** Diamètre (px) du cercle de précision, borné pour ne pas dessiner un disque géant à petite échelle. */
export function accuracyDiameterPx(accuracyM: number, latitude: number, zoom: number, maxPx = 2400): number {
  const px = (2 * Math.max(0, accuracyM)) / metersPerPixel(latitude, zoom);
  return Math.min(maxPx, Math.max(0, Math.round(px)));
}

/** « ± 12 m », « ± 1,2 km ». */
export function accuracyText(accuracyM: number): string {
  if (accuracyM >= 1000) return `± ${(accuracyM / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`;
  return `± ${Math.round(accuracyM)} m`;
}

export const isPrecise = (accuracyM: number): boolean => accuracyM <= PRECISE_M;

/** État du bouton de position : éteint, recherche du premier signal, carte qui suit l'agent, ou position affichée sans suivre la carte. */
export type GpsMode = 'off' | 'searching' | 'follow' | 'free';

/** Effet d'un appui sur le bouton : démarrer, recentrer et suivre, ou arrêter. */
export function nextGpsAction(mode: GpsMode): 'start' | 'follow' | 'stop' | 'none' {
  if (mode === 'off') return 'start';
  if (mode === 'free') return 'follow';
  if (mode === 'follow') return 'stop';
  return 'none';
}

/** Au-delà (m), la position vient du réseau ou de l'adresse Internet, pas du GPS : elle n'est jamais suivie par la carte. */
export const COARSE_M = 150;

/**
 * Faut-il afficher cette nouvelle position ? On garde la meilleure position récente : une lecture nettement moins précise
 * (réponse du réseau intercalée entre deux lectures GPS) est ignorée tant que la meilleure a moins de `keepMs`.
 * C'est ce qui faisait « sauter » le point bleu (2026-11-23).
 */
export function acceptFix(best: { acc: number; at: number } | null, acc: number, now: number, keepMs = 20000): boolean {
  if (!best) return true;
  if (acc <= best.acc * 1.5 || acc <= PRECISE_M) return true;
  return now - best.at > keepMs;
}

/** Zoom qui laisse voir tout le cercle de précision : 18 pour ± 40 m ou mieux, 12 au plus large. */
export function zoomForAccuracy(acc: number): number {
  return Math.min(18, Math.max(12, 18 - Math.log2(Math.max(1, acc / 40))));
}
