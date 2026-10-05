/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Building, HiddenBuildingData } from '../../types';
import mapboxgl from 'mapbox-gl';
import { actorId } from '../../lib/actor';
import type { BuildingType } from '../../types';
import { sanitizeGeometry, safeCalculateArea } from '../../utils/safeJson';
import * as turf from '@turf/turf';
import { calculateDistance, generateSquarePolygon } from '../../map/geometry';
import { generate200mGridGeoJSON,  } from '../../map/grid';

/** Gestionnaire extrait d'App.tsx : `ctx` regroupe l'état et les références du composant au moment de l'initialisation de la carte. */
export function handleMapClick(e: any, ctx: Record<string, any>) {
  const { buildings, buildingsRef, childDrawCompleteHandlerRef, childMapClickHandlerRef, clickSelectionTargetRef, currentStyle, custom3DBuildingsRef, detectOsmBuildingsInZone, drawPointsRef, entrancePickerConfigRef, handleFinalizeCustomDrawRef, is200mGridActiveRef, isDrawModeRef, isSelectionModeRef, map, markerRef, previewEntranceMarkerRef, selectionTargetNatureRef, setClickedCoords, setDrawPoints, setIsGridPanelOpen, setMapNotification, setSelected3DBuilding, setSelectedBuilding, setSelectedGridBuildings, setSelectedGridCell, setSelectedPolygonHideAction, snappedCoordsRef } = ctx;
        const { lng, lat } = e.lngLat;

        // MODE SÉLECTION D'ENTRÉE / PORTAIL DE COUR (AVEC AIMANTATION STRICTE AU MUR) :
        if (entrancePickerConfigRef.current && entrancePickerConfigRef.current.active) {
          const picker = entrancePickerConfigRef.current;
          let chosenPoint: { lng: number; lat: number } | null = null;

          if (picker.type === 'courtyard' && picker.wallGeometry) {
            try {
              const wallLine = turf.polygonToLine(picker.wallGeometry);
              const clickPt = turf.point([lng, lat]);
              const nearest = turf.nearestPointOnLine(wallLine as any, clickPt);
              chosenPoint = {
                lng: Number(nearest.geometry.coordinates[0].toFixed(6)),
                lat: Number(nearest.geometry.coordinates[1].toFixed(6))
              };
            } catch (err) {
              console.warn("Erreur projection clic sur mur de cour:", err);
              chosenPoint = snappedCoordsRef.current || { lng: Number(lng.toFixed(6)), lat: Number(lat.toFixed(6)) };
            }
          } else {
            chosenPoint = { lng: Number(lng.toFixed(6)), lat: Number(lat.toFixed(6)) };
          }

          if (chosenPoint) {
            picker.onPicked(chosenPoint);
          }

          // Libérer le curseur et le mode
          entrancePickerConfigRef.current = null;
          snappedCoordsRef.current = null;
          if (previewEntranceMarkerRef.current) {
            previewEntranceMarkerRef.current.remove();
            previewEntranceMarkerRef.current = null;
          }
          map.getCanvas().style.cursor = '';
          return;
        }

        // MODE DESSIN MANUEL ACTIVÉ (Prioritaire pour éviter tout blocage par isSelectionMode) :
        if (isDrawModeRef.current) {
          const currentPts = drawPointsRef.current;
          if (currentPts.length >= 3) {
            try {
              const p0Screen = map.project(currentPts[0]);
              const distPx = Math.hypot(p0Screen.x - e.point.x, p0Screen.y - e.point.y);
              if (distPx < 20) {
                if (childDrawCompleteHandlerRef.current) {
                  childDrawCompleteHandlerRef.current(currentPts);
                  return;
                }
                handleFinalizeCustomDrawRef.current?.();
                return;
              }
            } catch (err) {}
          }
          setDrawPoints(prev => {
            const next = [...prev, [lng, lat]];
            return next;
          });
          return;
        }

        // Lire la valeur temps réel de la ref pour éviter le stale closure pattern
        const isSelMode = isSelectionModeRef.current;
        if (!isSelMode) {
          return;
        }

        // SI TRACÉ DE BÂTIMENT ENFANT ACTIF EN MODE CLIC INTELLIGENT :
        if (childMapClickHandlerRef.current) {
          let detectedGeom: any = null;
          let detectedArea: number = 80;

          try {
            const clickBox: [mapboxgl.PointLike, mapboxgl.PointLike] = [
              [e.point.x - 8, e.point.y - 8],
              [e.point.x + 8, e.point.y + 8]
            ];
            const features = map.queryRenderedFeatures(clickBox);
            const buildingFeature = features.find(f => {
              const layerId = f.layer?.id || '';
              return (
                !layerId.includes('selected-building') &&
                !layerId.includes('courtyard') &&
                !layerId.includes('grid-200m') &&
                f.geometry &&
                (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
              );
            });

            if (buildingFeature && buildingFeature.geometry) {
              detectedGeom = sanitizeGeometry(buildingFeature.geometry);
              detectedArea = safeCalculateArea(detectedGeom, 80);
            }
          } catch (err) {}

          if (!detectedGeom) {
            detectedGeom = sanitizeGeometry(generateSquarePolygon(lng, lat, 4.5));
            detectedArea = safeCalculateArea(detectedGeom, 80);
          }

          // Mettre à jour la couche d'enfant actif en direct
          try {
            const actSrc = map.getSource('courtyard-active-child') as mapboxgl.GeoJSONSource;
            if (actSrc) {
              actSrc.setData({
                type: 'FeatureCollection',
                features: [{
                  type: 'Feature',
                  properties: { active: true },
                  geometry: detectedGeom
                }]
              });
            }
          } catch (err) {}

          childMapClickHandlerRef.current(lng, lat, detectedGeom, detectedArea);

          return;
        }
        
        // MODE SÉLECTION STANDARD :
        // SI LA GRILLE 200M EST ACTIVE EN SATELLITE ET LE MODE DE CIBLAGE EST "GRID_CELL", ON SÉLECTIONNE TOUT LE CARREAU ET SES POLYGONES EN MÊME TEMPS
        if (is200mGridActiveRef.current && currentStyle === 'satellite' && clickSelectionTargetRef.current === 'grid_cell') {
          const gridGeoJSON = generate200mGridGeoJSON({
            minLng: lng - 0.01,
            maxLng: lng + 0.01,
            minLat: lat - 0.01,
            maxLat: lat + 0.01
          });
          const clickedPoint = turf.point([lng, lat]);
          const clickedCell = gridGeoJSON.features.find((f: any) => turf.booleanPointInPolygon(clickedPoint, f));

          if (clickedCell) {
            const cellId = clickedCell.properties.id;
            
            // Trouver tous les bâtiments existants dans ce carreau (via la ref fraîche)
            const buildingsInCell = buildingsRef.current.filter((b: Building) => {
              if (b.zone_code === cellId) return true;
              if (b.centroid && Array.isArray(b.centroid.coordinates) && b.centroid.coordinates.length >= 2) {
                try {
                  const pt = turf.point([b.centroid.coordinates[0], b.centroid.coordinates[1]]);
                  return turf.booleanPointInPolygon(pt, clickedCell);
                } catch {
                  return false;
                }
              }
              return false;
            });

            // Récupérer toutes les géométries de bâtiments à surligner
            const allGeometries: any[] = [clickedCell.geometry]; // Inclure la bordure du carreau

            buildingsInCell.forEach((b: Building) => {
              if (b.geom) {
                allGeometries.push(b.geom);
              }
            });

            // Interroger Mapbox pour de nouveaux polygones de toiture non enregistrés
            try {
              const bounds = new mapboxgl.LngLatBounds();
              clickedCell.geometry.coordinates[0].forEach((coord: [number, number]) => {
                bounds.extend(coord);
              });
              const swScreen = map.project(bounds.getSouthWest());
              const neScreen = map.project(bounds.getNorthEast());
              
              const minX = Math.min(swScreen.x, neScreen.x);
              const maxX = Math.max(swScreen.x, neScreen.x);
              const minY = Math.min(swScreen.y, neScreen.y);
              const maxY = Math.max(swScreen.y, neScreen.y);

              const clickBox: [mapboxgl.PointLike, mapboxgl.PointLike] = [
                [minX, minY],
                [maxX, maxY]
              ];
              
              const allFeatures = map.queryRenderedFeatures(clickBox);
              const mapboxBuildings = allFeatures.filter(f => {
                const layerId = f.layer?.id || '';
                return (
                  layerId !== 'selected-building-fill' &&
                  layerId !== 'selected-building-outline' &&
                  layerId !== 'selected-courtyard-outline' &&
                  layerId !== 'selected-courtyard-outline-casing' &&
                  layerId !== 'selected-building-3d' &&
                  layerId !== 'hovered-building-fill' &&
                  layerId !== 'hovered-building-outline' &&
                  layerId !== 'hovered-building-3d' &&
                  layerId !== 'grid-200m-line' &&
                  layerId !== 'grid-200m-line-casing' &&
                  layerId !== 'grid-200m-label' &&
                  f.geometry &&
                  (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
                );
              });

              mapboxBuildings.forEach(f => {
                if (f.geometry) {
                  try {
                    let isInside = false;
                    if (f.geometry.type === 'Polygon') {
                      const firstCoord = f.geometry.coordinates[0][0];
                      if (firstCoord) {
                        isInside = turf.booleanPointInPolygon(turf.point(firstCoord), clickedCell);
                      }
                    } else if (f.geometry.type === 'MultiPolygon') {
                      const firstCoord = f.geometry.coordinates[0][0][0];
                      if (firstCoord) {
                        isInside = turf.booleanPointInPolygon(turf.point(firstCoord), clickedCell);
                      }
                    }
                    
                    if (isInside) {
                      allGeometries.push(f.geometry);
                    }
                  } catch (err) {}
                }
              });
            } catch (err) {
              console.warn("Failed to query Mapbox features for grid cell:", err);
            }

            // Mettre à jour l'état de l'Atelier
            setSelectedGridCell(clickedCell);
            setSelectedGridBuildings(buildingsInCell);
            setIsGridPanelOpen(false);
            setSelectedBuilding(null); 
            setClickedCoords(null); 

            // Mettre à jour la source d'affichage orange de Mapbox avec tous ces polygones d'un coup !
            const selectionSource = map.getSource('selected-building') as mapboxgl.GeoJSONSource;
            if (selectionSource) {
              selectionSource.setData({
                type: 'FeatureCollection',
                features: allGeometries.map((geom, index) => ({
                  type: 'Feature',
                  properties: { id: index },
                  geometry: geom
                }))
              });
            }

            // Ajouter/Déplacer le marqueur orange sur le centre de la case 200m
            const cellCentroid = turf.centroid(clickedCell);
            const [cellLng, cellLat] = cellCentroid.geometry.coordinates;

            if (markerRef.current) {
              markerRef.current.setLngLat([cellLng, cellLat]);
            } else {
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
              const marker = new mapboxgl.Marker({ element: el })
                .setLngLat([cellLng, cellLat])
                .addTo(map);
              markerRef.current = marker;
            }

            // Zoomer légèrement et centrer de manière fluide
            try {
              map.easeTo({
                center: [cellLng, cellLat],
                zoom: 17,
                duration: 500
              });
            } catch (e) {
              console.warn("easeTo failed:", e);
            }

            // Notification pour l'utilisateur
            setMapNotification({
              type: 'success',
              title: `Carreau ${cellId} Sélectionné`,
              message: `Sélection simultanée de tous les polygones (${buildingsInCell.length} enregistrés, ${allGeometries.length - buildingsInCell.length - 1} détectés) à l'intérieur du carreau de 200m.`
            });

            // Logger l'événement pour notre console

            return;
          }
        }

        // ===== INTERCEPTION ET SÉLECTION DES BÂTIMENTS 3D (NATIFS OSM, STYLE PERSO 3D ET CRÉÉS) =====
        const isCandidate3DBuilding = (f: mapboxgl.MapboxGeoJSONFeature) => {
          if (!f || !f.geometry) return false;
          const geomType = f.geometry.type;
          if (geomType !== 'Polygon' && geomType !== 'MultiPolygon') return false;

          const layerId = (f.layer?.id || '').toLowerCase();
          const srcLayer = (f.sourceLayer || '').toLowerCase();
          const layerType = f.layer?.type;
          const props = f.properties || {};

          // Ignorer les calques de sélection, survol, grille, routes et dessin
          if (
            layerId.includes('selected-building') ||
            layerId.includes('hovered-building') ||
            layerId.includes('courtyard') ||
            layerId.includes('grid-200m') ||
            layerId.includes('route') ||
            layerId.includes('draw-') ||
            layerId.includes('background') ||
            layerId.includes('landcover') ||
            layerId.includes('landuse') ||
            layerId.includes('water')
          ) {
            return false;
          }

          // 1. Toute couche de type fill-extrusion (bâtiments et volumes 3D)
          if (layerType === 'fill-extrusion') return true;

          // 2. Couche ou source layer associée aux bâtiments
          if (
            layerId.includes('building') ||
            layerId.includes('batiment') ||
            layerId.includes('structure') ||
            layerId.includes('3d') ||
            layerId.includes('extrusion') ||
            srcLayer.includes('building') ||
            srcLayer.includes('structure') ||
            srcLayer.includes('bâti')
          ) {
            return true;
          }

          // 3. Propriétés caractéristiques d'un édifice
          if (
            props.extrude === 'true' ||
            props.extrude === true ||
            props.building ||
            props.height !== undefined ||
            props.render_height !== undefined ||
            props.min_height !== undefined ||
            props.levels !== undefined ||
            props.type === 'building'
          ) {
            return true;
          }

          return false;
        };

        let matchedBuildingObj: Building | null = null;
        let matchedGeometry: any = null;
        let matchedCentroid: [number, number] = [lng, lat];
        let matchedArea: number = 100;
        let isCustomBuilding = false;
        let candidateTargetFeature: mapboxgl.MapboxGeoJSONFeature | undefined = undefined;

        try {
          // Détection ultra-précise au point et avec boîte d'interception 3D
          let renderedFeatures = map.queryRenderedFeatures(e.point);
          let targetFeature = renderedFeatures.find(isCandidate3DBuilding);

          if (!targetFeature) {
            const clickBox: [mapboxgl.PointLike, mapboxgl.PointLike] = [
              [e.point.x - 10, e.point.y - 10],
              [e.point.x + 10, e.point.y + 10]
            ];
            renderedFeatures = map.queryRenderedFeatures(clickBox);
            targetFeature = renderedFeatures.find(isCandidate3DBuilding);
          }

          candidateTargetFeature = targetFeature;

          // 1. Détection des Bâtiments 3D Personnalisés (couche custom-3d-buildings-extrusion)
          const customFeat = renderedFeatures.find(f => f.layer?.id === 'custom-3d-buildings-extrusion');
          if (customFeat) {
            const featId = customFeat.properties?.id || customFeat.id;
            
            // Vérifier en priorité si ce volume 3D correspond à un bâtiment de la base de données
            const matchedFromDb = buildings.find(b => 
              featId === `3d-auto-${b.id}` || 
              featId === `3d-wall-${b.id}` ||
              (typeof featId === 'string' && featId.startsWith(`3d-wall-${b.id}`)) ||
              b.id === featId
            );

            if (matchedFromDb) {
              matchedBuildingObj = matchedFromDb;
              matchedCentroid = [matchedFromDb.centroid.coordinates[0], matchedFromDb.centroid.coordinates[1]];
              matchedGeometry = sanitizeGeometry(matchedFromDb.geom);
              matchedArea = safeCalculateArea(matchedFromDb.geom, 80);
              isCustomBuilding = false;
            } else {
              const foundCustom = custom3DBuildingsRef.current.find(b => b.id === featId);
              if (foundCustom) {
                isCustomBuilding = true;
                matchedCentroid = foundCustom.centroid;
                matchedGeometry = {
                  type: 'Polygon',
                  coordinates: foundCustom.coordinates
                };
                matchedArea = foundCustom.area_m2 || 100;

                matchedBuildingObj = {
                  id: foundCustom.id,
                  osm_id: foundCustom.id,
                  hailand_code: null,
                  parent_building_id: null,
                  zone_id: null,
                  zone_code: null,
                  building_type: 'R',
                  has_courtyard: false,
                  courtyard_geom: null,
                  floor_count: foundCustom.floors || 1,
                  unit_count: 1,
                  floor_level: null,
                  unit_code: null,
                  physical_position: null,
                  status: 'actif',
                  geom: matchedGeometry,
                  centroid: {
                    type: 'Point',
                    coordinates: foundCustom.centroid
                  },
                  altitude_m: foundCustom.height || (foundCustom.floors * 3),
                  commune: 'Bamako',
                  quartier: 'Centre',
                  // Navigation & Accès Niveau 3
                  entry_point_geom: null,
                  entry_point_note: null,
                  internal_directions: null,
                  door_color: null,
                  intercom_code: null,
                  // Notes & Repères
                  landmark_note: foundCustom.name || `Bâtiment 3D (${foundCustom.floors} niveaux)`,
                  access_note: `Volume 3D personnalisé (${foundCustom.height}m)`,
                  is_validated: true,
                  validation_count: 1,
                  validated_by: actorId(),
                  validated_at: foundCustom.created_at,
                  submitted_by: actorId(),
                  claimed_by: null,
                  rejection_reason: null,
                  modification_request: null,
                  created_at: foundCustom.created_at,
                  updated_at: foundCustom.created_at
                };
              }
            }
          }

          // 2. Détection d'un bâtiment déjà enregistré dans la base
          if (!matchedBuildingObj) {
            const existingBuilding = buildings.find(b => {
              if (!b.centroid || !b.centroid.coordinates) return false;
              const bLng = b.centroid.coordinates[0];
              const bLat = b.centroid.coordinates[1];
              const dist = calculateDistance(lat, lng, bLat, bLng);
              return dist < 18;
            });

            if (existingBuilding) {
              matchedBuildingObj = existingBuilding;
              matchedCentroid = [existingBuilding.centroid.coordinates[0], existingBuilding.centroid.coordinates[1]];
              matchedGeometry = sanitizeGeometry(existingBuilding.geom);
              matchedArea = safeCalculateArea(existingBuilding.geom, 80);
            }
          }

          // 3. Détection d'un Bâtiment 3D OpenStreetMap ou de la carte Original Perso 3D
          if (!matchedBuildingObj && targetFeature && targetFeature.geometry) {
            const geom = sanitizeGeometry(targetFeature.geometry);
            let cLng = lng;
            let cLat = lat;
            try {
              const cent = turf.centroid(targetFeature as any);
              if (cent && cent.geometry && cent.geometry.coordinates) {
                cLng = cent.geometry.coordinates[0];
                cLat = cent.geometry.coordinates[1];
              }
            } catch (e) {}

            matchedCentroid = [cLng, cLat];
            matchedGeometry = geom;
            matchedArea = safeCalculateArea(geom, 120);

            const rawId = targetFeature.id;
            const props = targetFeature.properties || {};
            const osmId = props.id || props.osm_id || props['@id'];
            const featId = rawId !== undefined && rawId !== null
              ? String(rawId)
              : (osmId
                ? String(osmId)
                : `bldg-${Math.round(cLng * 100000)}-${Math.round(cLat * 100000)}`);

            const levels = props.levels ? Number(props.levels) : (props.height ? Math.max(1, Math.round(Number(props.height) / 3)) : 1);
            const heightM = Number(props.height || (levels * 3) || 6);

            matchedBuildingObj = {
              id: featId,
              osm_id: featId,
              hailand_code: null,
              parent_building_id: null,
              zone_id: null,
              zone_code: null,
              building_type: (props.type === 'commercial' ? 'C' : props.type === 'industrial' ? 'A' : 'R') as BuildingType,
              has_courtyard: false,
              courtyard_geom: null,
              floor_count: levels,
              unit_count: 1,
              floor_level: null,
              unit_code: null,
              physical_position: null,
              status: 'non_reclame',
              geom: geom,
              centroid: { type: 'Point', coordinates: [cLng, cLat] },
              altitude_m: heightM,
              commune: 'Bamako',
              quartier: props.suburb || props.neighbourhood || 'Centre',
              // Navigation & Accès Niveau 3
              entry_point_geom: null,
              entry_point_note: null,
              internal_directions: null,
              door_color: null,
              intercom_code: null,
              // Notes & Repères
              landmark_note: props.name ? `Bâtiment ${props.name}` : (props.type ? `Structure ${props.type}` : `Édifice 3D #${featId.slice(-6)}`),
              access_note: props.amenity ? `Affectation: ${props.amenity}` : null,
              is_validated: false,
              validation_count: 0,
              validated_by: null,
              validated_at: null,
              submitted_by: null,
              claimed_by: null,
              rejection_reason: null,
              modification_request: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
          }
        } catch (err) {
          console.warn("Erreur détection entité bâtiment Mapbox:", err);
        }

        // SI UN BÂTIMENT 3D (OSM, PERSO 3D, CUSTOM OU ENREGISTRÉ) A ÉTÉ CLIQUÉ :
        if (matchedBuildingObj) {
          setSelectedBuilding(matchedBuildingObj);
          setClickedCoords({
            latitude: matchedCentroid[1],
            longitude: matchedCentroid[0],
            buildingId: matchedBuildingObj.id,
            geometry: sanitizeGeometry(matchedGeometry),
            area: matchedArea
          });

          // Extraire les métadonnées complètes pour le masquage
          let hideData: HiddenBuildingData | undefined = undefined;
          if (candidateTargetFeature) {
            hideData = {
              id: matchedBuildingObj.id,
              rawFeatureId: candidateTargetFeature.id !== undefined && candidateTargetFeature.id !== null ? candidateTargetFeature.id : null,
              layerId: candidateTargetFeature.layer?.id,
              source: candidateTargetFeature.source || 'composite',
              sourceLayer: candidateTargetFeature.sourceLayer || 'building',
              osmId: matchedBuildingObj.osm_id || null,
              geometry: sanitizeGeometry(matchedGeometry),
              centroid: [matchedCentroid[0], matchedCentroid[1]],
              name: matchedBuildingObj.landmark_note
            };
          } else {
            hideData = {
              id: matchedBuildingObj.id,
              rawFeatureId: typeof matchedBuildingObj.id === 'number' ? matchedBuildingObj.id : (isNaN(Number(matchedBuildingObj.id)) ? null : Number(matchedBuildingObj.id)),
              osmId: matchedBuildingObj.osm_id || null,
              geometry: sanitizeGeometry(matchedGeometry),
              centroid: [matchedCentroid[0], matchedCentroid[1]],
              name: matchedBuildingObj.landmark_note
            };
          }

          // Action contextuelle flottante "Masquer" positionnée à côté du curseur
          setSelectedPolygonHideAction({
            buildingId: matchedBuildingObj.id,
            hideData,
            lngLat: [lng, lat],
            isCustom: isCustomBuilding,
            screenPos: { x: e.point.x, y: e.point.y }
          });

          const isCourtyard = selectionTargetNatureRef.current === 'courtyard' || Boolean(matchedBuildingObj.has_courtyard);

          // Surbrillance du contour exact du bâtiment (aucun faux carré créé)
          const selectionSource = map.getSource('selected-building') as mapboxgl.GeoJSONSource;
          if (selectionSource && matchedGeometry) {
            selectionSource.setData({
              type: 'Feature',
              properties: {
                is_courtyard: isCourtyard
              },
              geometry: matchedGeometry
            });
          }

          // Étape 1 : Détection spatiale automatique si sélection en mode cour/concession
          if (isCourtyard) {
            detectOsmBuildingsInZone(matchedGeometry, map);
          }

          // Afficher le marqueur du GPS fixe centroïde uniquement si ce n'est PAS une cour
          // (pour une cour, on évite d'obstruer le centre avec un gros marqueur orange pour laisser une visibilité parfaite sur les toits intérieurs)
          if (isCourtyard) {
            if (markerRef.current) {
              markerRef.current.remove();
              markerRef.current = null;
            }
          } else {
            if (markerRef.current) {
              markerRef.current.setLngLat([matchedCentroid[0], matchedCentroid[1]]);
            } else {
              const el = document.createElement('div');
              el.className = 'custom-house-marker select-none';
              el.innerHTML = `
                <div class="flex items-center justify-center w-10 h-10 bg-orange-500 rounded-full border-2 border-slate-900 shadow-xl shadow-orange-500/30 transform transition-transform duration-200 hover:scale-110 cursor-pointer">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-5 h-5 text-slate-950">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                    <polyline points="9 22 9 12 15 12 15 22"></polyline>
                  </svg>
                </div>
                <div class="w-2.5 h-2.5 bg-orange-500 border border-slate-900 rounded-full mx-auto -mt-1 shadow-md animate-ping"></div>
              `;
              const marker = new mapboxgl.Marker({ element: el })
                .setLngLat([matchedCentroid[0], matchedCentroid[1]])
                .addTo(map);
              markerRef.current = marker;
            }
          }

          // Affichage du log demandé
          console.log("Bâtiment sélectionné :", matchedBuildingObj.id, matchedBuildingObj.landmark_note || matchedBuildingObj.hailand_code || matchedBuildingObj.osm_id);

          return;
        }

        // SI CLIC EN TERRAIN LIBRE (HORS STRUCTURE 3D) :
        // Ne générer AUCUNE case carrée moche ou artificielle, désélectionner proprement
        setSelectedBuilding(null);
        setSelected3DBuilding(null);
        setClickedCoords(null);
        setSelectedPolygonHideAction(null);

        if (markerRef.current) {
          markerRef.current.remove();
          markerRef.current = null;
        }

        const selectionSource = map.getSource('selected-building') as mapboxgl.GeoJSONSource;
        if (selectionSource) {
          selectionSource.setData({
            type: 'FeatureCollection',
            features: []
          });
        }

        // Log de clic terrain libre
      }
