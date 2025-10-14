'use client';

import { useEffect, useState } from 'react';
import { Train } from '@/lib/types';
import { formatTime, formatDuration } from '@/lib/utils';

interface TrainListProps {
  originId: string;
  destinationId: string;
}

export default function TrainList({ originId, destinationId }: TrainListProps) {
  const [trains, setTrains] = useState<Train[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (!originId || !destinationId) {
      setTrains([]);
      return;
    }

    const fetchTrains = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/trains?origin=${originId}&destination=${destinationId}`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch train data');
        }

        const data = await response.json();
        setTrains(data.trains || []);
        setLastUpdated(new Date());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        setTrains([]);
      } finally {
        setLoading(false);
      }
    };

    fetchTrains();

    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchTrains, 60000);

    return () => clearInterval(interval);
  }, [originId, destinationId]);

  if (!originId || !destinationId) {
    return null;
  }

  if (loading && trains.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Next Trains</h2>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse bg-gray-200 h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Next Trains</h2>
        <div className="bg-red-50 border-l-4 border-red-400 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  if (trains.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Next Trains</h2>
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <p className="text-sm text-yellow-700">
            No trains currently scheduled for this route.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">Next Trains</h2>
        {lastUpdated && (
          <p className="text-xs text-gray-500">
            Updated {lastUpdated.toLocaleTimeString()}
          </p>
        )}
      </div>

      <div className="space-y-3">
        {trains.map((train, index) => (
          <div
            key={`${train.trainNumber}-${index}`}
            className={`border rounded-lg p-4 transition-all ${
              index === 0
                ? 'border-blue-500 bg-blue-50 shadow-md'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`font-bold text-lg ${
                      index === 0 ? 'text-blue-700' : 'text-gray-800'
                    }`}
                  >
                    {formatTime(train.departureTime)}
                  </span>
                  {index === 0 && (
                    <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded font-semibold">
                      NEXT
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                  <div>
                    <span className="font-medium">Arrives:</span>{' '}
                    {formatTime(train.arrivalTime)}
                  </div>
                  <div>
                    <span className="font-medium">Duration:</span>{' '}
                    {formatDuration(train.duration)}
                  </div>
                </div>

                {/* Delay status indicator */}
                {train.status && train.status !== 'on-time' && (
                  <div className="mt-2">
                    {train.status === 'cancelled' ? (
                      <div className="inline-flex items-center gap-1 bg-red-100 text-red-700 text-xs font-semibold px-2 py-1 rounded">
                        <span>❌</span>
                        <span>CANCELLED</span>
                      </div>
                    ) : train.delay && train.delay > 0 ? (
                      <div className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 text-xs font-semibold px-2 py-1 rounded">
                        <span>⚠️</span>
                        <span>Delayed {train.delay} min</span>
                      </div>
                    ) : train.delay && train.delay < 0 ? (
                      <div className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs font-semibold px-2 py-1 rounded">
                        <span>✓</span>
                        <span>Early {Math.abs(train.delay)} min</span>
                      </div>
                    ) : null}
                  </div>
                )}

                {train.status === 'on-time' && (
                  <div className="mt-2">
                    <div className="inline-flex items-center gap-1 bg-green-50 text-green-600 text-xs font-semibold px-2 py-1 rounded">
                      <span>✓</span>
                      <span>On Time</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="text-right">
                <div
                  className={`text-xs font-semibold px-2 py-1 rounded ${
                    train.type === 'Express'
                      ? 'bg-green-100 text-green-700'
                      : train.type === 'Limited'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {train.type}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Train {train.trainNumber}
                </div>
                <div className="text-xs text-gray-500">{train.direction}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
