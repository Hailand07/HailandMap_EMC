
// Valeur par défaut pour le jeton Mapbox (masquée via variable d'environnement)
export const DEFAULT_MAPBOX_TOKEN = (import.meta as any).env?.VITE_MAPBOX_ACCESS_TOKEN || '';

export const CUSTOM_STYLE_URL = 'mapbox://styles/hailand/cmqbiiccq000b01qr7ckjeut1';

// Seuil d'apparition des cours, volumes 3D et portails (zoom Mapbox 15 ≈ altitude de 200 m)
export const CONCESSION_VIEW_MIN_ZOOM = 15.0;
