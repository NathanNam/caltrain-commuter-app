'use client';

import { useEffect, useState } from 'react';
import { WeatherData } from '@/lib/types';
import { getStationById } from '@/lib/stations';

interface WeatherWidgetProps {
  stationId: string;
  label: string;
}

export default function WeatherWidget({ stationId, label }: WeatherWidgetProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMockData, setIsMockData] = useState(false);

  useEffect(() => {
    if (!stationId) {
      setWeather(null);
      return;
    }

    const fetchWeather = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/weather?station=${stationId}`);

        if (!response.ok) {
          throw new Error('Failed to fetch weather data');
        }

        const data = await response.json();
        setWeather(data);
        setIsMockData(data.isMockData || false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        setWeather(null);
      } finally {
        setLoading(false);
      }
    };

    fetchWeather();

    // Auto-refresh every 10 minutes
    const interval = setInterval(fetchWeather, 600000);

    return () => clearInterval(interval);
  }, [stationId]);

  const station = getStationById(stationId);

  if (!stationId || !station) {
    return null;
  }

  if (loading && !weather) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-2">{label}</h3>
        <p className="text-sm text-gray-600 mb-4">{station.name}</p>
        <div className="animate-pulse space-y-3">
          <div className="bg-gray-200 h-16 rounded" />
          <div className="bg-gray-200 h-8 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-2">{label}</h3>
        <p className="text-sm text-gray-600 mb-4">{station.name}</p>
        <div className="bg-red-50 border-l-4 border-red-400 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  if (!weather) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg shadow-md p-6">
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-lg font-bold text-gray-800">{label}</h3>
        {isMockData && (
          <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded font-semibold">
            DEMO MODE
          </span>
        )}
      </div>
      <p className="text-sm text-gray-600 mb-4">{station.name}</p>

      {isMockData && (
        <div className="mb-4 bg-yellow-50 border-l-4 border-yellow-400 p-3">
          <p className="text-xs text-yellow-800">
            <strong>Demo weather shown.</strong> Configure WEATHER_API_KEY for real weather data.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Weather Icon */}
          <div className="bg-white rounded-full p-3 shadow-sm">
            <img
              src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`}
              alt={weather.description}
              className="w-12 h-12"
            />
          </div>

          {/* Temperature */}
          <div>
            <div className="text-4xl font-bold text-gray-900">
              {weather.temperature}°F
            </div>
            <div className="text-sm text-gray-600 capitalize">
              {weather.description}
            </div>
          </div>
        </div>
      </div>

      {/* Additional Info */}
      <div className="mt-4 pt-4 border-t border-blue-200 grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-gray-600">Wind</div>
          <div className="font-semibold text-gray-800">{weather.windSpeed} mph</div>
        </div>
        <div>
          <div className="text-gray-600">Humidity</div>
          <div className="font-semibold text-gray-800">{weather.humidity}%</div>
        </div>
      </div>
    </div>
  );
}
