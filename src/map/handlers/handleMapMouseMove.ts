/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mapboxgl from 'mapbox-gl';
import * as turf from '@turf/turf';

/** Gestionnaire extrait d'App.tsx : `ctx` regroupe l'état et les références du composant au moment de l'initialisation de la carte. */
export function handleMapMouseMove(e: any, ctx: Record<string, any>) {
  const { drawRafRef, entrancePickerConfigRef, isDrawModeRef, lastMouseCoordRef, map, previewEntranceMarkerRef, renderDrawRubberbandPreviewRef, snappedCoordsRef, wallLineCacheRef } = ctx;
        // MODE SÉLECTION D'ENTRÉE / PORTAIL DE COUR AVEC VERROUILLAGE ET AIMANTATION CONTINUE SUR LE MUR
        if (entrancePickerConfigRef.current && entrancePickerConfigRef.current.active) {
          const picker = entrancePickerConfigRef.current;
          map.getCanvas().style.cursor = 'crosshair'; // Force le curseur en forme de mire (+)

          let snapLng = Number(e.lngLat.lng.toFixed(6));
          let snapLat = Number(e.lngLat.lat.toFixed(6));

          if (picker.type === 'courtyard' && (wallLineCacheRef.current || picker.wallGeometry)) {
            try {
              if (!wallLineCacheRef.current && picker.wallGeometry) {
                wallLineCacheRef.current = turf.polygonToLine(picker.wallGeometry);
              }
              const wallLine = wallLineCacheRef.current;
              if (wallLine) {
                const mousePt = turf.point([e.lngLat.lng, e.lngLat.lat]);
                const nearest = turf.nearestPointOnLine(wallLine as any, mousePt);
                snapLng = Number(nearest.geometry.coordinates[0].toFixed(6));
                snapLat = Number(nearest.geometry.coordinates[1].toFixed(6));
              }
            } catch (err) {
              console.warn("Erreur snapping mur de cour:", err);
            }
          }

          snappedCoordsRef.current = { lng: snapLng, lat: snapLat };

          if (!previewEntranceMarkerRef.current) {
            const el = document.createElement('div');
            el.className = 'entrance-snap-dot pointer-events-none';
            el.style.width = '10px';
            el.style.height = '10px';
            el.style.borderRadius = '50%';
            el.style.backgroundColor = picker.type === 'courtyard' ? '#00e5ff' : '#10b981';
            el.style.border = '2px solid #ffffff';
            el.style.boxShadow = picker.type === 'courtyard' 
              ? '0 0 0 2px rgba(0, 229, 255, 0.4), 0 0 10px rgba(0, 229, 255, 0.95)' 
              : '0 0 0 2px rgba(16, 185, 129, 0.4), 0 0 10px rgba(16, 185, 129, 0.95)';
            el.style.boxSizing = 'border-box';

            previewEntranceMarkerRef.current = new mapboxgl.Marker({ 
              element: el,
              anchor: 'center'
            });
          }

          previewEntranceMarkerRef.current.setLngLat([snapLng, snapLat]);
          if (!previewEntranceMarkerRef.current.getElement().parentElement) {
            previewEntranceMarkerRef.current.addTo(map);
          }

          return;
        }

        if (isDrawModeRef.current) {
          lastMouseCoordRef.current = { lng: e.lngLat.lng, lat: e.lngLat.lat, point: e.point };
          if (drawRafRef.current === null) {
            drawRafRef.current = requestAnimationFrame(() => {
              drawRafRef.current = null;
              if (lastMouseCoordRef.current) {
                renderDrawRubberbandPreviewRef.current?.(
                  lastMouseCoordRef.current.lng,
                  lastMouseCoordRef.current.lat,
                  lastMouseCoordRef.current.point
                );
              }
            });
          }
          return;
        }

        try {
          const isCandidate3DBuilding = (f: mapboxgl.MapboxGeoJSONFeature) => {
            if (!f || !f.geometry) return false;
            const geomType = f.geometry.type;
            if (geomType !== 'Polygon' && geomType !== 'MultiPolygon') return false;

            const layerId = (f.layer?.id || '').toLowerCase();
            const srcLayer = (f.sourceLayer || '').toLowerCase();
            const layerType = f.layer?.type;
            const props = f.properties || {};

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

            if (layerType === 'fill-extrusion') return true;

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

          let features = map.queryRenderedFeatures(e.point);
          let hasBuilding = features.some(isCandidate3DBuilding);

          if (!hasBuilding) {
            features = map.queryRenderedFeatures([
              [e.point.x - 6, e.point.y - 6],
              [e.point.x + 6, e.point.y + 6]
            ]);
            hasBuilding = features.some(isCandidate3DBuilding);
          }

          map.getCanvas().style.cursor = hasBuilding ? 'pointer' : '';
        } catch (err) {
          map.getCanvas().style.cursor = '';
        }
      }
