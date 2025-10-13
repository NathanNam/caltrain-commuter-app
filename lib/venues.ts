// Major event venues near Caltrain stations
import { Venue } from './types';

export const venues: Venue[] = [
  // Oracle Park - SF Giants Stadium
  {
    id: 'oracle-park',
    name: 'Oracle Park',
    nearestStation: 'sf', // 4th & King - walking distance
    address: '24 Willie Mays Plaza, San Francisco, CA 94107'
  },

  // Chase Center - Warriors & Concerts
  {
    id: 'chase-center',
    name: 'Chase Center',
    nearestStation: 'sf', // 4th & King or 22nd Street
    address: '1 Warriors Way, San Francisco, CA 94158'
  },

  // Bill Graham Civic Auditorium - Major concerts
  {
    id: 'bill-graham',
    name: 'Bill Graham Civic Auditorium',
    nearestStation: 'sf', // 4th & King
    address: '99 Grove St, San Francisco, CA 94102'
  },

  // The Masonic - Concerts
  {
    id: 'the-masonic',
    name: 'The Masonic',
    nearestStation: 'sf',
    address: '1111 California St, San Francisco, CA 94108'
  },

  // The Fillmore - Music venue
  {
    id: 'the-fillmore',
    name: 'The Fillmore',
    nearestStation: 'sf',
    address: '1805 Geary Blvd, San Francisco, CA 94115'
  },

  // Warfield Theatre - Concerts
  {
    id: 'warfield',
    name: 'Warfield Theatre',
    nearestStation: 'sf',
    address: '982 Market St, San Francisco, CA 94102'
  },

  // August Hall - Music venue
  {
    id: 'august-hall',
    name: 'August Hall',
    nearestStation: 'sf',
    address: '420 Mason St, San Francisco, CA 94102'
  },

  // Regency Ballroom - Concerts
  {
    id: 'regency-ballroom',
    name: 'Regency Ballroom',
    nearestStation: 'sf',
    address: '1300 Van Ness Ave, San Francisco, CA 94109'
  },

  // Moscone Center - Major conventions, tech events (WWDC, Dreamforce, etc.)
  {
    id: 'moscone-center',
    name: 'Moscone Center',
    nearestStation: 'sf', // 4th & King - walkable or one stop on Muni
    address: '747 Howard St, San Francisco, CA 94103'
  }
];

// Ticketmaster Venue IDs (to be used with Ticketmaster API)
// These are the actual Ticketmaster venue IDs for API calls
export const ticketmasterVenueIds = {
  'oracle-park': 'KovZpZAEAJvA',
  'chase-center': 'KovZpZAJ7dEA',
  'bill-graham': 'KovZpZAEdFtJ',
  'the-masonic': 'KovZpZAE6F6A',
  'the-fillmore': 'KovZpZAEAleA',
  'warfield': 'KovZpZAEAv6A',
  'august-hall': 'KovZ9177J2k', // Verify this ID
  'regency-ballroom': 'KovZpZAEAlFA',
  'moscone-center': 'KovZpZAEAaIA' // Moscone Center - conventions & tech events
};

// Helper function to get venue by ID
export function getVenueById(id: string): Venue | undefined {
  return venues.find(venue => venue.id === id);
}

// Get all venues for a specific station
export function getVenuesByStation(stationId: string): Venue[] {
  return venues.filter(venue => venue.nearestStation === stationId);
}
