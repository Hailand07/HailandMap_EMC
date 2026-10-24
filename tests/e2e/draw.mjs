/**
 * Essai du tracé façon OpenStreetMap dans un vrai navigateur (src/map/draw), sans jeton Mapbox ni base :
 *   node tests/e2e/draw.mjs        (serveur de développement lancé à part sur le port E2E_DRAW_PORT, 3115 par défaut)
 * Captures dans tests/e2e/captures/ (ignorées par git).
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = Number(process.env.E2E_DRAW_PORT || 3115);
const OUT = new URL('./captures/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = '/opt/pw-browsers';
  if (existsSync(root)) {
    const dir = readdirSync(root).find((d) => d.startsWith('chromium-'));
    if (dir && existsSync(`${root}/${dir}/chrome-linux/chrome`)) return `${root}/${dir}/chrome-linux/chrome`;
    if (existsSync(`${root}/chromium`)) return `${root}/chromium`;
  }
  return undefined;
}
let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? '✓' : '✗'} ${name}${!ok && detail ? ` — ${detail}` : ''}`); };

const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${PORT}/tests/e2e/draw.html`);
await page.waitForFunction(() => window.__ready, null, { timeout: 30000 });
const st = () => page.evaluate(() => ({ ...window.__draw.state, status: window.__draw.state.status }));
const px = (ll) => page.evaluate((x) => window.__draw.px(x), ll);
const m = page.mouse;

// 1. tracer un rectangle un peu tordu, à main levée
const c = await px([-13.6775, 9.53075]);
const corners = [[-160, -110], [150, -95], [160, 120], [-150, 105]].map(([dx, dy]) => [c[0] + dx, c[1] + dy]);
await m.move(corners[0][0], corners[0][1]);
for (const [x, y] of corners) { await m.move(x, y, { steps: 6 }); await m.click(x, y); await page.waitForTimeout(60); }
await m.move(c[0] + 40, c[1] + 160, { steps: 8 });
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}1-trace-elastique.png` });
let s = await st();
check('4 sommets posés, surface élastique qui suit le curseur', s.points.length === 4 && s.phase === 'drawing');

// 2. fermer en cliquant le premier point
await m.move(corners[0][0] + 4, corners[0][1] + 3, { steps: 8 });
await page.waitForTimeout(120);
await page.screenshot({ path: `${OUT}2-fermeture.png` });
await m.click(corners[0][0] + 4, corners[0][1] + 3);
await page.waitForTimeout(150);
s = await st();
check('clic sur le premier point : contour fermé, phase « ajuster »', s.phase === 'editing' && s.points.length === 4);
check('coins presque droits détectés (équerrer proposé)', s.status?.canSquare === true && s.status.unsquareDeg > 1, JSON.stringify(s.status));
await page.screenshot({ path: `${OUT}3-ajuster.png` });

// 3. équerrer (Q)
await page.keyboard.press('q');
await page.waitForTimeout(150);
s = await st();
check('Q : coins droits', s.status?.canSquare === false && s.points.length === 4, JSON.stringify(s.status));
await page.screenshot({ path: `${OUT}4-equerre.png` });

// 4. glisser le milieu d'un mur : un sommet de plus
const pts = s.points; const a = await px(pts[0]); const b = await px(pts[1]);
const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
await m.move(mid[0], mid[1], { steps: 4 }); await m.down(); await m.move(mid[0], mid[1] - 45, { steps: 10 }); await m.up();
await page.waitForTimeout(150);
s = await st();
check('glisser un milieu de mur ajoute un sommet', s.points.length === 5);
await page.screenshot({ path: `${OUT}5-sommet-ajoute.png` });

// 5. annuler (Ctrl+Z) puis glisser un sommet sur le coin du bâtiment voisin : aimantation
await page.keyboard.press('Control+z');
await page.waitForTimeout(100);
s = await st();
check('Ctrl+Z annule l’ajout', s.points.length === 4);
const corner = await px([-13.67779, 9.5306]);
const v0 = await px(s.points[0]);
await m.move(v0[0], v0[1], { steps: 4 }); await m.down(); await m.move(corner[0] + 5, corner[1] - 4, { steps: 14 }); await page.waitForTimeout(80);
await page.screenshot({ path: `${OUT}6-aimantation.png` });
await m.up(); await page.waitForTimeout(120);
s = await st();
const d = await px(s.points[0]);
check('sommet aimanté sur le coin voisin', Math.hypot(d[0] - corner[0], d[1] - corner[1]) < 0.6, `${d} vs ${corner}`);

// 6. clic droit sur un sommet : retiré ; puis arrondir (O)
const v2 = await px(s.points[2]);
await m.click(v2[0], v2[1], { button: 'right' }); await page.waitForTimeout(120);
s = await st();
check('clic droit retire un sommet', s.points.length === 3);
await page.keyboard.press('o'); await page.waitForTimeout(120);
s = await st();
check('O : cercle de 20 sommets', s.points.length === 20);
await page.screenshot({ path: `${OUT}7-arrondi.png` });

// 7. Entrée : valider
await page.keyboard.press('Enter'); await page.waitForTimeout(80);
s = await st();
check('Entrée : contour validé', Array.isArray(s.finished) && s.finished.length === 20);
check('aucune erreur dans la page', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} échec(s)` : 'Tout est bon.');
process.exit(failed ? 1 : 0);
