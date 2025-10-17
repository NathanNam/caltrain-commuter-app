# Caltrain Commuter App

A Next.js web application that helps Caltrain commuters plan their trips by providing real-time train schedules, delay tracking, weather information, and event crowding alerts for a better commuting experience.

![Caltrain Commuter](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38bdf8)

## 🚀 Live Demo

**Try it now:** [https://caltrain-commuter.observe-demo.com/](https://caltrain-commuter.observe-demo.com/)

The live demo is fully functional with real-time features enabled!

## 📸 Screenshots

<div align="center">
  <img src="images/screenshot_01.png" alt="Caltrain Commuter App - Main Dashboard" width="800"/>
  <p><em>Main dashboard showing train schedules, weather, and saved routes</em></p>

  <img src="images/screenshot_02.png" alt="Caltrain Commuter App - Real-time Features" width="800"/>
  <p><em>Real-time delay tracking and event crowding alerts</em></p>
</div>

## Overview

This app provides comprehensive real-time information for Caltrain commuters across 25 main Caltrain stations from San Francisco to San Jose Diridon. Key capabilities include:

- 🚆 **Real-time train delays** via 511.org GTFS-Realtime API
- 🌤️ **Live weather** for origin and destination stations
- 🎫 **Event crowding alerts** for 9+ SF venues (Oracle Park, Chase Center, Moscone, etc.)
- 📍 **25 main Caltrain stations** with GPS coordinates (excluding South County Connector stations)
- 💾 **Save up to 5 routes** for quick access
- 🔄 **Auto-refresh** with optimized caching

**Ready to use immediately** - Works with mock data out of the box, configure API keys for real-time features.

## Features

- **Station Selection**: Choose from 25 main Caltrain stations (SF to San Jose Diridon) with easy swap functionality
  - **Note**: South County Connector stations (Tamien, Capitol, Blossom Hill, Morgan Hill, San Martin, Gilroy) are excluded as they're served by a separate 8XX bus service with limited schedule
- **Train Schedules**: View next 5 upcoming trains with departure/arrival times and durations
  - **Schedule-aware**: Automatically adjusts for weekday, weekend, and holiday schedules
  - Weekday peak hours: More frequent trains (every 20 mins)
  - Weekends: Reduced frequency (every 45 mins)
  - Holidays: Special holiday schedule (every 60 mins)
- **Real-Time Delay Tracking**: See live train delays and on-time status 🚦
  - Visual indicators for on-time, delayed, early, or cancelled trains
  - Delay duration displayed in minutes
  - Color-coded status badges (green = on-time, orange = delayed, red = cancelled)
- **Weather Information**: See current weather for both origin and destination stations
- **Event Crowding Alerts**: See upcoming events at major SF Bay Area venues that may cause crowding 🏟️
  - **Automatically updated** - Moscone events fetched at runtime every 24 hours
  - Oracle Park (SF Giants) - affects SF, 22nd, Bayshore stations
  - Chase Center (Warriors, Concerts) - affects SF, 22nd stations
  - Moscone Center (Tech conferences, conventions - automatically fetched!)
    - Dreamforce, Microsoft Ignite, TechCrunch Disrupt, PyTorch Conference, and more
  - SAP Center (San Jose Sharks, Concerts) - affects Diridon station
  - Levi's Stadium (SF 49ers, Major Concerts) - affects Santa Clara station
  - Bill Graham Civic Auditorium
  - The Fillmore, The Masonic, Warfield Theatre
  - And more concert venues near 4th & King
- **Saved Routes**: Save up to 5 frequently used routes for quick access
- **Service Alerts**: Real-time service disruptions and notices from 511.org
- **Auto-Refresh**: Data updates automatically (trains every 30s, weather every 10 min, events every 30 min, alerts every 5 min)
- **Responsive Design**: Mobile-first design that works on all devices

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **APIs**:
  - 511.org Transit API (GTFS-Realtime for train delays & alerts)
  - OpenWeatherMap API (weather data)
  - Ticketmaster Discovery API (event crowding alerts)
  - SF Travel Convention Calendar (Moscone events - automatically scraped at runtime)
- **Data Format**: GTFS-Realtime Protocol Buffers
- **Storage**: localStorage for saved routes
- **Event Fetching**: Runtime web scraping with 24-hour caching

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd caltrain-commuter-app-no-instrumentation
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables (optional for real data):
```bash
cp .env.local.example .env.local
```

Edit `.env.local` and add your API keys:
```
# Transit data (optional)
TRANSIT_API_KEY=your_511_api_key_here

# Weather data (optional)
WEATHER_API_KEY=your_openweathermap_api_key_here

# Event crowding alerts (optional - but recommended!)
TICKETMASTER_API_KEY=your_consumer_key_here
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Real-Time Data Status

| Feature | Current Status | Data Source | API Key Required |
|---------|---------------|------------|------------------|
| **Train Schedules** | ✅ Real schedules (from local GTFS) | Official Caltrain timetables | None (local files) |
| **Train Delays** | Ready for real-time | 511.org GTFS-Realtime | `TRANSIT_API_KEY` |
| **Service Alerts** | Ready for real-time | 511.org API | `TRANSIT_API_KEY` |
| **Weather** | Ready for real-time | OpenWeatherMap | `WEATHER_API_KEY` |
| **Event Crowding** | Ready for real-time | Ticketmaster API | `TICKETMASTER_API_KEY` |

**The app uses REAL Caltrain schedules out of the box!**

- Train times come from official GTFS data (stored in `/data/gtfs/`)
- No API key needed for schedules - works offline
- Configure API keys to add real-time delays, weather, and events

## API Configuration

### Quick Setup Summary

Add these to your `.env.local` file to enable all real-time features:

```bash
# 511.org - For real train schedules, delays, and service alerts
TRANSIT_API_KEY=your_511_api_key_here

# OpenWeatherMap - For real weather data
WEATHER_API_KEY=your_openweathermap_api_key_here

# Ticketmaster - For event crowding alerts
TICKETMASTER_API_KEY=your_consumer_key_here
```

### Detailed Setup Instructions

### 511.org Transit API (for train schedules and delays)

1. Register for a free API key at [https://511.org/open-data/token](https://511.org/open-data/token)
2. Add to `.env.local` as `TRANSIT_API_KEY`
3. The app automatically uses real data when the key is present, including:
   - **GTFS Static Schedule**: Real Caltrain timetables (weekday/weekend/holiday schedules)
   - **GTFS-Realtime Trip Updates**: Real-time delay information for all trains
   - **Service Alerts**: Live service disruptions and notices

**What you get with TRANSIT_API_KEY configured:**
- ✅ **Real Caltrain schedules** from official GTFS data
  - Actual train times based on Caltrain's published timetables
  - Automatic weekday, weekend, and holiday schedule detection
  - Correct train numbers and service patterns
- ✅ **Real-time train delay tracking** (delays shown in minutes)
- ✅ **On-time status indicators** (on-time, delayed, cancelled)
- ✅ **Service alert notifications** (track maintenance, schedule changes)
- ✅ **24-hour schedule caching** (efficient data usage)
- ✅ **Updates every 30 seconds** for maximum accuracy

**Without the API key:** The app uses real Caltrain schedules from local GTFS files (no delays shown, schedule only)

### OpenWeatherMap API (for weather)

1. Register for a free API key at [https://openweathermap.org/api](https://openweathermap.org/api)
   - Free tier: 1,000 calls/day, 60 calls/minute
2. Add to `.env.local` as `WEATHER_API_KEY`
3. The app automatically uses real weather data when the key is present

**What you get with WEATHER_API_KEY configured:**
- ✅ Real-time weather for each Caltrain station (using GPS coordinates)
- ✅ Temperature, conditions, wind speed, humidity
- ✅ Updates every 10 minutes
- ✅ Automatic fallback to mock data if API fails

**Without the API key:** The app generates realistic mock weather data based on station latitude

### Ticketmaster API (for event crowding alerts)

**RECOMMENDED** - Instant approval, comprehensive coverage ⭐

1. Register at [https://developer.ticketmaster.com/](https://developer.ticketmaster.com/)
2. Get your **Consumer Key** instantly after registration (no approval wait!)
3. Copy the **Consumer Key** (NOT the Consumer Secret) to `.env.local` as `TICKETMASTER_API_KEY`
4. Restart dev server

**What you get with TICKETMASTER_API_KEY configured:**
- ✅ Real-time events from **11+ major SF Bay Area venues**:
  - **San Francisco:**
    - Oracle Park (SF Giants games)
    - Chase Center (Warriors games, major concerts)
    - Moscone Center (tech conferences: Dreamforce, WWDC, etc.)
    - Bill Graham Civic Auditorium (large concerts)
    - The Fillmore, The Masonic, Warfield Theatre (music venues)
    - August Hall, Regency Ballroom (concerts)
  - **South Bay:**
    - SAP Center (San Jose Sharks games, concerts)
    - Levi's Stadium (SF 49ers games, major concerts)
- ✅ Automatic crowd level detection (high/moderate/low)
- ✅ Smart affected station mapping (shows which Caltrain stations are impacted)
- ✅ Updates every 30 minutes
- ✅ Free tier: 5,000 API calls/day

**Without the API key:** No event crowding alerts are shown

### Alternative Event APIs (optional)

**MLB Stats API** (FREE - no key needed!)
- No registration required
- Perfect for SF Giants games at Oracle Park only
- Official MLB API: `https://statsapi.mlb.com`

**NBA API** (FREE - no key needed!)
- No registration required
- Perfect for Golden State Warriors games at Chase Center only
- Official NBA stats API

**SeatGeek API** (requires approval)
- Register at [https://platform.seatgeek.com/](https://platform.seatgeek.com/)
- Wait for approval (can take a few days)
- Limited coverage

**Note:** See [app/api/events/route.ts](app/api/events/route.ts) for detailed implementation examples. Ticketmaster is recommended as it provides the most comprehensive coverage with instant approval.

### Moscone Center Events (Fully Automatic) ✨

**Important:** Many Moscone Center events (conventions, conferences) are NOT listed on Ticketmaster because they don't sell tickets publicly.

#### How It Works - Zero Maintenance Required!

The app **automatically fetches** Moscone events at runtime:

1. **Ticketmaster API** - Concerts, sports, public events (if API key configured)
2. **Moscone Events** - **Automatically fetched from SF Travel at runtime** (cached for 24 hours)
3. **Chase Center Events** - Manually maintained list (optional, for Warriors games)

#### Automatic Runtime Fetching

Moscone events are now **fetched automatically** every 24 hours:

✅ **No scripts to run** - Events update automatically
✅ **No manual maintenance** - App scrapes SF Travel convention calendar
✅ **24-hour cache** - Minimizes requests, stays fresh
✅ **Always up-to-date** - New events appear automatically
✅ **Zero effort** - Just deploy and forget!

**How it works:**
- App fetches from https://portal.sftravel.com/calendar_public/home_sfdc.cfm
- Parses upcoming Moscone conventions (next 6 months)
- Caches results for 24 hours
- Automatically refreshes when cache expires
- Falls back to stale cache if fetch fails

#### Optional: Manual Script (Not Needed)

If you prefer to pre-generate events, you can optionally run:

```bash
# Optional - only if you want to pre-generate events
node scripts/update-moscone-events-auto.mjs
```

**But you don't need to!** The app handles everything automatically.

**Currently tracked events (automatically updated):**
- Dreamforce 2025 (Oct 14-16) - 170K attendees
- PyTorch Conference 2025 (Oct 21-23) - 30K attendees
- TechCrunch Disrupt 2025 (Oct 27-29) - 80K attendees
- Microsoft Ignite 2025 (Nov 17-21) - 150K attendees
- And ~15+ more events automatically

**Why this matters:** Major conventions can bring 100K+ attendees and cause severe crowding at 4th & King and 22nd Street stations during peak commute hours. The app automatically tracks these to help you plan your commute.

## Project Structure

```
caltrain-commuter-app-no-instrumentation/
├── app/
│   ├── api/
│   │   ├── trains/route.ts      # Train schedule API endpoint with real-time delays
│   │   ├── weather/route.ts     # Weather data API endpoint
│   │   ├── events/route.ts      # Venue events API endpoint
│   │   └── alerts/route.ts      # Service alerts API endpoint
│   ├── layout.tsx               # Root layout with header/footer
│   ├── page.tsx                 # Main dashboard page
│   └── globals.css              # Global styles
├── components/
│   ├── StationSelector.tsx      # Origin/destination selector
│   ├── TrainList.tsx            # Train schedule display with delay indicators
│   ├── WeatherWidget.tsx        # Weather information
│   ├── VenueEvents.tsx          # Event crowding alerts
│   ├── ServiceAlerts.tsx        # Real-time service alerts display
│   └── SavedRoutes.tsx          # Saved routes manager
├── lib/
│   ├── stations.ts              # All 31 Caltrain stations data
│   ├── types.ts                 # TypeScript interfaces
│   ├── utils.ts                 # Utility functions
│   ├── venues.ts                # Venue data for event tracking
│   ├── moscone-events-fetcher.ts # Runtime Moscone events fetcher (auto-updates every 24h)
│   ├── moscone-events.ts        # Legacy static Moscone events (no longer used)
│   ├── chase-center-events.ts   # Chase Center events (Warriors, concerts)
│   ├── gtfs-static.ts           # GTFS Static schedule parser
│   └── gtfs-realtime.ts         # GTFS-Realtime API utilities
├── scripts/
│   ├── README.md                # Documentation for helper scripts
│   └── update-moscone-events.mjs # Script to update Moscone events monthly
├── data/
│   └── gtfs/                    # Official Caltrain GTFS schedule data
│       ├── calendar.txt         # Service calendar (weekday/weekend)
│       ├── calendar_dates.txt   # Holiday exceptions
│       ├── trips.txt            # Train trips
│       ├── stop_times.txt       # Actual train times
│       └── stops.txt            # Station stops
├── images/                      # Screenshots
└── public/
    └── icons/                   # Weather icons (if needed)
```

## GTFS Schedule Data

The app includes official Caltrain schedule data in the `/data/gtfs/` directory:

**Source**: [https://data.trilliumtransit.com/gtfs/caltrain-ca-us/caltrain-ca-us.zip](https://data.trilliumtransit.com/gtfs/caltrain-ca-us/caltrain-ca-us.zip)

**What's included**:
- ✅ **Real train times** from Caltrain's official timetables
- ✅ **Actual train numbers** (123, 125, 127, etc.)
- ✅ **Weekday/weekend/holiday schedules** automatically detected
- ✅ **Schedule data for 31 Caltrain stations** (SF to Gilroy)
  - App allows selection of 25 main stations (SF to San Jose Diridon)
  - South County stations excluded from UI as they're served by 8XX bus connector
- ✅ **Works offline** - no API key required for basic schedules

**Updating the schedule**:
```bash
# Download latest GTFS data
curl -L -o /tmp/caltrain-gtfs.zip https://data.trilliumtransit.com/gtfs/caltrain-ca-us/caltrain-ca-us.zip

# Extract to data directory
unzip -q /tmp/caltrain-gtfs.zip -d data/gtfs/
```

**Note**: GTFS data is typically updated when Caltrain changes their schedule (usually quarterly). The app automatically detects which schedule to use based on the current date.

## Available Scripts

### Development & Build
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

### Maintenance Scripts
- `node scripts/update-moscone-events-auto.mjs` - **Optional** manual Moscone events update
  - **Not needed** - Moscone events now fetch automatically at runtime!
  - Only use if you want to pre-generate events or test the scraper
  - See [scripts/README.md](scripts/README.md) for details

## Features Roadmap

### ✅ Phase 1 - MVP (Complete)
- Station selection with 25 main stations
- Next 5 trains display
- Weather for origin and destination
- Saved routes (up to 5)
- Service alerts
- Auto-refresh functionality
- Responsive design

### ✅ Phase 2 - Real-Time Features (Complete)
- ✅ Real-time train delay tracking via GTFS-Realtime
- ✅ Service alerts from 511.org API
- ✅ Event crowding alerts for 9+ SF venues
- ✅ Visual delay indicators and status badges
- ✅ Automatic Moscone events fetching (runtime scraping with 24h cache)

### 🚧 Phase 3 - Advanced Features (Future)
- Push notifications for delays
- Historical delay analytics
- Bike car availability tracking
- Multi-leg journey planning
- Trip planning with transfers

## Browser Support

- Chrome, Firefox, Safari, Edge (latest 2 versions)
- iOS Safari, Chrome Mobile
- Minimum viewport: 320px

## Deployment

### Deploy to Vercel (Recommended)

1. Push your code to GitHub
2. Import project on [Vercel](https://vercel.com)
3. Add environment variables in Vercel dashboard
4. Deploy!

### Other Platforms

The app can be deployed to any platform that supports Next.js:
- Netlify
- AWS Amplify
- Digital Ocean App Platform
- Self-hosted with Node.js

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

ISC

## Acknowledgments

- Built following the [Product Requirements Document](prd.md)
- Real-time train data powered by Caltrain and 511.org GTFS-Realtime feeds
- Weather data powered by OpenWeatherMap
- Event data powered by Ticketmaster Discovery API
- Icons from Heroicons

## Support

For issues and questions, please open an issue on GitHub.

---

## How Real-Time Features Work

### Train Delay Tracking

The app uses a **dual-source delay detection system** combining 511.org GTFS-Realtime with Caltrain.com alerts for maximum accuracy:

#### Layer 1: GTFS-Realtime (511.org)
1. **Trip Updates Feed**: Fetches real-time delay data every 30 seconds from 511.org
2. **Protocol Buffers**: Uses industry-standard GTFS-Realtime format for efficient data transfer
3. **Train-Specific Matching**: Each train's delay is matched by GTFS trip_id for accuracy
   - Ensures Train 421's delay is shown for Train 421 (not confused with other trains at the same station)
   - Checks maximum delay across all stops in the trip (captures delays that accumulate during the journey)
   - Matches delay information as reported by 511.org's official feed

#### Layer 2: Caltrain.com Alert Scraping (NEW!)
4. **Automated Web Scraping**: Uses Puppeteer to scrape https://www.caltrain.com/alerts in real-time
   - Parses official Caltrain PADS alerts (Passenger Alert and Display System)
   - Extracts train-specific delay information from alert text
   - Handles patterns like "Please Expect Up To 40-45 Minute Delay for Train 165"
5. **Smart Priority System**:
   - **Caltrain alerts override GTFS-RT** when GTFS-RT shows 0 delay but alerts indicate a delay
   - This solves cases where 511.org data is incomplete or stale
   - GTFS-RT still used for non-zero delays (both sources complement each other)
6. **Delay-Aware Filtering**:
   - Trains filter based on **actual departure time** (scheduled + delay), not just scheduled time
   - Delayed trains appear in schedules even if their scheduled departure has passed
   - Handles delays of any duration (including delays longer than 1 hour)

#### Display & Features
7. **Schedule Awareness**: Automatically handles different schedules:
   - **Weekday schedule**: More frequent trains during peak hours (6-9am, 4-7pm)
   - **Weekend schedule**: Reduced service on Saturdays and Sundays
   - **Holiday schedule**: Special service on major US holidays (New Year's, Memorial Day, Independence Day, Labor Day, Thanksgiving, Christmas)
   - Real-time API automatically provides correct schedule based on current date
8. **Delay Detection**:
   - Compares scheduled vs. actual times at each stop
   - **Delay threshold**: Shows trains as "delayed" when 1 minute or more late
   - Uses the maximum delay across all stops to capture delays accumulated during the journey
9. **Visual Indicators**:
   - 🟢 Green badge = On time (0 minutes delay)
   - 🟠 Orange badge = Delayed (1+ minutes - shows exact delay)
   - 🔴 Red badge = Cancelled
10. **Service Alerts**: Displays system-wide disruptions and maintenance notices

### Weather Data

- Fetches current weather from **OpenWeatherMap API** using GPS coordinates for each station
- Updates every 10 minutes
- Displays temperature, conditions, wind speed, and humidity
- Converts metric to imperial units (Celsius → Fahrenheit, m/s → mph)

### Event Crowding Alerts

- Queries **Ticketmaster Discovery API** for events at 11+ SF Bay Area venues
- Fetches events for the current day in parallel for all venues
- **Geographic filtering**: Only includes SF Bay Area venues (filters out LA, etc.)
- Intelligent crowd level detection based on:
  - Venue capacity (Oracle Park, Chase Center, Levi's Stadium, SAP Center = high)
  - Event type (sports games, major concerts)
  - Ticket prices (expensive = high crowd)
  - Special conventions (Dreamforce, WWDC at Moscone)
- **Smart station mapping**: Shows which Caltrain stations are affected by each event
  - SF venues → 4th & King, 22nd Street
  - South Bay venues → Diridon (SAP Center), Santa Clara (Levi's Stadium)
- Updates every 30 minutes

### Train Schedule Architecture

The app uses a sophisticated two-layer approach for maximum accuracy:

**Layer 1: GTFS Static Schedule (Base Timetable)**
1. Fetches official Caltrain GTFS data from Trillium Transit CDN
2. Parses `calendar.txt` and `calendar_dates.txt` to determine active service (weekday/weekend/holiday)
3. Reads `trips.txt` and `stop_times.txt` for actual train times
4. Caches schedule data for 24 hours (refreshes daily)
5. Provides baseline schedule with correct train numbers and times

**Layer 2: GTFS-Realtime (Live Updates)**
1. Fetches live trip updates from 511.org every 30 seconds
2. **Matches delays by trip_id** to ensure each train gets its own accurate delay status
3. **Checks maximum delay** across all stops in each trip (not just the first stop)
4. Applies delays to scheduled trains based on exact trip matching
5. Updates train status (on-time, delayed, cancelled) per-train
   - Trains with 0 minutes delay → "On time"
   - Trains with 1+ minutes delay → "Delayed" (shows exact minutes)
   - Cancelled trains → "Cancelled"
6. Combines with Layer 1 for complete picture

**Result**: Users see real Caltrain train numbers and schedule times, enhanced with train-specific live delay information from 511.org's official GTFS-Realtime feed.

### Data Flow Architecture

```
User Request → Next.js API Route → GTFS Static + GTFS-Realtime APIs → Data Processing → Cache → User Response
                                          ↓
                            Trillium Transit (schedules, 24h cache)
                                          +
                                 511.org (delays, 30s cache)
```

**Note**: All real-time features gracefully fall back to intelligent mock data if API keys are not configured or if APIs fail. The app is fully functional without any API keys.
