'use client';

import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { stations } from '@/lib/stations';
import { Train } from '@/lib/types';

interface TrainMapProps {
  originId?: string;
  destinationId?: string;
  /** Trains for the chosen route, already fetched by the board. */
  trains: Train[];
}

// Board palette (fixed hex values: MapLibre markers are plain DOM outside the theme)
const INK = '#1b1a17';
const TRIP_GREEN = '#6fae4b';
const NORTH = '#1f4e9c';
const SOUTH = '#c8202e';

// maplibre-gl 6 looks for its worker next to its own module file, which the
// bundler moves; serve it from public/ instead (see scripts/copy-maplibre-worker.mjs).
const WORKER_URL = `/maplibre-gl-worker.mjs?v=${maplibregl.getVersion()}`;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function styleStation(el: HTMLElement, isEnd: boolean) {
  el.style.width = isEnd ? '16px' : '10px';
  el.style.height = isEnd ? '16px' : '10px';
  el.style.backgroundColor = isEnd ? TRIP_GREEN : '#ffffff';
  el.style.border = `2px solid ${INK}`;
  el.style.borderRadius = '50%';
  el.style.cursor = 'pointer';
}

/** Street map of the corridor with live train positions (secondary view, loaded lazily). */
export default function TrainMap({ originId, destinationId, trains }: TrainMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const stationEls = useRef<Map<string, HTMLElement>>(new Map());
  const trainMarkers = useRef<Map<string, maplibregl.Marker>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const markers = trainMarkers.current;
    const els = stationEls.current;

    if (maplibregl.getWorkerUrl() !== WORKER_URL) {
      maplibregl.setWorkerUrl(WORKER_URL);
    }

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: [
              'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
              'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
              'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      // Centre on the Caltrain corridor (roughly Redwood City)
      center: [-122.15, 37.45],
      zoom: 9,
      cooperativeGestures: true,
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      setMapLoaded(true);

      const routeCoordinates = stations.map((s) => [s.coordinates.lng, s.coordinates.lat]);
      map.current!.addSource('caltrain-route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: routeCoordinates },
        },
      });
      map.current!.addLayer({
        id: 'caltrain-route-line',
        type: 'line',
        source: 'caltrain-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': INK, 'line-width': 4, 'line-opacity': 0.85 },
      });

      stations.forEach((station) => {
        const el = document.createElement('div');
        styleStation(el, false);
        els.set(station.id, el);
        new maplibregl.Marker({ element: el })
          .setLngLat([station.coordinates.lng, station.coordinates.lat])
          .setPopup(new maplibregl.Popup({ offset: 14 }).setHTML(`<strong>${escapeHtml(station.name)}</strong>`))
          .addTo(map.current!);
      });
    });

    return () => {
      markers.clear();
      els.clear();
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Highlight the chosen origin and destination
  useEffect(() => {
    if (!mapLoaded) return;
    stationEls.current.forEach((el, id) => {
      styleStation(el, id === originId || id === destinationId);
      el.setAttribute('title', id === originId ? 'Origin' : id === destinationId ? 'Destination' : '');
    });
  }, [originId, destinationId, mapLoaded]);

  // Live train markers
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    const withPositions = trains.filter((t) => t.vehiclePosition);
    const currentIds = new Set(withPositions.map((t) => t.trainNumber));
    trainMarkers.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        trainMarkers.current.delete(id);
      }
    });

    withPositions.forEach((train) => {
      const pos = train.vehiclePosition!;
      const existing = trainMarkers.current.get(train.trainNumber);
      if (existing) {
        existing.setLngLat([pos.longitude, pos.latitude]);
        return;
      }

      const colour = train.direction === 'Northbound' ? NORTH : SOUTH;
      const el = document.createElement('div');
      el.setAttribute('aria-label', `Train ${train.trainNumber}, ${train.direction}`);
      el.style.cssText = `width:30px;height:30px;border-radius:50%;background:${colour};border:2px solid ${INK};
        box-shadow:inset 0 0 0 2px #fff;color:#fff;font:800 9px/26px system-ui,sans-serif;text-align:center;cursor:pointer;`;
      el.textContent = train.trainNumber.slice(0, 4);

      const statusText =
        pos.currentStatus === 'STOPPED_AT' ? 'Stopped' : pos.currentStatus === 'INCOMING_AT' ? 'Arriving' : pos.currentStatus === 'IN_TRANSIT_TO' ? 'In transit' : '';
      const speedMph = pos.speed ? Math.round(pos.speed * 2.237) : null;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([pos.longitude, pos.latitude])
        .setPopup(
          new maplibregl.Popup({ offset: 18 }).setHTML(`
            <strong>Train ${escapeHtml(train.trainNumber)}</strong><br>
            ${train.direction} &middot; ${train.type}<br>
            ${statusText ? `${statusText}<br>` : ''}
            ${speedMph !== null ? `Speed: ${speedMph} mph<br>` : ''}
            ${train.delay && train.delay > 0 ? `Delayed ${train.delay} min` : ''}
          `)
        )
        .addTo(map.current!);
      trainMarkers.current.set(train.trainNumber, marker);
    });

    // Trains reporting almost the same spot (e.g. two trains waiting at
    // 4th & King) would hide each other; fan them out so each number shows.
    const groups: { lat: number; lng: number; n: number }[] = [];
    withPositions.forEach((train) => {
      const pos = train.vehiclePosition!;
      let g = groups.find((o) => Math.abs(o.lat - pos.latitude) < 0.002 && Math.abs(o.lng - pos.longitude) < 0.002);
      if (!g) {
        g = { lat: pos.latitude, lng: pos.longitude, n: 0 };
        groups.push(g);
      }
      trainMarkers.current.get(train.trainNumber)?.setOffset([g.n * 32, 0]);
      g.n += 1;
    });
  }, [trains, mapLoaded]);

  return <div ref={mapContainer} className="map-canvas" />;
}
