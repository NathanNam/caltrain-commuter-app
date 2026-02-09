'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { stations } from '@/lib/stations';
import { Train } from '@/lib/types';

interface TrainMapProps {
  originId?: string;
  destinationId?: string;
}

export default function TrainMap({ originId, destinationId }: TrainMapProps) {
  const [trains, setTrains] = useState<Train[]>([]);
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const trainMarkers = useRef<Map<string, maplibregl.Marker>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);

  // Fetch trains with vehicle positions
  useEffect(() => {
    if (!originId || !destinationId) {
      setTrains([]);
      return;
    }

    const fetchTrains = async () => {
      try {
        const response = await fetch(
          `/api/trains?origin=${originId}&destination=${destinationId}`
        );
        if (response.ok) {
          const data = await response.json();
          setTrains(data.trains || []);
        }
      } catch (error) {
        console.error('Error fetching trains for map:', error);
      }
    };

    fetchTrains();

    // Refresh every 30 seconds for live positions
    const interval = setInterval(fetchTrains, 30000);
    return () => clearInterval(interval);
  }, [originId, destinationId]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Center on the Caltrain corridor (roughly Redwood City area)
    const centerLat = 37.45;
    const centerLng = -122.15;

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
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
          },
        ],
      },
      center: [centerLng, centerLat],
      zoom: 9,
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      setMapLoaded(true);

      // Add Caltrain route line
      const routeCoordinates = stations.map(s => [s.coordinates.lng, s.coordinates.lat]);

      map.current!.addSource('caltrain-route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: routeCoordinates,
          },
        },
      });

      map.current!.addLayer({
        id: 'caltrain-route-line',
        type: 'line',
        source: 'caltrain-route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#e31837', // Caltrain red
          'line-width': 3,
          'line-opacity': 0.7,
        },
      });

      // Add station markers
      stations.forEach(station => {
        const isOrigin = station.id === originId;
        const isDestination = station.id === destinationId;

        const el = document.createElement('div');
        el.className = 'station-marker';
        el.style.cssText = `
          width: ${isOrigin || isDestination ? '14px' : '10px'};
          height: ${isOrigin || isDestination ? '14px' : '10px'};
          background-color: ${isOrigin ? '#22c55e' : isDestination ? '#3b82f6' : '#ffffff'};
          border: 2px solid ${isOrigin ? '#16a34a' : isDestination ? '#2563eb' : '#e31837'};
          border-radius: 50%;
          cursor: pointer;
        `;

        new maplibregl.Marker({ element: el })
          .setLngLat([station.coordinates.lng, station.coordinates.lat])
          .setPopup(
            new maplibregl.Popup({ offset: 25 }).setHTML(
              `<strong>${station.name}</strong>${isOrigin ? '<br><span style="color: #22c55e;">Origin</span>' : ''}${isDestination ? '<br><span style="color: #3b82f6;">Destination</span>' : ''}`
            )
          )
          .addTo(map.current!);
      });
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update origin/destination styling when they change
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    // Update station markers when origin/destination changes
    const markers = document.querySelectorAll('.station-marker');
    markers.forEach((marker, index) => {
      const station = stations[index];
      if (!station) return;

      const isOrigin = station.id === originId;
      const isDestination = station.id === destinationId;
      const el = marker as HTMLElement;

      el.style.width = isOrigin || isDestination ? '14px' : '10px';
      el.style.height = isOrigin || isDestination ? '14px' : '10px';
      el.style.backgroundColor = isOrigin ? '#22c55e' : isDestination ? '#3b82f6' : '#ffffff';
      el.style.borderColor = isOrigin ? '#16a34a' : isDestination ? '#2563eb' : '#e31837';
    });
  }, [originId, destinationId, mapLoaded]);

  // Update train markers
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    // Get trains with vehicle positions
    const trainsWithPositions = trains.filter(t => t.vehiclePosition);

    // Remove markers for trains that no longer have positions
    const currentTrainIds = new Set(trainsWithPositions.map(t => t.trainNumber));
    trainMarkers.current.forEach((marker, trainId) => {
      if (!currentTrainIds.has(trainId)) {
        marker.remove();
        trainMarkers.current.delete(trainId);
      }
    });

    // Update or create markers for trains with positions
    trainsWithPositions.forEach(train => {
      const pos = train.vehiclePosition!;
      const existingMarker = trainMarkers.current.get(train.trainNumber);

      if (existingMarker) {
        // Update existing marker position
        existingMarker.setLngLat([pos.longitude, pos.latitude]);

        // Update rotation if bearing is available
        const el = existingMarker.getElement();
        if (pos.bearing !== undefined) {
          el.style.transform = `rotate(${pos.bearing}deg)`;
        }
      } else {
        // Create new train marker
        const el = document.createElement('div');
        el.className = 'train-marker';
        el.innerHTML = `
          <div style="
            width: 24px;
            height: 24px;
            background-color: ${train.direction === 'Northbound' ? '#3b82f6' : '#ef4444'};
            border: 2px solid white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            cursor: pointer;
            ${pos.bearing !== undefined ? `transform: rotate(${pos.bearing}deg);` : ''}
          ">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
              <path d="M12 2L4 14h6v8l8-12h-6z"/>
            </svg>
          </div>
        `;

        const statusText = pos.currentStatus === 'STOPPED_AT' ? 'Stopped' :
                          pos.currentStatus === 'INCOMING_AT' ? 'Arriving' :
                          pos.currentStatus === 'IN_TRANSIT_TO' ? 'In Transit' : '';

        const speedMph = pos.speed ? Math.round(pos.speed * 2.237) : null; // m/s to mph

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([pos.longitude, pos.latitude])
          .setPopup(
            new maplibregl.Popup({ offset: 25 }).setHTML(`
              <strong>Train ${train.trainNumber}</strong><br>
              <span style="color: ${train.direction === 'Northbound' ? '#3b82f6' : '#ef4444'};">
                ${train.direction}
              </span><br>
              ${train.type}<br>
              ${statusText ? `<em>${statusText}</em><br>` : ''}
              ${speedMph !== null ? `Speed: ${speedMph} mph<br>` : ''}
              ${train.delay && train.delay > 0 ? `<span style="color: #f97316;">Delayed ${train.delay} min</span>` : ''}
            `)
          )
          .addTo(map.current!);

        trainMarkers.current.set(train.trainNumber, marker);
      }
    });
  }, [trains, mapLoaded]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Live Train Map</h2>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span className="text-gray-600 dark:text-gray-400">Northbound</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <span className="text-gray-600 dark:text-gray-400">Southbound</span>
            </div>
          </div>
        </div>
        {trains.filter(t => t.vehiclePosition).length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            No live train positions available. Trains will appear when running.
          </p>
        )}
      </div>
      <div
        ref={mapContainer}
        className="w-full h-[400px]"
        style={{ minHeight: '400px' }}
      />
    </div>
  );
}
