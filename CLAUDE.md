# CLAUDE.md — HailandMap (Hailand07/HailandMap_EMC)

## Lire d'abord (économise la phase de compréhension)
1. [`ECOSYSTEME_HAILAND.md`](./ECOSYSTEME_HAILAND.md) — vision, applications (HailandMap / NavigationX / HailandX), **base Supabase partagée**, flux, règles de communication, écarts, plan d'amélioration.
2. [`HAILANDMAP.md`](./HAILANDMAP.md) — ce dépôt : architecture, flux d'enregistrement, règles de génération des codes, problèmes.
3. `PLAN_*.md`, `SUIVI_*.md` — anciens plans (partiellement décalés par rapport à la production, voir `ECOSYSTEME_HAILAND.md` §4.2).

Le dépôt frère est **`Hailand07/Lynx`** (NavigationX, vitrine utilisateurs). Les deux applications partagent la même base Supabase : une modification de schéma, de statut, de code ou de règle touche les deux.

## Règle de maintenance de la documentation (obligatoire)
À **chaque** modification qui change le comportement, un flux, une table/colonne utilisée, une règle de code ou de statut, une dépendance ou l'état d'avancement :
1. mettre à jour **`HAILANDMAP.md`** (et son journal en bas) ;
2. mettre à jour **`ECOSYSTEME_HAILAND.md`** si cela touche à la base partagée, aux règles de communication, aux écarts ou au plan ;
3. recopier `ECOSYSTEME_HAILAND.md` dans le dépôt Lynx (hors ligne « Fichiers liés ») ;
4. faire ces mises à jour **dans le même commit** que le code.
Utiliser la légende ✅ constaté / 📄 documenté / ⚠️ à vérifier / 💡 proposé ; ne jamais présenter une supposition comme un fait.

## Règles de sécurité
- Ne jamais écrire, afficher ni committer une clé ou un jeton (la clé Supabase publique est actuellement en dur dans `src/lib/supabase.ts` : ne pas en ajouter d'autres ; viser les variables d'environnement).
- **Pas d'écriture dans la base de production** (insert/update/delete, migrations) sans accord explicite du fondateur pour cette opération. La base n'a **aucune sauvegarde**.
- HailandMap est le **propriétaire** du cadastre : codes, géométries, statuts de certification. Toute évolution de format de code doit être répercutée dans le contrat (`ECOSYSTEME_HAILAND.md` §6.2) et prévenir NavigationX.

## Conventions
- Langue : **français** (interface, commentaires, documentation, commits).
- Commandes : `npm run dev` (port 3000), `npm run build`, `npm run lint` (`tsc --noEmit`) — lancer `lint` avant de pousser.
- Branche de travail courante : `claude/busy-cerf-cd22ke` ; ne pas créer de PR sans demande ; ne pas pousser sur `main` sans accord.
- Commits : messages clairs au format conventionnel (`feat:`, `fix:`, `docs:`, `refactor:`).
