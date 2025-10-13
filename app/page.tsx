'use client';

import { useState } from 'react';
import StationSelector from '@/components/StationSelector';
import TrainList from '@/components/TrainList';
import WeatherWidget from '@/components/WeatherWidget';
import ServiceAlerts from '@/components/ServiceAlerts';
import SavedRoutes from '@/components/SavedRoutes';
import VenueEvents from '@/components/VenueEvents';

export default function Home() {
  const [originId, setOriginId] = useState('');
  const [destinationId, setDestinationId] = useState('');

  const handleSwap = () => {
    if (originId && destinationId) {
      const temp = originId;
      setOriginId(destinationId);
      setDestinationId(temp);
    }
  };

  const handleRouteSelect = (newOriginId: string, newDestinationId: string) => {
    setOriginId(newOriginId);
    setDestinationId(newDestinationId);
  };

  const isValidRoute = originId && destinationId && originId !== destinationId;

  return (
    <div className="space-y-6">
      {/* Service Alerts - Show at top if any */}
      <ServiceAlerts />

      {/* Event Crowding Alerts */}
      <VenueEvents />

      {/* Station Selector */}
      <StationSelector
        originId={originId}
        destinationId={destinationId}
        onOriginChange={setOriginId}
        onDestinationChange={setDestinationId}
        onSwap={handleSwap}
      />

      {/* Saved Routes */}
      <SavedRoutes
        currentOriginId={originId}
        currentDestinationId={destinationId}
        onRouteSelect={handleRouteSelect}
      />

      {/* Weather & Train Info - Only show when valid route selected */}
      {isValidRoute && (
        <>
          {/* Weather Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <WeatherWidget stationId={originId} label="Origin Weather" />
            <WeatherWidget stationId={destinationId} label="Destination Weather" />
          </div>

          {/* Train Schedule */}
          <TrainList originId={originId} destinationId={destinationId} />
        </>
      )}

      {/* Help Text */}
      {!isValidRoute && (
        <div className="bg-blue-50 border-l-4 border-blue-400 rounded-lg p-6 text-center">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">
            Welcome to Caltrain Commuter!
          </h3>
          <p className="text-blue-700">
            Select your origin and destination stations above to see train schedules and weather information.
          </p>
          <p className="text-sm text-blue-600 mt-2">
            Save your frequent routes for quick access!
          </p>
        </div>
      )}
    </div>
  );
}
