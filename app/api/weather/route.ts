import { NextRequest, NextResponse } from 'next/server';
import { WeatherData } from '@/lib/types';
import { getStationById } from '@/lib/stations';
import { celsiusToFahrenheit, mpsToMph } from '@/lib/utils';

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
      console.warn('WEATHER_API_KEY not configured, using mock data');
      return NextResponse.json(
        generateMockWeather(station.coordinates.lat),
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

    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`,
      { next: { revalidate: 600 } } // Cache for 10 minutes
    );

    if (!response.ok) {
      throw new Error(`Weather API returned ${response.status}`);
    }

    const data = await response.json();

    const weatherData: WeatherData = {
      temperature: celsiusToFahrenheit(data.main.temp),
      description: data.weather[0].description,
      icon: data.weather[0].icon,
      windSpeed: mpsToMph(data.wind.speed),
      humidity: data.main.humidity
    };

    return NextResponse.json(weatherData, {
      headers: {
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200'
      }
    });

  } catch (error) {
    console.error('Weather API error:', error);
    // Return mock data as fallback
    return NextResponse.json(
      generateMockWeather(station.coordinates.lat),
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
