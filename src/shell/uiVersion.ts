/**
 * Thème de l'interface : l'Atelier v2 (gris et bleu) est la seule interface depuis le 2026-10-05.
 * L'attribut `data-ui="v2"` active les jetons de couleur de `index.css`.
 */
export function initUiVersion(): void {
  document.documentElement.dataset.ui = 'v2';
}
