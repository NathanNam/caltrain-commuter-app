// Complete list of Caltrain stations, north to south, with coordinates and the
// GTFS stop_ids of both platforms (…1 = northbound, …2 = southbound in
// Caltrain's feed; Stanford uses 2537740/2537744). Schedules are looked up by
// these ids, so every station listed here gets real timetable data.
import { Station } from './types';

export const stations: Station[] = [
  {
    id: 'sf',
    name: 'San Francisco (4th & King)',
    code: 'SF',
    coordinates: { lat: 37.7765, lng: -122.3943 },
    gtfsStopIds: ['70011', '70012']
  },
  {
    id: '22nd',
    name: '22nd Street',
    code: '22ND',
    coordinates: { lat: 37.7571, lng: -122.3921 },
    gtfsStopIds: ['70021', '70022']
  },
  {
    id: 'bayshore',
    name: 'Bayshore',
    code: 'BAYSHORE',
    coordinates: { lat: 37.7089, lng: -122.4015 },
    gtfsStopIds: ['70031', '70032']
  },
  {
    id: 'ssf',
    name: 'South San Francisco',
    code: 'SSF',
    coordinates: { lat: 37.6569, lng: -122.4061 },
    gtfsStopIds: ['70041', '70042']
  },
  {
    id: 'sb',
    name: 'San Bruno',
    code: 'SB',
    coordinates: { lat: 37.6309, lng: -122.4111 },
    gtfsStopIds: ['70051', '70052']
  },
  {
    id: 'mb',
    name: 'Millbrae',
    code: 'MB',
    coordinates: { lat: 37.6000, lng: -122.3867 },
    gtfsStopIds: ['70061', '70062']
  },
  {
    id: 'broadway',
    name: 'Broadway',
    code: 'BROADWAY',
    coordinates: { lat: 37.5876, lng: -122.3627 },
    gtfsStopIds: ['70071', '70072'],
    serviceNote: 'weekends only'
  },
  {
    id: 'burlingame',
    name: 'Burlingame',
    code: 'BURLINGAME',
    coordinates: { lat: 37.5793, lng: -122.3459 },
    gtfsStopIds: ['70081', '70082']
  },
  {
    id: 'sm',
    name: 'San Mateo',
    code: 'SM',
    coordinates: { lat: 37.5683, lng: -122.3244 },
    gtfsStopIds: ['70091', '70092']
  },
  {
    id: 'hayward-park',
    name: 'Hayward Park',
    code: 'HAYWARD',
    coordinates: { lat: 37.5530, lng: -122.3090 },
    gtfsStopIds: ['70101', '70102']
  },
  {
    id: 'hillsdale',
    name: 'Hillsdale',
    code: 'HILLSDALE',
    coordinates: { lat: 37.5378, lng: -122.2971 },
    gtfsStopIds: ['70111', '70112']
  },
  {
    id: 'belmont',
    name: 'Belmont',
    code: 'BELMONT',
    coordinates: { lat: 37.5206, lng: -122.2758 },
    gtfsStopIds: ['70121', '70122']
  },
  {
    id: 'sc',
    name: 'San Carlos',
    code: 'SC',
    coordinates: { lat: 37.5071, lng: -122.2603 },
    gtfsStopIds: ['70131', '70132']
  },
  {
    id: 'rw',
    name: 'Redwood City',
    code: 'RW',
    coordinates: { lat: 37.4854, lng: -122.2314 },
    gtfsStopIds: ['70141', '70142']
  },
  {
    id: 'mp',
    name: 'Menlo Park',
    code: 'MP',
    coordinates: { lat: 37.4544, lng: -122.1819 },
    gtfsStopIds: ['70161', '70162']
  },
  {
    id: 'pa',
    name: 'Palo Alto',
    code: 'PA',
    coordinates: { lat: 37.4429, lng: -122.1646 },
    gtfsStopIds: ['70171', '70172']
  },
  {
    id: 'stanford',
    name: 'Stanford',
    code: 'STANFORD',
    coordinates: { lat: 37.4294, lng: -122.1713 },
    gtfsStopIds: ['2537740', '2537744'],
    serviceNote: 'game days only'
  },
  {
    id: 'cal-ave',
    name: 'California Ave',
    code: 'CALAVEUE',
    coordinates: { lat: 37.4292, lng: -122.1421 },
    gtfsStopIds: ['70191', '70192']
  },
  {
    id: 'san-antonio',
    name: 'San Antonio',
    code: 'SANANTONIO',
    coordinates: { lat: 37.4070, lng: -122.1065 },
    gtfsStopIds: ['70201', '70202']
  },
  {
    id: 'mv',
    name: 'Mountain View',
    code: 'MV',
    coordinates: { lat: 37.3946, lng: -122.0766 },
    gtfsStopIds: ['70211', '70212']
  },
  {
    id: 'sunnyvale',
    name: 'Sunnyvale',
    code: 'SUNNYVALE',
    coordinates: { lat: 37.3784, lng: -122.0308 },
    gtfsStopIds: ['70221', '70222']
  },
  {
    id: 'lawrence',
    name: 'Lawrence',
    code: 'LAWRENCE',
    coordinates: { lat: 37.3702, lng: -121.9968 },
    gtfsStopIds: ['70231', '70232']
  },
  {
    id: 'santa-clara',
    name: 'Santa Clara',
    code: 'SANTACLARA',
    coordinates: { lat: 37.3529, lng: -121.9364 },
    gtfsStopIds: ['70241', '70242']
  },
  {
    id: 'college-park',
    name: 'College Park',
    code: 'COLLEGEPARK',
    coordinates: { lat: 37.3427, lng: -121.9145 },
    gtfsStopIds: ['70251', '70252']
  },
  {
    id: 'diridon',
    name: 'San Jose Diridon',
    code: 'DIRIDON',
    coordinates: { lat: 37.3297, lng: -121.9024 },
    gtfsStopIds: ['70261', '70262']
  },
  {
    id: 'tamien',
    name: 'Tamien',
    code: 'TAMIEN',
    coordinates: { lat: 37.3115, lng: -121.8841 },
    gtfsStopIds: ['70271', '70272']
  },
  {
    id: 'capitol',
    name: 'Capitol',
    code: 'CAPITOL',
    coordinates: { lat: 37.2880, lng: -121.8423 },
    gtfsStopIds: ['70281', '70282']
  },
  {
    id: 'blossom-hill',
    name: 'Blossom Hill',
    code: 'BLOSSOMHILL',
    coordinates: { lat: 37.2526, lng: -121.7979 },
    gtfsStopIds: ['70291', '70292']
  },
  {
    id: 'morgan-hill',
    name: 'Morgan Hill',
    code: 'MORGANHILL',
    coordinates: { lat: 37.1296, lng: -121.6504 },
    gtfsStopIds: ['70301', '70302']
  },
  {
    id: 'san-martin',
    name: 'San Martin',
    code: 'SANMARTIN',
    coordinates: { lat: 37.0858, lng: -121.6106 },
    gtfsStopIds: ['70311', '70312']
  },
  {
    id: 'gilroy',
    name: 'Gilroy',
    code: 'GILROY',
    coordinates: { lat: 37.0033, lng: -121.5666 },
    gtfsStopIds: ['70321', '70322']
  }
];

// Helper function to get station by ID
export function getStationById(id: string): Station | undefined {
  return stations.find(station => station.id === id);
}

// Helper function to get station by name
export function getStationByName(name: string): Station | undefined {
  return stations.find(station => station.name === name);
}
