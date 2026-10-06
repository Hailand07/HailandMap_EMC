/**
 * Test de bout en bout de HailandMap (navigateur réel, base simulée).
 *
 *   npm run test:e2e
 *
 * - La base Supabase est SIMULÉE (requêtes interceptées) : aucune lecture ni écriture réelle.
 * - Les parcours qui utilisent la carte demandent `VITE_MAPBOX_ACCESS_TOKEN` (jeton public) et un accès réseau à Mapbox ;
 *   sans jeton ils sont ignorés et le dit clairement.
 * - Navigateur : variable CHROMIUM_PATH, sinon /opt/pw-browsers/chromium (cloud), sinon celui de Playwright.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = Number(process.env.E2E_PORT || 3114);
const BASE = `http://127.0.0.1:${PORT}/`;
const HAS_TOKEN = Boolean(process.env.VITE_MAPBOX_ACCESS_TOKEN);
const AGENT_ID = '3f9a21c4-7d58-4e0b-b1a6-2c84d0e57f19';
// Une concession déjà au registre, à Coleah Domino (sert de point d'arrivée sur la carte).
const FIXTURE = {
  id: 'fx-cr003', hailand_code: 'GN-Z4530-CR003', zone_code: 'Z4530', building_type: 'R', has_courtyard: true, parent_building_id: null,
  floor_count: 0, unit_count: 1, status: 'actif', is_validated: true, commune: 'Matam', quartier: 'Coleah Domino',
  geom: { type: 'Polygon', coordinates: [[[-13.6777, 9.5306], [-13.6773, 9.5306], [-13.6773, 9.5309], [-13.6777, 9.5309], [-13.6777, 9.5306]]] },
  courtyard_geom: null, centroid: { type: 'Point', coordinates: [-13.6775, 9.53075] }, created_at: '2026-09-16T00:00:00Z',
};

const DECLARATION = {
  id: 'd0000000-0000-4000-8000-000000000001', user_id: 'u1', detected_level: 2, hailand_code: 'GN-CKY-01-03-008-0042',
  gps_point: { type: 'Point', coordinates: [-13.6762, 9.5316] }, anchor_point: { type: 'Point', coordinates: [-13.6762, 9.5316] },
  osm_polygon_geom: null, commune_id: 'com-matam', quartier_id: 'qtr-osm-5567222', admin_source: 'quartier',
  declared_label: 'Chez Mariama', declared_building_type: 'R', declared_floor_count: 1, declared_units_per_floor: 2,
  declared_landmark: 'Derrière la mosquée', declared_note: null, location_floor: null, location_door: null,
  certification_requested_at: '2026-10-05T10:00:00Z', certified_building_id: null, unit_id: null, link_method: null, linked_at: null,
  created_at: '2026-10-05T09:00:00Z',
};
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${!ok && detail ? ` — ${detail}` : ''}`);
};
const skip = (name, why) => {
  results.push({ name, ok: true, skipped: true });
  console.log(`- ${name} (ignoré : ${why})`);
};

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

async function startServer() {
  const proc = spawn('npx', ['vite', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], { stdio: 'pipe', env: process.env, detached: true });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('le serveur de développement ne démarre pas')), 60000);
    proc.stdout.on('data', (d) => { if (String(d).includes('Local:')) { clearTimeout(t); resolve(); } });
    proc.on('exit', (c) => reject(new Error(`serveur arrêté (${c})`)));
  });
  return proc;
}

/** Simule Supabase : authentification par code, table des agents, lecture du registre. */
async function mockSupabase(page, { agent = 'admin', registry = 'ok', writes = [], declarations = [] } = {}) {
  await page.route('**/auth/v1/settings', (r) => r.fulfill({ json: { external: { email: true, phone: true } } }));
  await page.route('**/auth/v1/otp', (r) => r.fulfill({ json: {} }));
  await page.route('**/auth/v1/verify', (r) =>
    r.fulfill({ json: { access_token: 'a.b.c', refresh_token: 'r', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: AGENT_ID, aud: 'authenticated', role: 'authenticated', phone: '224600000000', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } } }),
  );
  await page.route('**/rest/v1/agents*', (r) =>
    agent === 'admin'
      ? r.fulfill({ json: { role: 'admin', active: true } })
      : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }),
  );
  await page.route('**/rest/v1/**', async (r) => {
    const req = r.request();
    const table = req.url().split('/rest/v1/')[1].split(/[?/]/)[0];
    if (req.method() !== 'GET') {
      writes.push({ method: req.method(), table, body: req.postData() || '' });
      return r.fulfill({ status: 201, json: [] });
    }
    if (table === 'agents') return r.fallback();
    if (registry === 'down' && table === 'buildings') return r.abort();
    if (table === 'buildings' && registry === 'one') return r.fulfill({ json: [FIXTURE] });
    if (table === 'declarations') return r.fulfill({ json: declarations });
    return r.fulfill({ json: [] });
  });
}

async function login(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('6XX XX XX XX').waitFor({ timeout: 15000 });
  await page.getByPlaceholder('6XX XX XX XX').fill('600000000');
  await page.getByRole('button', { name: /Recevoir le code/ }).click();
  await page.getByText('Entrez le code reçu').waitFor({ timeout: 25000 });
  await page.getByLabel('Chiffre 1').click();
  await page.keyboard.type('123456', { delay: 40 });
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    // 1. Ouverture et connexion
    {
      const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
      await mockSupabase(page, { agent: 'none' });
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      check('écran d’ouverture affiché', await page.getByText('L’atelier cadastral de l’adressage en Guinée').isVisible({ timeout: 5000 }).catch(() => false));
      await page.getByPlaceholder('6XX XX XX XX').waitFor({ timeout: 15000 });
      check('connexion : le téléphone est proposé en premier', (await page.getByRole('tab', { name: 'Téléphone' }).getAttribute('aria-selected')) === 'true');
      await page.getByPlaceholder('6XX XX XX XX').fill('600000000');
      await page.getByRole('button', { name: /Recevoir le code/ }).click();
      await page.getByText('Entrez le code reçu').waitFor({ timeout: 25000 });
      check('code : six cases de saisie', (await page.getByLabel(/^Chiffre \d$/).count()) === 6);
      await page.getByLabel('Chiffre 1').click();
      await page.keyboard.type('123456', { delay: 40 });
      await page.getByText('Compte non autorisé').waitFor({ timeout: 25000 }).catch(async (e) => { console.log('TEXTE PAGE:', (await page.locator('body').innerText()).slice(0, 400)); throw e; });
      check('compte absent de la table des agents : « Compte non autorisé »', true);
      check('l’identifiant du compte est affiché', await page.getByText(AGENT_ID).isVisible());
      await page.context().close();
    }

    // 2. Agent autorisé : aucune écriture au chargement ; registre vide accepté
    {
      const writes = [];
      const errors = [];
      const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      await mockSupabase(page, { agent: 'admin', writes });
      await login(page);
      await page.getByRole('button', { name: 'Revue' }).first().waitFor({ timeout: 20000 });
      check('agent autorisé : l’atelier s’ouvre', true);
      await page.waitForTimeout(HAS_TOKEN ? 6000 : 2000);
      check('aucune écriture vers la base au chargement', writes.length === 0, JSON.stringify(writes.map((w) => `${w.method} ${w.table}`)));
      check('aucune erreur de page', errors.length === 0, errors.join(' | ').slice(0, 300));
      check('registre vide : aucune fausse donnée affichée', await page.getByText('0 bâtiments').first().isVisible().catch(() => false));
      for (const mod of ['Revue', 'Registre', 'Pilotage']) {
        await page.getByRole('button', { name: mod, exact: true }).first().click();
        await page.waitForTimeout(800);
      }
      check('navigation entre les modules sans erreur', errors.length === 0, errors.join(' | ').slice(0, 300));
      await page.getByRole('button', { name: 'Réglages' }).first().click();
      check('fenêtre des réglages', await page.getByText('Paramètres cartographiques').isVisible());
      await page.context().close();
    }

    // 2 bis. Revue → Demandes : une déclaration de résident (indice de niveau 2, vérification demandée)
    {
      const errors = [];
      const writes = [];
      const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      await mockSupabase(page, { agent: 'admin', declarations: [DECLARATION], writes });
      await login(page);
      await page.getByRole('button', { name: 'Revue', exact: true }).first().waitFor({ timeout: 25000 });
      await page.getByRole('button', { name: 'Revue', exact: true }).first().click();
      check('Revue : onglet « Demandes » avec la déclaration', await page.getByRole('button', { name: 'Demandes · 1' }).isVisible({ timeout: 8000 }).catch(() => false));
      check('la déclaration est un indice non officiel (niveau 2)', await page.getByText('INDICE · POLYGONE OSM (NIVEAU 2)').isVisible().catch(() => false));
      check('« vérification demandée » est signalée', await page.getByText(/VÉRIFICATION DEMANDÉE/).first().isVisible().catch(() => false));
      check('aucun bâtiment certifié proche : « le bâtiment reste à créer »', await page.getByText('Aucun : le bâtiment reste à créer.').isVisible().catch(() => false));
      check('Demandes : bouton « Certifier ce bâtiment »', await page.getByRole('button', { name: /Certifier ce bâtiment/ }).isVisible().catch(() => false));
      await page.getByRole('button', { name: /Refuser la demande/ }).click().catch(() => {});
      check('refus : le motif est exigé (10 caractères)', await page.getByRole('button', { name: 'Confirmer le refus' }).isDisabled().catch(() => false));
      await page.getByPlaceholder(/Ex\. le bâtiment/).fill('Bâtiment non identifiable : indiquez un repère précis.').catch(() => {});
      await page.getByRole('button', { name: 'Confirmer le refus' }).click().catch(() => {});
      await page.waitForTimeout(1200);
      check('refus : la décision et son motif sont envoyés à la base', Boolean(writes.find((w) => w.method === 'POST' && w.table === 'rpc' && /p_note/.test(w.body))), JSON.stringify(writes.map((w) => w.table)));
      check('Revue : onglet « Modifications »', await page.getByRole('button', { name: /^Modifications/ }).isVisible().catch(() => false));
      if (HAS_TOKEN) {
        await page.getByRole('button', { name: /Certifier ce bâtiment/ }).click();
        const banner = page.getByText('CERTIFICATION DEMANDÉE PAR UN RÉSIDENT');
        check('certification : l’assistant s’ouvre avec le bandeau de la demande', await banner.waitFor({ timeout: 15000 }).then(() => true).catch(() => false));
        check('certification : la conséquence est annoncée (niveau 3, même code)', await page.getByText(/garde le code/).isVisible().catch(() => false));
        if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/certification.png` });
        await page.getByRole('button', { name: 'Revenir à la demande' }).click().catch(() => {});
        check('certification : « Revenir à la demande » ramène à la Revue', await page.getByRole('button', { name: /^Demandes/ }).isVisible({ timeout: 8000 }).catch(() => false));
      }
      check('aucune erreur de page (Demandes)', errors.length === 0, errors.join(' | ').slice(0, 300));
      if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/revue-demandes.png` });
      await page.context().close();
    }

    // 3. Base injoignable : bandeau et « Réessayer »
    {
      const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
      await mockSupabase(page, { agent: 'admin', registry: 'down' });
      await login(page);
      await page.getByRole('alert').waitFor({ timeout: 20000 });
      check('base injoignable : bandeau d’erreur avec « Réessayer »', await page.getByRole('button', { name: 'Réessayer' }).isVisible());
      await page.context().close();
    }

    // 4. Création d’un bâtiment jusqu’à l’enregistrement (envoi intercepté)
    if (!HAS_TOKEN) {
      skip('création d’un bâtiment sur la carte', 'VITE_MAPBOX_ACCESS_TOKEN absent');
    } else {
      const writes = [];
      const errors = [];
      const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      await mockSupabase(page, { agent: 'admin', registry: 'one', writes });
      await login(page);
      await page.getByText('GN-Z4530-CR003').first().waitFor({ timeout: 30000 });
      check('la fiche du registre apparaît dans l’arbre du territoire', true);
      await page.getByText('GN-Z4530-CR003').first().click();
      await page.waitForTimeout(9000);
      check('sélectionner une fiche ouvre sa fiche flottante', await page.getByRole('button', { name: 'Voir la fiche' }).isVisible().catch(() => false));
      await page.getByRole('button', { name: 'Fermer' }).first().click().catch(() => {});
      await page.mouse.click(1170, 330);
      const create = page.getByRole('button', { name: /Créer la fiche/ });
      const hasCandidate = await create.first().waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
      check('cliquer un bâtiment non relevé propose « Créer la fiche »', hasCandidate);
      if (hasCandidate) {
        await page.getByRole('button', { name: 'Fermer' }).first().click().catch(() => {});
        await page.waitForTimeout(600);
        check('bâtiment OSM : aucune fausse fiche après fermeture', !(await page.getByRole('button', { name: /Voir la fiche|Ouvrir au registre/ }).isVisible().catch(() => false)));
        await page.mouse.click(1170, 330);
        await create.first().waitFor({ timeout: 8000 }).catch(() => {});
      }
      if (hasCandidate) {
        await create.first().click();
        let last = '';
        for (let i = 0; i < 6; i++) {
          const next = page.getByRole('button', { name: /Suivant|Enregistrer/ }).last();
          last = (await next.textContent().catch(() => '')) || '';
          if (!last) break;
          await next.click().catch(() => {});
          await page.waitForTimeout(1200);
          if (/Enregistrer/.test(last)) break;
        }
        check('l’assistant mène à « Enregistrer et certifier »', /Enregistrer/.test(last), last);
        await page.waitForTimeout(2500);
        const post = writes.find((w) => w.method === 'POST' && w.table === 'buildings');
        check('l’enregistrement envoie une fiche à la base (interceptée)', Boolean(post));
        if (post) {
          const body = JSON.parse(post.body);
          const row = Array.isArray(body) ? body[0] : body;
          check('le code a le format GN-Z…-R…', /^GN-Z\d+-R\d{3}$/.test(row.hailand_code), row.hailand_code);
          check('la fiche est signée par l’agent connecté', row.submitted_by === AGENT_ID, String(row.submitted_by));
          check('statut « actif » et certifié par l’agent', row.status === 'actif' && row.is_validated === true);
        }
        const rpc = writes.find((w) => w.table === 'rpc');
        check('les unités du bâtiment sont enregistrées après la fiche', Boolean(rpc) && /p_units/.test(rpc.body), rpc ? rpc.body.slice(0, 120) : 'aucun appel');
        if (post) {
          const row = (() => { const b = JSON.parse(post.body); return Array.isArray(b) ? b[0] : b; })();
          check('l’origine de l’enregistrement est tracée (bâtiment OSM)', row.registration_origin === 'osm', String(row.registration_origin));
        }
        await page.getByRole('button', { name: 'Fermer' }).first().click().catch(() => {});
        await page.waitForTimeout(1500);
        await page.mouse.click(1170, 330);
        await page.waitForTimeout(2000);
        const sheetBtn = page.getByRole('button', { name: 'Voir la fiche' });
        check('le bâtiment enregistré montre « Voir la fiche » (plus « Créer la fiche »)', await sheetBtn.isVisible().catch(() => false) && !(await page.getByRole('button', { name: /Créer la fiche/ }).isVisible().catch(() => false)));
        await sheetBtn.click().catch(() => {});
        check('la fiche s’ouvre avec historique et modification', await page.getByRole('dialog', { name: 'Fiche du bâtiment' }).isVisible({ timeout: 5000 }).catch(() => false));
        await page.getByRole('button', { name: /Modifier|Proposer une modification/ }).first().click().catch(() => {});
        check('la fiche propose de retracer le contour', await page.getByRole('button', { name: /Retracer le contour/ }).isVisible().catch(() => false));
        check('la fiche propose d’éditer les unités (génération, unité unique)', await page.getByRole('button', { name: 'Unité unique' }).isVisible().catch(() => false));
        check('la modification exige une justification', await page.getByText(/Justification/).isVisible().catch(() => false) && await page.getByRole('button', { name: /^Appliquer|^Proposer/ }).isDisabled().catch(() => false));
        if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/fiche.png` });
      }
      check('aucune erreur de page pendant la création', errors.length === 0, errors.join(' | ').slice(0, 300));
      await page.context().close();
    }
  } finally {
    await browser.close();
    try { process.kill(-server.pid); } catch { server.kill(); }
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} contrôles réussis${failed.length ? ` — ${failed.length} en échec` : ''}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('Échec du test :', e.message); process.exit(1); });
