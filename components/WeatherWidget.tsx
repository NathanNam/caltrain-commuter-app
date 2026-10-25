'use client';

import { useEffect, useState } from 'react';
import { WeatherData } from '@/lib/types';
import { getStationById } from '@/lib/stations';
import { plainName, sealCode } from '@/lib/board';

interface WeatherWidgetProps {
  stationId: string;
  /** "Origin" or "Destination", for screen readers. */
  which: string;
  onSampleChange?: (isSample: boolean) => void;
}

/** Weather for one station as a double-bordered "certificate". */
export default function WeatherWidget({ stationId, which, onSampleChange }: WeatherWidgetProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          throw new Error('Weather is unavailable right now');
        }

        const data = await response.json();
        setWeather(data);
        onSampleChange?.(Boolean(data.isMockData));
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
  }, [stationId, onSampleChange]);

  const station = getStationById(stationId);
  if (!stationId || !station) {
    return null;
  }

  const name = plainName(station);

  return (
    <section className="cert" aria-label={`${which} weather, ${name}`}>
      <div className="seal" aria-hidden="true">
        {sealCode(station)}
      </div>
      <div className="co">Weather certificate &middot; {name}</div>
      {loading && !weather ? (
        <div className="skeleton" style={{ height: 52, marginTop: 8 }} />
      ) : error || !weather ? (
        <p className="small" style={{ marginTop: 8 }}>
          {error ?? 'No weather report.'}
        </p>
      ) : (
        <>
          <div className="big">{weather.temperature}&deg;F</div>
          <div className="small">
            {weather.description} &middot; wind {weather.windSpeed} mph &middot; humidity {weather.humidity}%
          </div>
        </>
      )}
    </section>
  );
}
