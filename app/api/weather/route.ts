import { NextRequest, NextResponse } from 'next/server';
import { WeatherData } from '@/lib/types';
import { getStationById } from '@/lib/stations';
import { celsiusToFahrenheit, mpsToMph } from '@/lib/utils';
import { trace, SpanStatusCode, Span } from '@opentelemetry/api';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { logger, tracer, meter } from '@/otel-server';
import { resilientFetch, DEFAULT_RETRY_CONFIG } from '@/lib/api-resilience';

// Initialize metrics
const weatherRequestCounter = meter.createCounter('weather_api_requests_total', {
  description: 'Total number of requests to the weather API',
});

const weatherRequestDuration = meter.createHistogram('weather_api_request_duration_ms', {
  description: 'Duration of weather API requests in milliseconds',
});

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  return tracer.startActiveSpan('weather.api.get', async (span: Span) => {
    const searchParams = request.nextUrl.searchParams;
    const stationId = searchParams.get('station');
    let station: any = null;

    try {

      span.setAttributes({
        'http.method': 'GET',
        'http.route': '/api/weather',
        'weather.station_id': stationId || '',
      });

      if (!stationId) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Missing station ID' });
        span.recordException(new Error('Station ID is required'));

        logger.emit({
          severityNumber: SeverityNumber.WARN,
          severityText: 'WARN',
          body: 'Weather API request missing station ID',
        });

        weatherRequestCounter.add(1, { status: 'error', error_type: 'missing_station' });

        return NextResponse.json(
          { error: 'Station ID is required' },
          { status: 400 }
        );
      }

      station = getStationById(stationId);
      if (!station) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Invalid station ID' });
        span.recordException(new Error('Invalid station ID'));

        logger.emit({
          severityNumber: SeverityNumber.WARN,
          severityText: 'WARN',
          body: 'Weather API request with invalid station ID',
          attributes: { station_id: stationId },
        });

        weatherRequestCounter.add(1, { status: 'error', error_type: 'invalid_station' });

        return NextResponse.json(
          { error: 'Invalid station ID' },
          { status: 400 }
        );
      }

      span.setAttributes({
        'weather.station_name': station.name,
        'weather.station_lat': station.coordinates.lat,
        'weather.station_lng': station.coordinates.lng,
      });

      // Check if API key is configured
      const hasApiKey = !!process.env.WEATHER_API_KEY;
      span.setAttributes({
        'weather.has_api_key': hasApiKey,
      });

      if (!hasApiKey) {
        logger.emit({
          severityNumber: SeverityNumber.INFO,
          severityText: 'INFO',
          body: 'Using mock weather data - configure WEATHER_API_KEY for real weather',
          attributes: { station_id: stationId, station_name: station.name },
        });

        const mockWeather = generateMockWeather(station.coordinates.lat);
        const duration = Date.now() - startTime;

        span.setAttributes({
          'weather.is_mock_data': true,
          'weather.temperature': mockWeather.temperature,
          'http.status_code': 200,
        });

        span.setStatus({ code: SpanStatusCode.OK });

        weatherRequestCounter.add(1, { status: 'success', data_type: 'mock' });
        weatherRequestDuration.record(duration, { status: 'success', data_type: 'mock' });

        return NextResponse.json(
          {
            ...mockWeather,
            isMockData: true
          },
          {
            headers: {
              'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200'
            }
          }
        );
      }

      // Fetch weather from OpenWeatherMap API with resilience
      const apiKey = process.env.WEATHER_API_KEY;
      const { lat, lng } = station.coordinates;

      const cacheKey = `weather_${stationId}_${Math.floor(Date.now() / 600000)}`; // 10-minute cache buckets

      const data = await resilientFetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`,
        {
          method: 'GET',
          cacheKey,
          cacheConfig: {
            ttlMs: 600000, // 10 minutes
            staleWhileRevalidateMs: 1200000, // 20 minutes
          },
          retryConfig: {
            ...DEFAULT_RETRY_CONFIG,
            maxRetries: 3,
            retryableStatusCodes: [429, 502, 503, 504, 408, 500], // Include 500 for weather API
          },
          circuitBreakerConfig: {
            failureThreshold: 3,
            resetTimeoutMs: 300000, // 5 minutes
            monitoringPeriodMs: 600000, // 10 minutes
          },
          context: 'openweathermap',
          parser: (response) => response.json(),
        }
      );

      const weatherData: WeatherData = {
        temperature: celsiusToFahrenheit(data.main.temp),
        description: data.weather[0].description,
        icon: data.weather[0].icon,
        windSpeed: mpsToMph(data.wind.speed),
        humidity: data.main.humidity
      };

      const duration = Date.now() - startTime;

      span.setAttributes({
        'weather.is_mock_data': false,
        'weather.temperature': weatherData.temperature,
        'weather.description': weatherData.description,
        'weather.humidity': weatherData.humidity,
        'weather.wind_speed': weatherData.windSpeed,
        'http.status_code': 200,
      });

      span.setStatus({ code: SpanStatusCode.OK });

      logger.emit({
        severityNumber: SeverityNumber.INFO,
        severityText: 'INFO',
        body: 'Weather API request completed successfully with real data',
        attributes: {
          station_id: stationId,
          station_name: station.name,
          temperature: weatherData.temperature,
          description: weatherData.description,
          duration_ms: duration
        },
      });

      weatherRequestCounter.add(1, { status: 'success', data_type: 'real' });
      weatherRequestDuration.record(duration, { status: 'success', data_type: 'real' });

      return NextResponse.json({
        ...weatherData,
        isMockData: false
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200'
        }
      });

    } catch (error) {
      const duration = Date.now() - startTime;

      span.recordException(error as Error);

      logger.emit({
        severityNumber: SeverityNumber.ERROR,
        severityText: 'ERROR',
        body: 'Weather API error, falling back to mock data',
        attributes: {
          station_id: stationId,
          station_name: station?.name,
          error: (error as Error).message,
          duration_ms: duration
        },
      });

      // Return mock data as fallback
      const mockWeather = generateMockWeather(station.coordinates.lat);

      span.setAttributes({
        'weather.is_mock_data': true,
        'weather.is_fallback': true,
        'weather.temperature': mockWeather.temperature,
        'http.status_code': 200,
      });

      span.setStatus({ code: SpanStatusCode.OK }); // Still successful response, just with fallback data

      weatherRequestCounter.add(1, { status: 'success', data_type: 'fallback' });
      weatherRequestDuration.record(duration, { status: 'success', data_type: 'fallback' });

      return NextResponse.json(
        {
          ...mockWeather,
          isMockData: true
        },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=300'
          }
        }
      );
    } finally {
      span.end();
    }
  });
}

// Generate mock weather data based on latitude (SF is cooler, SJ is warmer)
function generateMockWeather(lat: number): WeatherData {
  // SF is ~37.77, SJ is ~37.33 - temperature gradient
  const baseTemp = 65 + (37.77 - lat) * 20; // Warmer as you go south
  const temp = Math.round(baseTemp + Math.random() * 5);

  const conditions = [
    { description: 'clear sky', icon: '01d' },
    { description: 'few clouds', icon: '02d' },
    { description: 'partly cloudy', icon: '03d' },
    { description: 'overcast clouds', icon: '04d' }
  ];

  const condition = conditions[Math.floor(Math.random() * conditions.length)];

  return {
    temperature: temp,
    description: condition.description,
    icon: condition.icon,
    windSpeed: Math.round(5 + Math.random() * 10),
    humidity: Math.round(50 + Math.random() * 30)
  };
}

/*
  TO USE REAL WEATHER API:

  1. Get OpenWeatherMap API key:
     - Sign up at https://openweathermap.org/api
     - Free tier: 1000 calls/day, 60 calls/minute

  2. Add to .env.local:
     WEATHER_API_KEY=your_api_key_here

  3. The code above will automatically use the real API when the key is present
*/
