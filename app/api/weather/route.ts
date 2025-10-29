import { NextRequest, NextResponse } from 'next/server';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { WeatherData } from '@/lib/types';
import { getStationById } from '@/lib/stations';
import { celsiusToFahrenheit, mpsToMph } from '@/lib/utils';
import { logger } from '@/otel-server';

export async function GET(request: NextRequest) {
  const tracer = trace.getTracer('caltrain-commuter-app');
  const span = tracer.startSpan('weather.get');

  const searchParams = request.nextUrl.searchParams;
  const stationId = searchParams.get('station');

  try {

    span.setAttributes({
      'http.method': 'GET',
      'http.route': '/api/weather',
      'weather.station_id': stationId || 'unknown',
    });

    logger.emit({
      severityNumber: SeverityNumber.INFO,
      severityText: "INFO",
      body: "Weather request received",
      attributes: {
        stationId: stationId || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown'
      },
    });

    if (!stationId) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Station ID is required' });
      logger.emit({
        severityNumber: SeverityNumber.WARN,
        severityText: "WARN",
        body: "Weather request missing station ID",
      });
      return NextResponse.json(
        { error: 'Station ID is required' },
        { status: 400 }
      );
    }

    const station = getStationById(stationId);
    if (!station) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Invalid station ID' });
      logger.emit({
        severityNumber: SeverityNumber.WARN,
        severityText: "WARN",
        body: "Invalid station ID provided for weather",
        attributes: { stationId },
      });
      return NextResponse.json(
        { error: 'Invalid station ID' },
        { status: 400 }
      );
    }

    span.setAttributes({
      'weather.station_name': station.name,
      'weather.coordinates.lat': station.coordinates.lat,
      'weather.coordinates.lng': station.coordinates.lng,
    });

    // Check if API key is configured
    if (!process.env.WEATHER_API_KEY) {
      console.log('Using mock weather data - configure WEATHER_API_KEY for real weather');
      span.setAttributes({
        'weather.data_source': 'mock',
        'weather.api_key_configured': false,
      });
      logger.emit({
        severityNumber: SeverityNumber.INFO,
        severityText: "INFO",
        body: "Using mock weather data - API key not configured",
        attributes: { stationId, stationName: station.name },
      });

      const mockWeather = generateMockWeather(station.coordinates.lat);
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();

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

    // Fetch weather from OpenWeatherMap API
    const apiKey = process.env.WEATHER_API_KEY;
    const { lat, lng } = station.coordinates;

    span.setAttributes({
      'weather.data_source': 'openweathermap',
      'weather.api_key_configured': true,
    });

    const weatherSpan = tracer.startSpan('weather.fetch_openweathermap');
    weatherSpan.setAttributes({
      'weather.api.provider': 'openweathermap',
      'weather.api.lat': lat,
      'weather.api.lng': lng,
    });

    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`,
      { next: { revalidate: 600 } } // Cache for 10 minutes
    );

    weatherSpan.setAttributes({
      'weather.api.response.status': response.status,
      'weather.api.response.ok': response.ok,
    });

    if (!response.ok) {
      weatherSpan.setStatus({ code: SpanStatusCode.ERROR, message: `Weather API returned ${response.status}` });
      weatherSpan.end();
      throw new Error(`Weather API returned ${response.status}`);
    }

    const data = await response.json();
    weatherSpan.setStatus({ code: SpanStatusCode.OK });
    weatherSpan.end();

    const weatherData: WeatherData = {
      temperature: celsiusToFahrenheit(data.main.temp),
      description: data.weather[0].description,
      icon: data.weather[0].icon,
      windSpeed: mpsToMph(data.wind.speed),
      humidity: data.main.humidity
    };

    span.setAttributes({
      'weather.temperature': weatherData.temperature,
      'weather.description': weatherData.description,
      'weather.humidity': weatherData.humidity,
    });

    span.setStatus({ code: SpanStatusCode.OK });
    logger.emit({
      severityNumber: SeverityNumber.INFO,
      severityText: "INFO",
      body: "Weather data fetched successfully",
      attributes: {
        stationId,
        stationName: station.name,
        temperature: weatherData.temperature,
        description: weatherData.description,
        source: 'openweathermap'
      },
    });

    return NextResponse.json({
      ...weatherData,
      isMockData: false
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200'
      }
    });

  } catch (error) {
    console.error('Weather API error:', error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
    logger.emit({
      severityNumber: SeverityNumber.ERROR,
      severityText: "ERROR",
      body: "Weather API error, falling back to mock data",
      attributes: {
        error: (error as Error).message,
        stationId: stationId || 'unknown',
        fallback: 'mock_data'
      },
    });

    // Return mock data as fallback - need to get station again since it's in try block
    const station = getStationById(stationId!);
    const mockWeather = generateMockWeather(station?.coordinates.lat || 37.7749);
    span.setAttributes({
      'weather.data_source': 'mock_fallback',
      'weather.error': (error as Error).message,
    });

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
