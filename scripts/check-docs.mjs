#!/usr/bin/env node
/**
 * Contrôle de cohérence de la documentation (identique dans Lynx et HailandMap_EMC).
 *
 * Règles (voir CLAUDE.md et ECOSYSTEME_HAILAND.md §12) :
 *  1. Si du code change (src/, scripts/, *.sql, package.json, config Vite/TS), la fiche du projet
 *     (NAVIGATIONX.md ou HAILANDMAP.md) doit changer aussi et gagner une ligne de journal (« | AAAA-MM-JJ | … »).
 *  2. Si ECOSYSTEME_HAILAND.md change, son numéro « Révision : N » doit augmenter.
 *  3. Aucun secret (clé Supabase secrète, JWT, jeton) ne doit apparaître dans les fichiers .md.
 *  4. Les liens relatifs des .md ([texte](./fichier)) doivent pointer vers des fichiers qui existent.
 *  5. (hors --staged) La copie d'ECOSYSTEME_HAILAND.md doit rester synchronisée avec celle de l'autre dépôt
 *     (branche par défaut, lue sur GitHub) : révision plus ancienne ou contenu différent à révision égale = échec.
 *     Réseau indisponible = simple avertissement.
 *
 * Dérogation : mettre « [docs: n/a] » dans le message de commit (changement sans effet documentaire :
 * mise en forme, faute de frappe…). Elle est signalée dans la sortie.
 *
 * Usage :
 *   node scripts/check-docs.mjs --staged            # avant un commit (fichiers indexés)
 *   node scripts/check-docs.mjs --base origin/main  # une branche / une PR par rapport à sa base
 *   node scripts/check-docs.mjs                     # défaut : base = origin/main si présent, sinon HEAD~1
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const sh = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const tryShell = (cmd) => { try { return sh(cmd); } catch { return null; } };

const args = process.argv.slice(2);
const staged = args.includes('--staged');
const baseIdx = args.indexOf('--base');
let base = baseIdx >= 0 ? args[baseIdx + 1] : null;

const PROJECT_DOC = ['NAVIGATIONX.md', 'HAILANDMAP.md'].find((f) => existsSync(f));
const ECO = 'ECOSYSTEME_HAILAND.md';
const errors = [];
const notes = [];

if (!PROJECT_DOC) {
  console.error('✗ Aucune fiche de projet (NAVIGATIONX.md / HAILANDMAP.md) à la racine.');
  process.exit(1);
}

// --- Fichiers modifiés et message(s) de commit -------------------------------------------------
let range = null;
let changed;
let messages = '';
if (staged) {
  changed = sh('git diff --cached --name-only').split('\n').filter(Boolean);
  const msgFile = process.env.COMMIT_MSG_FILE;
  if (msgFile && existsSync(msgFile)) messages = readFileSync(msgFile, 'utf8');
} else {
  if (!base) base = tryShell('git rev-parse --verify -q origin/main') ? 'origin/main' : 'HEAD~1';
  const mergeBase = (tryShell(`git merge-base ${base} HEAD`) || '').trim() || base;
  range = `${mergeBase}..HEAD`;
  changed = (tryShell(`git diff --name-only ${range}`) || '').split('\n').filter(Boolean);
  messages = tryShell(`git log --format=%B ${range}`) || '';
}

const isCode = (f) =>
  /^(src|scripts)\//.test(f) && f !== 'scripts/check-docs.mjs' ||
  /^[^/]+\.sql$/.test(f) ||
  /^sql_batches/.test(f) ||
  ['package.json', 'vite.config.ts', 'tsconfig.json', 'index.html'].includes(f);

const codeChanged = changed.filter(isCode);
const skip = /\[docs:\s*n\/a\]/i.test(messages);

// --- Règle 1 : fiche du projet + ligne de journal ---------------------------------------------
if (codeChanged.length > 0) {
  if (skip) {
    notes.push(`Dérogation « [docs: n/a] » utilisée pour ${codeChanged.length} fichier(s) de code.`);
  } else if (!changed.includes(PROJECT_DOC)) {
    errors.push(
      `Le code a changé (${codeChanged.slice(0, 4).join(', ')}${codeChanged.length > 4 ? '…' : ''}) mais ${PROJECT_DOC} n'a pas été mis à jour.`
    );
  } else {
    const diff = staged
      ? sh(`git diff --cached -U0 -- ${PROJECT_DOC}`)
      : tryShell(`git diff -U0 ${range} -- ${PROJECT_DOC}`) || '';
    const addedJournalRow = diff.split('\n').some((l) => /^\+\|\s*20\d\d-\d\d-\d\d\s*\|/.test(l));
    if (!addedJournalRow) {
      errors.push(`${PROJECT_DOC} a changé mais sans nouvelle ligne de journal (« | AAAA-MM-JJ | … |») en bas du fichier.`);
    }
  }
}

// --- Règle 2 : révision de ECOSYSTEME_HAILAND.md ----------------------------------------------
const revOf = (text) => {
  const m = /Révision\s*:\s*(\d+)/.exec(text || '');
  return m ? Number(m[1]) : null;
};
if (changed.includes(ECO)) {
  const current = readFileSync(ECO, 'utf8');
  const before = staged ? tryShell(`git show HEAD:${ECO}`) : tryShell(`git show ${range.split('..')[0]}:${ECO}`);
  const newRev = revOf(current);
  const oldRev = revOf(before);
  if (newRev === null) {
    errors.push(`${ECO} : ligne « Révision : N » introuvable.`);
  } else if (oldRev !== null && newRev <= oldRev) {
    errors.push(`${ECO} a changé mais sa révision n'a pas augmenté (${oldRev} → ${newRev}).`);
  } else {
    notes.push(`${ECO} : révision ${oldRev ?? '?'} → ${newRev}. Penser à recopier le fichier dans l'autre dépôt (ou à noter la tâche au §13).`);
  }
}

// --- Règle 3 : pas de secret dans les .md ------------------------------------------------------
const SECRET_PATTERNS = [
  [/sb_secret_[A-Za-z0-9_\-]{10,}/, 'clé Supabase secrète (sb_secret_…)'],
  [/eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}/, 'jeton JWT (eyJ…)'],
  [/sk-[A-Za-z0-9]{20,}/, 'clé API (sk-…)'],
  [/pk\.eyJ[A-Za-z0-9_\-]{20,}/, 'jeton Mapbox (pk.eyJ…)'],
];
const mdFiles = readdirSync('.').filter((f) => f.endsWith('.md'));
for (const f of mdFiles) {
  const text = readFileSync(f, 'utf8');
  for (const [re, label] of SECRET_PATTERNS) {
    if (re.test(text)) errors.push(`${f} : ${label} détecté — à retirer (et à faire pivoter).`);
  }
}

// --- Règle 4 : les liens relatifs des .md doivent pointer vers des fichiers existants --------------
for (const f of mdFiles) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/\[[^\]]+\]\((\.\/[^)#\s]+)(?:#[^)]*)?\)/g)) {
    if (!existsSync(m[1])) errors.push(`${f} : lien cassé vers ${m[1]} (fichier supprimé ou renommé ?).`);
  }
}

// --- Règle 5 : synchronisation avec l'autre dépôt ---------------------------------------------
if (!staged && existsSync(ECO) && !process.env.SKIP_SYNC_CHECK) {
  const other = PROJECT_DOC === 'NAVIGATIONX.md' ? 'HailandMap_EMC' : 'Lynx';
  const body = (t) => t.split('\n').slice(6).join('\n').trim(); // ignore l'en-tête (ligne « Fichiers liés » et révision)
  try {
    const res = await fetch(`https://raw.githubusercontent.com/Hailand07/${other}/main/${ECO}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const theirs = await res.text();
    const mine = readFileSync(ECO, 'utf8');
    const [rm, rt] = [revOf(mine), revOf(theirs)];
    if (rm !== null && rt !== null) {
      if (rm < rt) errors.push(`${ECO} : la copie de ce dépôt (révision ${rm}) est en retard sur ${other} (révision ${rt}) — recopier la plus récente.`);
      else if (rm === rt && body(mine) !== body(theirs)) errors.push(`${ECO} : même révision (${rm}) mais contenu différent de ${other} — resynchroniser.`);
      else if (rm > rt) notes.push(`${ECO} : révision ${rm} > ${other} (${rt}) — recopier dans ${other} (§13 si impossible).`);
    }
  } catch (e) {
    notes.push(`Synchro avec ${other} non vérifiée (${e.message}).`);
  }
}

// --- Sortie -----------------------------------------------------------------------------------
for (const n of notes) console.log(`ℹ ${n}`);
if (errors.length) {
  console.error('\n✗ Contrôle de documentation : ÉCHEC');
  for (const e of errors) console.error(`  - ${e}`);
  console.error(`\n  Voir ${ECO} §12 (procédure) ou ajouter « [docs: n/a] » au message de commit si le changement n'a aucun effet documentaire.`);
  process.exit(1);
}
console.log(`✓ Documentation cohérente (${codeChanged.length} fichier(s) de code, fiche : ${PROJECT_DOC}).`);
