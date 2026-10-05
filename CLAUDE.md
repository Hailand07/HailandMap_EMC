# CLAUDE.md — HailandMap (Hailand07/HailandMap_EMC)

## Lire d'abord (économise la phase de compréhension)
Ne pas tout relire : suivre le **« Guide de lecture »** en tête de `ECOSYSTEME_HAILAND.md` et ne lire que les sections utiles à la tâche.
1. [`ECOSYSTEME_HAILAND.md`](./ECOSYSTEME_HAILAND.md) — vision, applications (HailandMap / NavigationX / HailandX), **base Supabase partagée**, flux, règles de communication, écarts, plan d'amélioration.
2. [`HAILANDMAP.md`](./HAILANDMAP.md) — ce dépôt : architecture, flux d'enregistrement, règles de génération des codes, problèmes.

Le dépôt frère est **`Hailand07/Lynx`** (NavigationX, vitrine utilisateurs). Les deux applications partagent la même base Supabase : une modification de schéma, de statut, de code ou de règle touche les deux.

## Règle de maintenance de la documentation (obligatoire)
À **chaque** modification qui change le comportement, un flux, une table/colonne utilisée, une règle de code ou de statut, une dépendance ou l'état d'avancement :
1. mettre à jour **`HAILANDMAP.md`** (et son journal en bas) ;
2. mettre à jour **`ECOSYSTEME_HAILAND.md`** si cela touche à la base partagée, aux règles de communication, aux écarts ou au plan ;
3. si `ECOSYSTEME_HAILAND.md` a changé : **augmenter sa révision**, puis le recopier dans le dépôt Lynx (hors ligne « Fichiers liés ») ; si l'autre dépôt n'est pas accessible dans la session, ajouter la ligne à reporter dans son **§13** ;
4. faire ces mises à jour **dans le même commit** que le code ;
5. **en fin de session**, mettre à jour `ECOSYSTEME_HAILAND.md` **§14** (fait / décidé / bloqué / prochaine étape) — c'est ce qui permet de reprendre sans tout refaire.
Procédure complète pour une nouvelle fonctionnalité : `ECOSYSTEME_HAILAND.md` **§12**.
Utiliser la légende ✅ constaté / 📄 documenté / ⚠️ à vérifier / 💡 proposé ; ne jamais présenter une supposition comme un fait.

## Règles de sécurité
- Ne jamais écrire, afficher ni committer une clé ou un jeton (la clé Supabase publique est actuellement en dur dans `src/lib/supabase.ts` : ne pas en ajouter d'autres ; viser les variables d'environnement).
- L'accès de travail à la base passe par le **connecteur Supabase (lecture seule par défaut)** ; ne jamais mettre de clé secrète dans la zone « variables d'environnement » de l'environnement cloud.
- **Pas d'écriture dans la base de production** (insert/update/delete, migrations) sans accord explicite du fondateur pour cette opération. La base n'a **aucune sauvegarde**.
- HailandMap est le **propriétaire** du cadastre : codes, géométries, statuts de certification. Toute évolution de format de code doit être répercutée dans le contrat (`ECOSYSTEME_HAILAND.md` §6.2) et prévenir NavigationX.

## Conventions
- Langue : **français** (interface, commentaires, documentation, commits).
- Commandes : `npm run dev` (port 3000), `npm run build`, `npm run lint` (`tsc --noEmit`), `npm test` (tests unitaires), `npm run test:e2e` (bout en bout, base simulée), `npm run check:docs -- --staged` — lancer `lint`, `npm test` et `check:docs` avant de pousser. `check:docs` **échoue** si du code change sans mise à jour de la fiche du projet (+ ligne de journal), si la révision d'`ECOSYSTEME_HAILAND.md` n'augmente pas quand il change, ou si un secret apparaît dans un `.md` ; dérogation : `[docs: n/a]` dans le message de commit. Le hook de session (`.claude/hooks/session-start.sh`) active automatiquement le hook de commit, installe les dépendances et rappelle le contexte.
- Branche de travail courante : `claude/busy-cerf-cd22ke` ; ne pas créer de PR sans demande ; ne pas pousser sur `main` sans accord.
- Commits : messages clairs au format conventionnel (`feat:`, `fix:`, `docs:`, `refactor:`).
