// TypeScript interfaces for Caltrain Commuter App

export interface Station {
  id: string;
  name: string;
  code: string;
  coordinates: {
    lat: number;
    lng: number;
  };
}

export interface Train {
  trainNumber: string;
  tripId?: string; // GTFS trip_id for real-time delay matching
  direction: 'Northbound' | 'Southbound';
  departureTime: string;
  arrivalTime: string;
  duration: number; // in minutes
  type: 'Local' | 'Limited' | 'Express';
  delay?: number; // delay in minutes (positive = late, negative = early)
  status?: 'on-time' | 'delayed' | 'cancelled';
  // Live vehicle position data from GTFS-RT
  vehiclePosition?: {
    latitude: number;
    longitude: number;
    bearing?: number; // Direction of travel in degrees
    speed?: number; // Speed in meters per second
    currentStatus?: 'INCOMING_AT' | 'STOPPED_AT' | 'IN_TRANSIT_TO';
    timestamp: number; // Unix timestamp when position was recorded
  };
}

export interface WeatherData {
  temperature: number; // in Fahrenheit
  description: string;
  icon: string;
  windSpeed: number; // in mph
  humidity: number; // percentage
}

export interface ServiceAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  timestamp: string;
}

export interface SavedRoute {
  id: string;
  name: string;
  originId: string;
  destinationId: string;
}

export interface RouteInfo {
  origin: Station;
  destination: Station;
}

export interface VenueEvent {
  id: string;
  venueName: string;
  eventName: string;
  eventType: 'baseball' | 'basketball' | 'concert' | 'other';
  startTime: string;
  endTime?: string;
  affectedStations: string[]; // Station IDs that may be crowded
  crowdLevel: 'low' | 'moderate' | 'high';
}

export interface Venue {
  id: string;
  name: string;
  nearestStation: string;
  address: string;
}
