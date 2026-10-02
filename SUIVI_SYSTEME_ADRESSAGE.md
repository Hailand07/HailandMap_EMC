# PLAN DE TRAVAIL & SUIVI D'EXÉCUTION
## Système d'Adressage Hybride & Refonte du Registre Cadastral National

**Date d'initialisation :** 2026-09-25  
**Auteur :** Moteur IA Studio Build / HailandMap Engineering  
**Statut Global :** 🟡 En cours de déploiement structuré  

---

### 1. Vision & Architecture du Système d'Adressage Combiné

L'application repose désormais sur un **double système d'adressage hybride et synergique** :

| Dimension | Système 1 : Adressage Géométrique Matriciel (Grilles 200m) | Système 2 : Adressage Hiérarchique Administratif |
| :--- | :--- | :--- |
| **Fondement** | Maillage territorial par pavés carrés de 200m × 200m | Découpage officiel vectoriel de l'État guinéen (OCHA / HDX / OpenStreetMap) |
| **Structure** | Pays (`GN`) ➔ Zone/Grille (`Z014`) ➔ Concession/Cour (`CR001`) ➔ Bâtiment (`R01`/`M01`) ➔ Niveau (`E1`) ➔ Porte (`101`) | Pays (`GN`) ➔ Région (`Conakry`) ➔ Ville/Préfecture (`Conakry`) ➔ Commune (`Ratoma`) ➔ Quartier (`Kipé`) ➔ Lot/Concession (`L042`) |
| **Identifiant Type** | `GN-Z014-CR001-RA-E1-101` | `GN.CKY.RTM.KIP-C001-B01` |
| **Usage Opérationnel** | Navigation fine GPS, livreurs du dernier mètre, repérage métrique immédiat dans les ruelles | Identification citoyenne officielle, cadastre d'État, impôts, gouvernance foncière, courriers officiels |
| **Combinaison** | **Adresse Nationale Unifiée** : `[Code Grille Matriciel] · [Libellé & Code Administratif Normalisé]` |

---

### 2. Plan d'Action par Étapes (Phasage & Jalons)

#### 📍 Étape 1 : Moteur Géospatial d'Adressage Administratif (`administrativeAddressingService.ts`)
- [ ] Créer le résolveur spatial universel point-dans-polygone (`resolveAdministrativeHierarchy(centroid)`) :
  - Détection automatique : Région (`reg-conakry`...) ➔ Préfecture (`pref-conakry`...) ➔ Commune (`Ratoma`...) ➔ Quartier (`Kipé`...).
  - Génération du Code d'Adressage Administratif normalisé (`GN.REG.PREF.COM.QTR-NUM`).
  - Génération de l'Adresse Textuelle Normalisée complète (*ex: "Concession N°42, Quartier Kipé, Commune de Ratoma, Ville de Conakry, République de Guinée"*).
- [ ] Tests unitaires et validation spatiale sur Conakry et l'intérieur du pays.

#### 📍 Étape 2 : Intégration dans les Formulaires d'Enregistrement & Supabase
- [ ] Mettre à jour `DirectBuildingForm.tsx` (enregistrement direct d'un bâtiment individuel).
- [ ] Mettre à jour `ChildBuildingForm.tsx` et `InteractiveBuildingForm.tsx` (concessions mères et bâtiments enfants).
- [ ] Adapter `prepareBuildingPayloadForSupabase` et `saveCourtyardWithBuildings` dans `src/lib/supabase.ts` pour enregistrer systématiquement :
  - `hailand_code` (Système Grille)
  - `commune`, `commune_id`, `quartier`, `quartier_id`
  - Métadonnées d'adresse administrative complète (`admin_address_code`, `formatted_address`).
- [ ] Script de rétro-enrichissement (`backfillAdministrativeAddresses`) pour recalculer et synchroniser immédiatement l'ensemble des concessions déjà stockées dans Supabase.

#### 📍 Étape 3 : Refonte Complète de l'Interface "Registre National d'Adressage Numérique" (`BuildingsView.tsx`)
- [ ] Conception d'une interface de gestion et de visualisation de niveau professionnel ("Data Studio / Supabase-like") :
  - **Barre supérieure de synthèse & métriques** (Total indexé, Répartition par Commune, Concessions Mères vs Bâtiments Enfants, Statut d'audit).
  - **Filtres à facettes interactifs** :
    - Filtrage dynamique par Région, Commune, Quartier, Typologie (R, C, M, A, H, P), Présence de cour.
    - Recherche plein-texte multi-critères (Code matriciel, Code administratif, Adresse textuelle, Quartier, Repère, Agent).
  - **Modes de visualisation commutables** :
    1. **Vue Tableur Flexible (Grid/Table)** : Colonnes triables, double adressage côte-à-côte, badges de statut, indicateurs de validation.
    2. **Vue Hiérarchique Arbre (Concessions Mères ➔ Bâtiments Enfants)** : Arborescence dépliable illustrant parfaitement la logique mère-enfant.
    3. **Vue Fiches Cadastrales** : Cartes visuelles avec mini-plan d'accès et repères.
  - **Tiroir / Modal d'Inspection Exhaustif** pour chaque concession :
    - Fiche technique cadastrale complète : Double code d'adresse, Coordonnées GPS, Altitude, Toitures, Superficie.
    - Composantes d'accès : Point d'entrée GPS, Note portail, Couleur porte, Interphone, Repère et directions internes.
    - Gouvernance & Traçabilité : Agent de collecte, Date de soumission, Validateur, Historique des modifications.
  - **Exportation des données** (CSV, JSON, GeoJSON) pour l'administration et les audits cadastraux.

#### 📍 Étape 4 : Tests Finaux, Compilation et Validation Utilisateur
- [ ] Validation de la compilation (`compile_applet`) et absence d'erreurs TypeScript (`lint_applet`).
- [ ] Vérification en conditions réelles sur la carte et dans le registre.
- [ ] Validation du bon affichage et de la fluidité des interactions.

---

### 3. Journal des Exécutions & Validation des Jalons
- **2026-09-25 20:30** : Initialisation du plan de travail et validation des spécifications du double adressage.
