import { NextRequest, NextResponse } from 'next/server';
import { WeatherData } from '@/lib/types';
import { getStationById } from '@/lib/stations';
import { celsiusToFahrenheit, mpsToMph } from '@/lib/utils';
import { fetchWeatherAPI, handleAPIError, createCacheKey } from '@/lib/api-utils';
import { cached, CacheConfigs, getCachedSync } from '@/lib/cache-utils';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const stationId = searchParams.get('station');

  if (!stationId) {
    return NextResponse.json(
      { error: 'Station ID is required' },
      { status: 400 }
    );
  }

  const station = getStationById(stationId);
  if (!station) {
    return NextResponse.json(
      { error: 'Invalid station ID' },
      { status: 400 }
    );
  }

  try {
    // Check if API key is configured
    if (!process.env.WEATHER_API_KEY) {
      console.log('Using mock weather data - configure WEATHER_API_KEY for real weather');
      return NextResponse.json(
        {
          ...generateMockWeather(station.coordinates.lat),
          isMockData: true
        },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200'
          }
        }
      );
    }

    // Fetch weather from OpenWeatherMap API with timeout and caching
    const apiKey = process.env.WEATHER_API_KEY;
    const { lat, lng } = station.coordinates;
    const cacheKey = createCacheKey('weather', stationId, lat.toString(), lng.toString());

    const data = await cached(cacheKey, async () => {
      return await fetchWeatherAPI(lat, lng, apiKey, { timeout: 5000 });
    }, CacheConfigs.WEATHER);

    const weatherData: WeatherData = {
      temperature: celsiusToFahrenheit(data.main.temp),
      description: data.weather[0].description,
      icon: data.weather[0].icon,
      windSpeed: mpsToMph(data.wind.speed),
      humidity: data.main.humidity
    };

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

    // Try to get cached data as fallback
    const cacheKey = createCacheKey('weather', stationId, station.coordinates.lat.toString(), station.coordinates.lng.toString());
    const cachedData = getCachedSync<any>(cacheKey);

    if (cachedData) {
      console.log('Using cached weather data as fallback');
      const weatherData: WeatherData = {
        temperature: celsiusToFahrenheit(cachedData.main.temp),
        description: cachedData.weather[0].description,
        icon: cachedData.weather[0].icon,
        windSpeed: mpsToMph(cachedData.wind.speed),
        humidity: cachedData.main.humidity
      };

      return NextResponse.json({
        ...weatherData,
        isMockData: false,
        isStaleData: true
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=300'
        }
      });
    }

    // Return mock data as final fallback
    return NextResponse.json(
      {
        ...generateMockWeather(station.coordinates.lat),
        isMockData: true
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300'
        }
      }
    );
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
