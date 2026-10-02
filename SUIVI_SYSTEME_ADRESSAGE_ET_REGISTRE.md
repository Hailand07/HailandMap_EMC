# SUIVI OFFICIEL — SYSTÈME DE DOUBLE ADRESSAGE HYBRIDE & REGISTRE CADASTRAL NATIONAL

> **Application** : HailandMap Guinée — Cadastre & Adressage Numérique d'État  
> **Date de démarrage** : 26 Septembre 2026  
> **Statut global** : 🚀 EN COURS D'EXÉCUTION  

---

## 🎯 OBJECTIFS DU CHANTIER

1. **Rendre le système d'adressage ultra-robuste et souverain** en combinant deux logiques complémentaires :
   - **Système 1 (Grille Métrique 200m)** : Maillage spatial uniforme du territoire (`GN-[Zone200m]-[Cour/Lot]-[Bâtiment]`).
   - **Système 2 (Hiérarchie Administrative Officielle de Guinée)** : Découpage administratif souverain (`Pays > Région > Préfecture/Ville > Commune > Quartier > Lot > Bâtiment > Unité`).
2. **Automatisation déterministe lors de l'enregistrement** :
   - Dès la délimitation satellite et le clic sur "Enregistrer", résolution spatiale automatique (Turf.js point-dans-polygone) de toutes les couches administratives jusqu'au quartier officiel.
3. **Refonte complète de l'interface "Registre National d'Adressage Numérique"** :
   - Interface de visualisation et gestion de données haut de gamme (type Supabase Studio / Airtable Cadastral), flexible, structurée, gérant parfaitement la hiérarchie Mère-Enfant (Concessions mères ➔ Bâtiments enfants rattachés ➔ Bâtiments directs).
   - Dossier cadastral exhaustif 360° pour chaque lot avec toutes les données du formulaire de relevé et de navigation Niveau 3.
   - Filtres à facettes dynamiques, multi-vues (Table, Arbre Mère-Enfant, Fiches), exportations CSV/GeoJSON, audit spatial Turf.

---

## 📋 PLAN DE TRAVAIL & ÉTAPES DE VALIDATION

| Étape | Description | Statut | Logs / Validation |
| :--- | :--- | :---: | :--- |
| **Étape 1** | Création du plan de travail et du fichier de suivi | ✅ VALIDÉ | Fichier `SUIVI_SYSTEME_ADRESSAGE_ET_REGISTRE.md` initialisé. |
| **Étape 2** | Consolidation du Moteur d'Adressage Administratif (`administrativeAddressingService.ts`) | ✅ VALIDÉ | Trigrammes officiels, point-in-polygon robuste, cache des géométries, formatage dual unifié, distinction cour mère / enfant. |
| **Étape 3** | Intégration dans le Pipeline d'Enregistrement (`CourtyardManager`, `DirectBuildingForm`, `App.tsx`) | ✅ VALIDÉ | Enrichissement automatique dès la fin du tracé d'une concession ou d'un bâtiment et journalisation d'État. |
| **Étape 4** | Rétro-enrichissement et synchronisation des données existantes dans Supabase | ✅ VALIDÉ | 34 bâtiments réels synchronisés dans Supabase avec leurs communes et quartiers réels. |
| **Étape 5** | Modernisation approfondie du "Registre National d'Adressage Numérique" (`BuildingsView.tsx`) | ✅ VALIDÉ | Vue Table Supabase-like, Vue Arborescente Mère-Enfant, Dossier 360° avec calculs métriques, fil d'Ariane, exportations JSON/CSV/GeoJSON. |
| **Étape 6** | Vérifications techniques globales (`compile_applet`, `lint_applet`, tests en direct) | ✅ VALIDÉ | Lint TypeScript 100% propre (zéro erreur) & Build Vite réussi sans avertissement bloquant. |

---

## 🏛️ SPÉCIFICATION TECHNIQUE DU DOUBLE ADRESSAGE

### 1. Système 1 : Adressage Métrique par Grille (200m)
- **Format** : `GN-[CodeZone]-[Cour/Concession]-[Bâtiment/Unité]`
- **Exemple Cour Mère** : `GN-Z014-CR001`
- **Exemple Bâtiment Enfant** : `GN-Z014-CR001-RA` (Résidentiel A)
- **Exemple Unité Spécifique** : `GN-Z014-CR001-RA-E1-102` (Étage 1, Porte 102)

### 2. Système 2 : Adressage Administratif Hiérarchique Souverain
- **Hiérarchie** :
  - **Pays** : Guinée (`GN`)
  - **Région / Gouvernorat** : Conakry (`CKY`), Kindia (`KIN`), Boké (`BKE`), etc.
  - **Préfecture / Ville** : Conakry (`CKY`), Kindia (`KND`), etc.
  - **Commune** : Ratoma (`RTM`), Matam (`MTM`), Dixinn (`DXN`), Kaloum (`KLM`), Matoto (`MTT`), Lambanyi (`LMB`), Sonfonia (`SNF`), etc.
  - **Quartier** : Kipé (`KIP`), Taouyah (`TWY`), Coleah Centre (`CLH`), Camayenne (`CMY`), etc.
  - **Lot / Concession** : `C001`, `C042`, etc.
  - **Bâtiment** : `B01`, `RA`, etc.
  - **Unité / Porte** : `U101`, etc.
- **Code Administratif Normalisé** :
  - Concession Mère : `GN.CKY.RTM.KIP-C001`
  - Bâtiment Enfant : `GN.CKY.RTM.KIP-C001-RA`
  - Bâtiment Direct Autonome : `GN.CKY.RTM.KIP-C001-B01`
- **Adresse Textuelle Officielle** : `Concession C001, Quartier Kipé, Commune de Ratoma, Ville de Conakry, République de Guinée`

### 3. Libellé Synthétique Unifié
- **Format** : `[GN-Z014-CR001-RA] · GN.CKY.RTM.KIP-C001-RA · Kipé, Ratoma`

---

## 📝 JOURNAL DE BORD DES ACTIONS RÉALISÉES

- **[Init]** Analyse complète des structures existantes dans `administrativeAddressingService.ts`, `BuildingsView.tsx`, `CourtyardManager.tsx` et `supabase.ts`.
- **[Init]** Confirmation des 34 bâtiments réels dans Supabase et validation de la structure de table.
- **[Moteur Adressage]** Enrichissement des trigrammes de communes (Ratoma, Matam, Dixinn, Kaloum, Matoto, Lambanyi, Sonfonia, Tombolia, Gbessia, Kagbelen, Sanoyah, Dubréka, Coyah, etc.).
- **[Moteur Adressage]** Mise à jour de `resolveAdministrativeHierarchy` et `computeDualAddressing` : distinction déterministe entre Concession Mère (code niveau concession), Bâtiment Enfant (code avec lettre enfant rattachée à la concession) et Bâtiment Direct Autonome.
- **[Enregistrement]** Intégration dans `CourtyardManager.tsx` (Mère + Enfants lors de la finalisation du tracé).
- **[Enregistrement]** Intégration dans `src/App.tsx` (`handleCreateBuilding`) : injection garantie du double adressage pour tout bâtiment enregistré et payload API documenté.
- **[Supabase Backfill]** Exécution du rétro-enrichissement : 34 bâtiments synchronisés dans Supabase avec leurs vraies communes et leurs vrais quartiers d'État (Keïtayah, Camayenne, Cameroun, Coleah Domino, Coleah Centre, Koloma 2).
- **[Interface Registre]** Refonte et enrichissement de `BuildingsView.tsx` :
  - Bouton direct "Sync Adressage État" (Backfill) avec notification toast en temps réel.
  - Calcul dynamique de l'emprise au sol (m²) et du périmètre avec Turf.js.
  - Fil d'Ariane hiérarchique officiel (Guinée › Région › Préfecture › Commune › Quartier › Concession).
  - Téléchargement individuel de fiche cadastrale d'attestation (JSON).
  - Mode Tableur pro Supabase-like, Mode Arborescent Mère-Enfant pliable/dépliable, Mode Fiches cartouches.
- **[Validation Cadastrale - Étape 2]** Mise à niveau de l'Atelier de Modération (`ValidationsView.tsx`) :
  - Intégration du double adressage sur l'ensemble des dossiers en attente et contestés.
  - Moteur de recherche instantanée multi-critères (codes métriques/administratifs, commune, quartier, litige).
  - Filtre dynamique par juridiction communale.
  - Bouton d'exportation directe de l'Attestation Provisoire de Numérotation et d'Agrément Cadastral (JSON officiel de la République de Guinée).
- **[Panneau Cadastral Carte 3D - Étape 2]** Refonte du panneau latéral (`BuildingPanel.tsx`) :
  - Cartouche de double adressage avec boutons de copie rapide.
  - Fil d'Ariane officiel et adresse textuelle complète d'État.
  - Identification de la structure (Concession Mère, Bâtiment Enfant rattaché, Bâtiment Direct Autonome).
  - Téléchargement immédiat de l'attestation officielle.
- **[Recherche Cartographique Augmentée - Étape 2]** Enrichissement de `src/App.tsx` :
  - Filtre de recherche universel supportant conjointement codes de grille métrique (`GN-Z...`), codes d'État (`GN.CKY...`), toponymes et quartiers.
  - Suggestions déroulantes avec affichage visuel du double code et de la commune.
- **[Assurance Qualité & Build]** Validation TypeScript intégrale (`tsc --noEmit` sans aucune erreur) et build de production Vite validé (`Build succeeded`).
