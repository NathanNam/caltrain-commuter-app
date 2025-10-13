'use client';

import { Station } from '@/lib/types';
import { stations } from '@/lib/stations';

interface StationSelectorProps {
  originId: string;
  destinationId: string;
  onOriginChange: (stationId: string) => void;
  onDestinationChange: (stationId: string) => void;
  onSwap: () => void;
}

export default function StationSelector({
  originId,
  destinationId,
  onOriginChange,
  onDestinationChange,
  onSwap
}: StationSelectorProps) {
  const isValidRoute = originId && destinationId && originId !== destinationId;

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Select Route</h2>

      <div className="space-y-4">
        {/* Origin Station */}
        <div>
          <label htmlFor="origin" className="block text-sm font-medium text-gray-700 mb-2">
            From
          </label>
          <select
            id="origin"
            value={originId}
            onChange={(e) => onOriginChange(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
          >
            <option value="">Select origin station</option>
            {stations.map((station) => (
              <option
                key={station.id}
                value={station.id}
                disabled={station.id === destinationId}
              >
                {station.name}
              </option>
            ))}
          </select>
        </div>

        {/* Swap Button */}
        <div className="flex justify-center">
          <button
            onClick={onSwap}
            disabled={!originId || !destinationId}
            className="p-3 rounded-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white transition-colors"
            aria-label="Swap origin and destination"
            title="Swap stations"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
              />
            </svg>
          </button>
        </div>

        {/* Destination Station */}
        <div>
          <label htmlFor="destination" className="block text-sm font-medium text-gray-700 mb-2">
            To
          </label>
          <select
            id="destination"
            value={destinationId}
            onChange={(e) => onDestinationChange(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
          >
            <option value="">Select destination station</option>
            {stations.map((station) => (
              <option
                key={station.id}
                value={station.id}
                disabled={station.id === originId}
              >
                {station.name}
              </option>
            ))}
          </select>
        </div>

        {/* Validation Message */}
        {originId && destinationId && originId === destinationId && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3">
            <p className="text-sm text-yellow-700">
              Origin and destination must be different stations.
            </p>
          </div>
        )}

        {/* Route Info */}
        {isValidRoute && (
          <div className="bg-green-50 border-l-4 border-green-400 p-3">
            <p className="text-sm text-green-700 font-medium">
              Route selected - showing trains below
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
