# HailandMap

Atelier de relevé et de validation du **cadastre numérique** de Guinée (concessions, bâtiments, Hailand-Code). Alimente la base Supabase partagée lue par NavigationX (dépôt `Hailand07/Lynx`).

## Documentation (à lire d'abord)
- [`ECOSYSTEME_HAILAND.md`](./ECOSYSTEME_HAILAND.md) — vision, applications, base partagée, flux, règles de communication.
- [`HAILANDMAP.md`](./HAILANDMAP.md) — ce dépôt : architecture, flux d'enregistrement, règles de génération des codes.
- [`CLAUDE.md`](./CLAUDE.md) — règles de travail (mise à jour des fichiers, sécurité).

## Lancer en local
```
npm install
npm run dev      # http://localhost:3000
npm run lint     # tsc --noEmit
```
Variable d'environnement : `VITE_MAPBOX_ACCESS_TOKEN` (jeton public Mapbox). Ne jamais committer de clé.
