/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mapboxgl from 'mapbox-gl';
import {
  setupInteractiveTerritoryLayers,
  applyTerritoriesHighlight,
  } from '../../lib/interactiveMapEngine';
import { generate200mGridGeoJSON,  } from '../../map/grid';
import { applyHiddenBuildingsFilter, syncCustom3DBuildingsLayer, watchRegisteredClip } from '../../map/layers';

/** Gestionnaire extrait d'App.tsx : `ctx` regroupe l'état et les références du composant au moment de l'initialisation de la carte. */
export function handleMapLoad(ctx: Record<string, any>) {
  const { clickedCoordsRef, currentStyle, custom3DBuildingsRef, detectedOsmFeaturesRef, hiddenBuildingsListRef, is200mGridActive, map, markerRef, selectedBuildingRef, selectedTerritoriesRef, selectionTargetNatureRef } = ctx;
        // Logique 3D et stylisation haute fidélité si Standard ou Custom
        const layers = map.getStyle()?.layers;
        if (layers) {
          // Si on utilise Streets, on ajoute une couche 3D des bâtiments si elle n'existe pas (sauf pour le style satellite)
          const has3D = layers.some(l => l.id === '3d-buildings');
          // Style « Standard » (fond importé) : ses bâtiments 3D ne se filtrent pas. On les éteint et on les remplace par une couche
          // Hailand équivalente (mêmes tuiles OSM), que le masquage sous les bâtiments enregistrés peut filtrer.
          const isImportedBasemap = Array.isArray((map.getStyle() as any)?.imports) && (map.getStyle() as any).imports.some((i: any) => i.id === 'basemap');
          let osmSource: string | null = map.getSource('composite') ? 'composite' : null;
          if (!osmSource) {
            try {
              if (!map.getSource('hx-osm')) map.addSource('hx-osm', { type: 'vector', url: 'mapbox://mapbox.mapbox-streets-v8' });
              osmSource = 'hx-osm';
            } catch (e) {
              osmSource = null;
            }
          }
          if (isImportedBasemap && currentStyle !== 'satellite') {
            try {
              map.setConfigProperty('basemap', 'show3dBuildings', false);
            } catch (e) {}
          }
          if (currentStyle !== 'satellite' && !has3D && osmSource) {
            map.addLayer(
              {
                'id': '3d-buildings',
                'source': osmSource,
                ...(isImportedBasemap ? { slot: 'middle' } : {}),
                'source-layer': 'building',
                'filter': ['==', ['get', 'extrude'], 'true'],
                'type': 'fill-extrusion',
                'minzoom': 14,
                'paint': {
                  'fill-extrusion-color': (isImportedBasemap && (map.getConfigProperty('basemap', 'colorBuildings') as string)) || '#f0eee9',
                  // Utilise une transition fluide pour l'extrusion 3D
                  'fill-extrusion-height': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    14,
                    0,
                    14.05,
                    ['get', 'height']
                  ],
                  'fill-extrusion-base': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    14,
                    0,
                    14.05,
                    ['get', 'min_height']
                  ],
                  'fill-extrusion-opacity': 1.0,
                  'fill-extrusion-vertical-gradient': true
                }
              },
              // Insérer sous les labels de rue si possible
              layers.find(l => l.type === 'symbol' && l.layout?.['text-field'])?.id
            );
          } else if (currentStyle === 'satellite' && osmSource && !layers.some(l => l.id === '3d-buildings-invisible')) {
            // Pour la vue satellite, on ajoute une couche de bâtiments invisible au sol (fill)
            // afin que queryRenderedFeatures puisse l'interroger et de cette manière détecter mathématiquement les contours
            // pré-existants exactement au même endroit que sous la vue 3D !
            map.addLayer(
              {
                'id': '3d-buildings-invisible',
                'source': osmSource,
                'source-layer': 'building',
                'type': 'fill',
                'minzoom': 13,
                'paint': {
                  'fill-color': '#000000',
                  'fill-opacity': 0.001 // Complètement invisible à l'œil pour préserver l'esthétique satellite pure, mais interrogeable géospatialement !
                }
              },
              layers.find(l => l.type === 'symbol' && l.layout?.['text-field'])?.id
            );
          }
        }

        // Ajouter la source et la couche de la grille de 200m pour la vue satellite
        map.addSource('grid-200m', {
          type: 'geojson',
          data: generate200mGridGeoJSON()
        });

        // Couche de casing sombre pour la grille (halo de contraste de ligne)
        map.addLayer({
          id: 'grid-200m-line-casing',
          type: 'line',
          source: 'grid-200m',
          layout: {
            visibility: (currentStyle === 'satellite' && is200mGridActive) ? 'visible' : 'none'
          },
          paint: {
            'line-color': '#000000', // Noir de contraste
            'line-width': 2.5,
            'line-opacity': 0.65
          }
        });

        // Couche de lignes pour la grille (cyan phosphorescente)
        map.addLayer({
          id: 'grid-200m-line',
          type: 'line',
          source: 'grid-200m',
          layout: {
            visibility: (currentStyle === 'satellite' && is200mGridActive) ? 'visible' : 'none'
          },
          paint: {
            'line-color': '#06b6d4', // Cyan technologique et élégant
            'line-width': 1.2,
            'line-opacity': 0.85
          }
        });

        // Couche de labels pour afficher l'identifiant de chaque case de 200m
        map.addLayer({
          id: 'grid-200m-label',
          type: 'symbol',
          source: 'grid-200m',
          layout: {
            visibility: (currentStyle === 'satellite' && is200mGridActive) ? 'visible' : 'none',
            'text-field': ['get', 'id'],
            'text-size': 9,
            'text-offset': [0, 0],
            'text-allow-overlap': false
          },
          paint: {
            'text-color': '#06b6d4',
            'text-opacity': 0.6,
            'text-halo-color': '#0f172a',
            'text-halo-width': 1.5
          }
        });

        // Ajouter une source vide pour l'itinéraire
        map.addSource('route', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });

        // Ajouter la couche pour le tracé de la route en bleu
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#2563eb', // Bleu d'itinéraire éclatant
            'line-width': 6,
            'line-opacity': 0.85
          }
        });

        // Ajouter une couche de pulsation sous la ligne d'itinéraire
        map.addLayer({
          id: 'route-line-glow',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#60a5fa',
            'line-width': 12,
            'line-opacity': 0.35,
            'line-blur': 4
          }
        }, 'route-line');

        // Ajouter la source pour la zone / polygone de bâtiment sélectionné
        map.addSource('selected-building', {
          type: 'geojson',
          data: {
            type: 'Feature' as const,
            properties: {},
            geometry: {
              type: 'GeometryCollection' as const,
              geometries: []
            }
          }
        });

        const building3DBeforeId = map.getLayer('3d-buildings') ? '3d-buildings' : undefined;

        // Couche de remplissage au sol :
        // Pour les cours/concessions : AUCUNE COULEUR DE FOND (opacité 0) pour visibilité satellite totale
        // Pour les bâtiments uniques : remplissage orange translucide (opacité 0.35)
        map.addLayer({
          id: 'selected-building-fill',
          type: 'fill',
          source: 'selected-building',
          paint: {
            'fill-color': '#f97316',
            'fill-opacity': [
              'case',
              ['boolean', ['get', 'is_courtyard'], false],
              0,
              0.35
            ]
          }
        }, building3DBeforeId);

        // Ombre/casing de contraste sous la délimitation en pointillés de la cour
        map.addLayer({
          id: 'selected-courtyard-outline-casing',
          type: 'line',
          source: 'selected-building',
          filter: ['==', ['get', 'is_courtyard'], true],
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#0f172a',
            'line-width': 4.5,
            'line-opacity': 0.75,
            'line-dasharray': [3, 2]
          }
        }, building3DBeforeId);

        // Délimitation en pointillés orange pour les cours / concessions
        map.addLayer({
          id: 'selected-courtyard-outline',
          type: 'line',
          source: 'selected-building',
          filter: ['==', ['get', 'is_courtyard'], true],
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#f97316',
            'line-width': 2.8,
            'line-dasharray': [3, 2]
          }
        }, building3DBeforeId);

        // Contour orange vif continu uniquement pour les bâtiments uniques
        map.addLayer({
          id: 'selected-building-outline',
          type: 'line',
          source: 'selected-building',
          filter: ['!=', ['get', 'is_courtyard'], true],
          paint: {
            'line-color': '#f97316',
            'line-width': 3
          }
        }, building3DBeforeId);

        // Ajouter la source pour la zone de survol/pré-sélection de bâtiment
        map.addSource('hovered-building', {
          type: 'geojson',
          data: {
            type: 'Feature' as const,
            properties: {},
            geometry: {
              type: 'GeometryCollection' as const,
              geometries: []
            }
          }
        });

        // Ajouter la couche de remplissage du survol (placée sous les bâtiments 3D)
        map.addLayer({
          id: 'hovered-building-fill',
          type: 'fill',
          source: 'hovered-building',
          paint: {
            'fill-color': '#fdba74',
            'fill-opacity': 0.45
          }
        }, building3DBeforeId);

        // Ajouter la couche de contour du survol (placée sous les bâtiments 3D)
        map.addLayer({
          id: 'hovered-building-outline',
          type: 'line',
          source: 'hovered-building',
          paint: {
            'line-color': '#fb923c',
            'line-width': 2.5
          }
        }, building3DBeforeId);

        // Ajouter la source pour l'atelier de dessin manuel de polygone
        map.addSource('draw-source', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection' as const,
            features: []
          }
        });

        // 1. Remplissage de la zone dessinée en cours de tracé (effet élastique translucide OSM iD areas.js)
        map.addLayer({
          id: 'draw-fill',
          type: 'fill',
          source: 'draw-source',
          paint: {
            'fill-color': '#ffffff',
            'fill-opacity': 0.24
          }
        }, building3DBeforeId);

        // 2. Ligne de contour ultra-fine et discrète (style OpenStreetMap iD editor lines.js - casing)
        map.addLayer({
          id: 'draw-line-casing',
          type: 'line',
          source: 'draw-source',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#000000',
            'line-width': 2.2,
            'line-opacity': 0.18
          }
        });

        // 3. Ligne blanche fine continue (1.2px, élégante et pixel-perfect comme sur OSM iD lines.js - stroke)
        map.addLayer({
          id: 'draw-line',
          type: 'line',
          source: 'draw-source',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#ffffff',
            'line-width': 1.2,
            'line-opacity': 1.0
          }
        });

        // 4. Ombre douce diffuse des sommets (correspondant exactement à <circle class="shadow"> de vertices.js OSM iD)
        map.addLayer({
          id: 'draw-points-shadow',
          type: 'circle',
          source: 'draw-source',
          filter: ['==', '$type', 'Point'],
          paint: {
            'circle-radius': [
              'case',
              ['boolean', ['get', 'isClosingTarget'], false],
              7.0,
              5.5
            ],
            'circle-color': '#000000',
            'circle-opacity': 0.22,
            'circle-blur': 0.8
          }
        });

        // 5. Sommet blanc pur net (correspondant exactement à <circle class="stroke"> de vertices.js OSM iD)
        map.addLayer({
          id: 'draw-points',
          type: 'circle',
          source: 'draw-source',
          filter: ['==', '$type', 'Point'],
          paint: {
            'circle-radius': [
              'case',
              ['boolean', ['get', 'isClosingTarget'], false],
              4.2,
              2.8
            ],
            'circle-color': '#ffffff',
            'circle-stroke-color': [
              'case',
              ['boolean', ['get', 'isClosingTarget'], false],
              '#38bdf8',
              'rgba(0, 0, 0, 0.20)'
            ],
            'circle-stroke-width': [
              'case',
              ['boolean', ['get', 'isClosingTarget'], false],
              1.5,
              0.5
            ],
            'circle-opacity': 1.0
          }
        });

        // Source et couches dédiées pour l'enceinte mère de la cour (DASHED OUTLINE, SANS FOND ORANGE)
        // Reste affichée avec ses pointillés pendant TOUT le processus jusqu'à la validation
        map.addSource('courtyard-mother-perimeter', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });

        // Fond transparent (aucune couleur de fond orange)
        map.addLayer({
          id: 'courtyard-mother-fill',
          type: 'fill',
          source: 'courtyard-mother-perimeter',
          paint: {
            'fill-opacity': 0
          }
        }, building3DBeforeId);

        // Ligne de contour pointillée sombre (casing pour visibilité satellite parfaite)
        map.addLayer({
          id: 'courtyard-mother-outline-casing',
          type: 'line',
          source: 'courtyard-mother-perimeter',
          paint: {
            'line-color': '#020617',
            'line-width': 4.5,
            'line-dasharray': [3, 2]
          }
        }, building3DBeforeId);

        // Ligne de contour pointillée orange haute visibilité
        map.addLayer({
          id: 'courtyard-mother-outline',
          type: 'line',
          source: 'courtyard-mother-perimeter',
          paint: {
            'line-color': '#f97316',
            'line-width': 2.8,
            'line-dasharray': [3, 2]
          }
        }, building3DBeforeId);

        // Source pour les bâtiments enfants de la cour
        map.addSource('courtyard-children', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });

        // Remplissage BLEU pour les bâtiments à l'intérieur de la cour (comme avant)
        map.addLayer({
          id: 'courtyard-children-fill',
          type: 'fill',
          source: 'courtyard-children',
          paint: {
            'fill-color': '#2563eb',
            'fill-opacity': 0.5
          }
        }, building3DBeforeId);

        // Contour BLEU continu pour les bâtiments à l'intérieur de la cour (comme avant)
        map.addLayer({
          id: 'courtyard-children-outline',
          type: 'line',
          source: 'courtyard-children',
          paint: {
            'line-color': '#60a5fa',
            'line-width': 2.5
          }
        }, building3DBeforeId);

        // Source pour le bâtiment enfant actif en cours d'édition ou de tracé
        map.addSource('courtyard-active-child', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });

        // Remplissage azur pour l'enfant actif en cours de tracé
        map.addLayer({
          id: 'courtyard-active-child-fill',
          type: 'fill',
          source: 'courtyard-active-child',
          paint: {
            'fill-color': '#0284c7',
            'fill-opacity': 0.6
          }
        }, building3DBeforeId);

        // Contour azur vif pour l'enfant actif en cours de tracé
        map.addLayer({
          id: 'courtyard-active-child-outline',
          type: 'line',
          source: 'courtyard-active-child',
          paint: {
            'line-color': '#38bdf8',
            'line-width': 3.2
          }
        }, building3DBeforeId);

        // Source et couches de surbrillance pour les bâtiments OSM détectés dans la zone/cour
        map.addSource('osm-detected-in-zone', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });

        map.addLayer({
          id: 'osm-detected-in-zone-fill',
          type: 'fill',
          source: 'osm-detected-in-zone',
          layout: {
            visibility: currentStyle === 'satellite' ? 'none' : 'visible'
          },
          paint: {
            'fill-color': '#f59e0b', // Jaune/ambre chaud
            'fill-opacity': 0.65
          }
        }, building3DBeforeId);

        map.addLayer({
          id: 'osm-detected-in-zone-outline',
          type: 'line',
          source: 'osm-detected-in-zone',
          layout: {
            visibility: currentStyle === 'satellite' ? 'none' : 'visible'
          },
          paint: {
            'line-color': '#fde047',
            'line-width': 3,
            'line-dasharray': [2, 1]
          }
        }, building3DBeforeId);

        // Restaurer les bâtiments OSM détectés dans la zone s'ils existent
        if (detectedOsmFeaturesRef.current && detectedOsmFeaturesRef.current.length > 0) {
          const detectedSource = map.getSource('osm-detected-in-zone') as mapboxgl.GeoJSONSource;
          if (detectedSource) {
            detectedSource.setData({
              type: 'FeatureCollection',
              features: detectedOsmFeaturesRef.current
            });
          }
        }

        // Restaurer la sélection de polygone active et son marqueur orange en cas de recréation de la carte
        if (clickedCoordsRef.current && clickedCoordsRef.current.geometry) {
          const isCourtyard = selectionTargetNatureRef.current === 'courtyard' || Boolean(selectedBuildingRef.current?.has_courtyard);
          const selectionSource = map.getSource('selected-building') as mapboxgl.GeoJSONSource;
          if (selectionSource) {
            selectionSource.setData({
              type: 'Feature',
              properties: {
                is_courtyard: isCourtyard
              },
              geometry: clickedCoordsRef.current.geometry
            });
          }

          if (!isCourtyard) {
            // Déplacer/Créer le marqueur de maison orange au bon endroit uniquement pour les bâtiments uniques
            const el = document.createElement('div');
            el.className = 'custom-house-marker';
            el.innerHTML = `
              <div class="flex items-center justify-center w-10 h-10 bg-orange-500 rounded-full border-2 border-slate-900 shadow-xl shadow-orange-500/30 transform transition-transform duration-200 hover:scale-110 cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-5 h-5 text-slate-950">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                  <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
              </div>
              <div class="w-2.5 h-2.5 bg-orange-500 border border-slate-900 rounded-full mx-auto -mt-1 shadow-md animate-ping"></div>
            `;

            const clng = clickedCoordsRef.current.longitude;
            const clat = clickedCoordsRef.current.latitude;
            if (typeof clng === 'number' && typeof clat === 'number' && !isNaN(clng) && !isNaN(clat)) {
              const marker = new mapboxgl.Marker({ element: el })
                .setLngLat([clng, clat])
                .addTo(map);
              markerRef.current = marker;
            }
          }
        }

        // Source pour le masquage volumétrique 3D (sans plan 2D opaque pour éviter toute superposition au sol)
        if (!map.getSource('hidden-polygons-mask')) {
          map.addSource('hidden-polygons-mask', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: []
            }
          });

          // Couche de découpe volumétrique 3D (clip layer pour Mapbox Standard / modèles 3D)
          try {
            map.addLayer({
              id: 'hidden-polygons-clip-3d',
              type: 'clip',
              source: 'hidden-polygons-mask',
              layout: {
                'clip-layer-types': ['symbol', 'model']
              }
            });
          } catch (clipErr) {
            // Ignoré si le style ne supporte pas le type clip
          }

          // La couche « clip » retire les remplissages mais pas le liseré de l'empreinte du fond : on le recouvre de la couleur du sol
          // (réglage `colorLand` du fond Standard, qui suit l'éclairage jour/nuit comme le reste de la carte).
          try {
            const land = map.getConfigProperty('basemap', 'colorLand') as string | undefined;
            if (land && currentStyle !== 'satellite' && !map.getLayer('hidden-polygons-outline-cover')) {
              map.addLayer({
                id: 'hidden-polygons-outline-cover',
                type: 'line',
                source: 'hidden-polygons-mask',
                slot: 'middle',
                layout: { 'line-join': 'round' },
                paint: { 'line-color': land, 'line-width': 2.5, 'line-opacity': 1 },
              } as any);
            }
          } catch (coverErr) {
            // Style sans fond importé : pas de liseré à recouvrir
          }
        }

        // Découpe des empreintes OSM sous les bâtiments enregistrés (aucune trace au sol)
        watchRegisteredClip(map);

        // Charger les bâtiments 3D personnalisés tracés manuellement (fill-extrusion)
        syncCustom3DBuildingsLayer(map, custom3DBuildingsRef.current);

        // Appliquer les filtres de bâtiments/polygones masqués
        applyHiddenBuildingsFilter(map, hiddenBuildingsListRef.current);

        // Initialiser les couches de découpage territorial interactif de Guinée
        setupInteractiveTerritoryLayers(map);
        if (selectedTerritoriesRef.current.length > 0) {
          applyTerritoriesHighlight(map, selectedTerritoriesRef.current);
        }

        // Log de démarrage
      }
