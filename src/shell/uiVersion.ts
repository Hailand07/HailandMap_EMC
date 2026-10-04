/**
 * Version de l'interface : « v2 » (Atelier v2, par défaut depuis le 2026-10-04) ou « v1 » (ancienne interface, conservée en secours).
 * On bascule avec `?ui=v2` / `?ui=v1` dans l'adresse ; le choix est mémorisé sur l'appareil (`hm.ui`).
 * `?ui=v1` revient à l'ancienne interface (mémorisé sur l'appareil).
 */
export type UiVersion = 'v1' | 'v2';
const KEY = 'hm.ui';

export function getUiVersion(): UiVersion {
  try {
    const q = new URLSearchParams(window.location.search).get('ui');
    if (q === 'v1' || q === 'v2') {
      localStorage.setItem(KEY, q);
      return q;
    }
    return localStorage.getItem(KEY) === 'v1' ? 'v1' : 'v2';
  } catch {
    return 'v2';
  }
}

export function setUiVersion(v: UiVersion): void {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* stockage indisponible */
  }
  window.location.reload();
}

/** À appeler avant le premier rendu : pose l'attribut `data-ui` qui active les jetons de la v2 (voir `index.css`). */
export function initUiVersion(): UiVersion {
  const v = getUiVersion();
  document.documentElement.dataset.ui = v;
  return v;
}
