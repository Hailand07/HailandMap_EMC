/**
 * Version de l'interface : « v1 » (actuelle, par défaut) ou « v2 » (Atelier v2, refonte en cours — phase 0 : coque et thème).
 * On bascule avec `?ui=v2` / `?ui=v1` dans l'adresse ; le choix est mémorisé sur l'appareil (`hm.ui`).
 * Tant que la v2 n'a pas atteint la parité avec la v1, la v1 reste l'interface par défaut.
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
    return localStorage.getItem(KEY) === 'v2' ? 'v2' : 'v1';
  } catch {
    return 'v1';
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
