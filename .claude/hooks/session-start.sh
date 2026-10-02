#!/bin/bash
# Démarrage de session : active le contrôle de documentation, installe les dépendances (sessions distantes),
# puis rappelle le contexte Hailand (la sortie standard est ajoutée au contexte de la session).
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"

git config core.hooksPath .githooks 2>/dev/null || true

if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] && [ -f package.json ]; then
  # Fichier de verrouillage présent (HailandMap) : installation reproductible (npm ci), sans le modifier ; sinon n'en crée pas (Lynx utilise bun.lock).
  if [ -f package-lock.json ]; then
    npm ci --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund >/dev/null 2>&1 || echo "⚠ installation des dépendances échouée : relancer manuellement avant lint/build."
  else
    npm install --no-package-lock --no-audit --no-fund >/dev/null 2>&1 || echo "⚠ npm install a échoué : relancer manuellement avant lint/build."
  fi
fi

if [ -f ECOSYSTEME_HAILAND.md ]; then
  rev=$(grep -o 'Révision : [0-9]*' ECOSYSTEME_HAILAND.md | head -1 | grep -o '[0-9]*' || true)
  echo "== Contexte Hailand =="
  echo "Lire CLAUDE.md puis le « Guide de lecture » de ECOSYSTEME_HAILAND.md (révision ${rev:-?}). Reprise du travail : §14. Procédure fonctionnalité : §12."
  pending=$(awk '/^## 13\./{f=1;next} /^## /{f=0} f && /^\| 20/ {print}' ECOSYSTEME_HAILAND.md || true)
  if [ -n "$pending" ]; then
    echo "Synchronisations en attente vers l'autre dépôt (§13) :"
    echo "$pending"
  fi
fi
exit 0
