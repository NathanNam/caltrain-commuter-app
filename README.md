# Caltrain Commuter App

A Next.js web application that helps Caltrain commuters plan their trips by providing real-time train schedules and weather information at both origin and destination stations.

![Caltrain Commuter](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38bdf8)

## Features

- **Station Selection**: Choose from all 32 Caltrain stations with easy swap functionality
- **Train Schedules**: View next 5 upcoming trains with departure/arrival times and durations
- **Weather Information**: See current weather for both origin and destination stations
- **Event Crowding Alerts**: See upcoming events at major SF venues that may cause crowding 🏟️
  - Oracle Park (SF Giants)
  - Chase Center (Warriors, Concerts)
  - Moscone Center (Tech conferences, conventions - Dreamforce, WWDC, etc.)
  - Bill Graham Civic Auditorium
  - The Fillmore, The Masonic, Warfield Theatre
  - And more concert venues near 4th & King
- **Saved Routes**: Save up to 5 frequently used routes for quick access
- **Service Alerts**: Display important service disruptions and notices
- **Auto-Refresh**: Data updates automatically (trains every 60s, weather every 10 min, events every 30 min)
- **Responsive Design**: Mobile-first design that works on all devices

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **APIs**: 511.org Transit API (optional), OpenWeatherMap API (optional)
- **Storage**: localStorage for saved routes

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

## API Configuration

The app works with **mock data** out of the box. To enable real-time data:

### 511.org Transit API (for train schedules)

1. Register for a free API key at [https://511.org/open-data/token](https://511.org/open-data/token)
2. Add to `.env.local` as `TRANSIT_API_KEY`
3. Update [app/api/trains/route.ts](app/api/trains/route.ts) to use real API (see comments in file)

### OpenWeatherMap API (for weather)

1. Register for a free API key at [https://openweathermap.org/api](https://openweathermap.org/api)
2. Add to `.env.local` as `WEATHER_API_KEY`
3. The weather API will automatically use real data when the key is present

### Event Data APIs (for venue events - optional, multiple options)

**Option 1: Ticketmaster API** (RECOMMENDED - instant approval) ⭐
1. Register at [https://developer.ticketmaster.com/](https://developer.ticketmaster.com/)
2. Get your **Consumer Key** instantly after registration (no approval wait!)
3. Copy the **Consumer Key** (NOT the Consumer Secret) to `.env.local` as `TICKETMASTER_API_KEY`
4. Free tier: 5000 API calls/day
5. **Covers ALL events**: Sports, concerts, conventions at 9+ SF venues including:
   - Oracle Park (SF Giants games)
   - Chase Center (Warriors games, major concerts)
   - Moscone Center (tech conferences, conventions - Dreamforce, WWDC, etc.)
   - Bill Graham Civic Auditorium (large concerts)
   - The Fillmore, The Masonic, Warfield Theatre (music venues)
   - August Hall, Regency Ballroom (concerts)

**Option 2: MLB Stats API** (FREE - no key needed!)
1. No registration required
2. Perfect for SF Giants games at Oracle Park
3. Official MLB API: `https://statsapi.mlb.com`

**Option 3: NBA API** (FREE - no key needed!)
1. No registration required
2. Perfect for Golden State Warriors games at Chase Center
3. Official NBA stats API

**Option 4: SeatGeek API** (requires approval)
1. Register at [https://platform.seatgeek.com/](https://platform.seatgeek.com/)
2. Wait for approval (can take a few days)
3. Add to `.env.local` as `SEATGEEK_CLIENT_ID` and `SEATGEEK_CLIENT_SECRET`

See [app/api/events/route.ts](app/api/events/route.ts) for detailed implementation examples for each API.

### Quick Start: Get Your Ticketmaster API Key

The fastest way to enable event crowding alerts:

1. Go to [https://developer.ticketmaster.com/](https://developer.ticketmaster.com/)
2. Click "Get Your API Key" or "Sign Up"
3. Create a free account
4. You'll instantly receive your **Consumer Key** (no waiting for approval!)
5. Copy the **Consumer Key** (NOT the Consumer Secret)
6. Add to your `.env.local` file:
   ```
   TICKETMASTER_API_KEY=your_consumer_key_here
   ```
7. Restart your development server: `npm run dev`
8. Events will now appear automatically! 🎉

## Project Structure

```
caltrain-commuter-app-no-instrumentation/
├── app/
│   ├── api/
│   │   ├── trains/route.ts      # Train schedule API endpoint
│   │   ├── weather/route.ts     # Weather data API endpoint
│   │   └── events/route.ts      # Venue events API endpoint
│   ├── layout.tsx               # Root layout with header/footer
│   ├── page.tsx                 # Main dashboard page
│   └── globals.css              # Global styles
├── components/
│   ├── StationSelector.tsx      # Origin/destination selector
│   ├── TrainList.tsx            # Train schedule display
│   ├── WeatherWidget.tsx        # Weather information
│   ├── VenueEvents.tsx          # Event crowding alerts
│   ├── ServiceAlerts.tsx        # Service alerts display
│   └── SavedRoutes.tsx          # Saved routes manager
├── lib/
│   ├── stations.ts              # All 32 Caltrain stations data
│   ├── types.ts                 # TypeScript interfaces
│   └── utils.ts                 # Utility functions
└── public/
    └── icons/                   # Weather icons (if needed)
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## Features Roadmap

### ✅ Phase 1 - MVP (Complete)
- Station selection with all 32 stations
- Next 5 trains display
- Weather for origin and destination
- Saved routes (up to 5)
- Service alerts
- Auto-refresh functionality
- Responsive design

### 🚧 Phase 2 - Enhancements (Future)
- Real-time train tracking
- Push notifications
- Historical delay data
- Bike car availability
- Multi-leg journey planning

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
- Train data powered by Caltrain and 511.org
- Weather data powered by OpenWeatherMap
- Icons from Heroicons

## Support

For issues and questions, please open an issue on GitHub.

---

**Note**: This app currently uses mock data for train schedules. Configure API keys for real-time data.
