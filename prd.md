# Caltrain Commuter App - Product Requirements Document (Next.js)

## 1. Overview

### 1.1 Purpose
Build a Next.js web application that helps Caltrain commuters plan their trips by providing real-time train schedules and weather information at their destination station.

### 1.2 Target Users
- Daily Caltrain commuters traveling between San Francisco and San Jose
- Occasional riders who need quick schedule information
- Bay Area residents planning trips along the Peninsula

### 1.3 Core Value Proposition
A single dashboard that answers: "When's my next train, and what's the weather like at both my origin and destination?"

## 2. Core Features

### 2.1 Station Selection
**Description:** Allow users to select origin and destination stations.

**Requirements:**
- Dropdown menus or searchable select components for both origin and destination
- List all Caltrain stations (complete station list from San Francisco to Gilroy)
- Swap button to quickly reverse origin/destination
- Input validation to prevent selecting the same station for both origin and destination

### 2.2 Next Trains Display
**Description:** Show upcoming train departures from the origin station.

**Requirements:**
- Display at least the next 5 upcoming trains
- For each train, show:
  - Departure time from origin station
  - Arrival time at destination station
  - Trip duration
  - Train direction (Northbound/Southbound)
  - Train number/type (Local/Limited/Express if available)
- Highlight the next immediate departure
- Auto-refresh every 60 seconds
- Show loading states during data fetch
- Display clear messaging if no trains are available

### 2.3 Weather Information
**Description:** Display current weather and forecast for both origin and destination stations.

**Requirements:**
- Show weather for both origin and destination stations side-by-side (or stacked on mobile)
- Current weather conditions for each station:
  - Temperature (°F)
  - Weather description (e.g., "Partly Cloudy")
  - Weather icon
  - Wind speed
  - Humidity percentage
- 3-hour forecast or next few hours for destination
- Visual weather icons/imagery
- Clearly label which weather belongs to which station
- Highlight significant weather differences between stations (e.g., "10° warmer at destination")

### 2.4 Service Alerts
**Description:** Display any service disruptions or important notices.

**Requirements:**
- Show active Caltrain service alerts if available
- Highlight delays or schedule changes
- Display advisory messages (e.g., bike car availability)
- Visually distinguish alerts by severity (info, warning, critical)

### 2.5 Saved Routes
**Description:** Allow users to save frequently used routes.

**Requirements:**
- Save up to 5 favorite routes with custom names (e.g., "Home to Work")
- Quick access buttons/cards for saved routes
- Edit and delete functionality for saved routes
- Store in browser localStorage
- Pre-populate origin and destination when selecting a saved route

## 3. Technical Requirements

### 3.1 Framework & Stack
- **Framework:** Next.js 14+ (App Router) - **REQUIRED**
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **State Management:** React hooks (useState, useEffect)
- **Data Fetching:** Next.js Server Components where possible, with client-side updates using React Query or SWR
- **Storage:** localStorage for saved routes
- **Deployment:** Vercel (recommended for Next.js apps)

**Note:** This application MUST be built using Next.js. Do not use Create React App, Vite, or any other framework.

### 3.1a Next.js Specific Features to Leverage
- **App Router** - Use the modern App Router (not Pages Router)
- **Server Components** - Fetch initial data server-side for better performance
- **API Routes** - Create `/api/trains` and `/api/weather` endpoints
- **Server Actions** (optional) - For form submissions if needed
- **Image Optimization** - Use `next/image` for weather icons
- **Metadata API** - Set proper page titles and descriptions
- **Loading States** - Use `loading.tsx` files for route-level loading UI
- **Error Handling** - Use `error.tsx` files for error boundaries

### 3.2 API Integrations

#### Caltrain Schedule Data
**Option 1: 511.org Transit API**
- Endpoint: https://api.511.org/transit/
- Requires free API key registration
- Provides real-time arrivals and GTFS data

**Option 2: Static GTFS Schedule**
- Download Caltrain GTFS feed
- Parse schedule locally for train times
- Less real-time but simpler implementation

**Implementation:**
- Create API route in Next.js (`/api/trains`)
- Cache responses appropriately
- Handle API errors gracefully

#### Weather API
**OpenWeatherMap API (Free Tier)**
- Endpoint: https://api.openweathermap.org/data/2.5/
- Requires free API key
- Use current weather and forecast endpoints
- Map each Caltrain station to lat/long coordinates

**Implementation:**
- Create API route in Next.js (`/api/weather`)
- Cache weather data for 10-15 minutes
- Store station coordinates in a configuration file

### 3.3 Station Data
Create a static configuration file with:
```typescript
interface Station {
  id: string;
  name: string;
  code: string; // For API queries
  coordinates: {
    lat: number;
    lng: number;
  };
}
```

Include all Caltrain stations (32 stations total):

**Northbound (San Francisco to Gilroy):**
- San Francisco (4th & King)
- 22nd Street
- Bayshore
- South San Francisco
- San Bruno
- Millbrae
- Broadway
- Burlingame
- San Mateo
- Hayward Park
- Hillsdale
- Belmont
- San Carlos
- Redwood City
- Atherton
- Menlo Park
- Palo Alto
- Stanford
- California Ave
- San Antonio
- Mountain View
- Sunnyvale
- Lawrence
- Santa Clara
- College Park
- San Jose Diridon
- Tamien
- Capitol
- Blossom Hill
- Morgan Hill
- San Martin
- Gilroy

### 3.4 Responsive Design
- Mobile-first approach
- Breakpoints: mobile (default), tablet (768px), desktop (1024px)
- Touch-friendly interface elements
- Optimized for quick glance on mobile devices

## 4. User Stories

### Story 1: Quick Commute Check
**As a** daily commuter  
**I want to** quickly see my next train and weather at both origin and destination  
**So that** I can decide when to leave and what to wear

**Acceptance Criteria:**
- Default landing page shows station selectors
- Selecting saved route loads data within 2 seconds
- Weather for both stations and train times are clearly visible above the fold
- Can easily compare weather conditions between origin and destination

### Story 2: Save Favorite Route
**As a** regular commuter  
**I want to** save my daily commute route  
**So that** I don't have to select stations every time

**Acceptance Criteria:**
- "Save Route" button visible after selecting stations
- Can name the saved route
- Saved route persists across browser sessions
- Can access saved route from homepage

### Story 3: Check Service Status
**As a** commuter  
**I want to** see if there are any delays  
**So that** I can adjust my travel plans

**Acceptance Criteria:**
- Service alerts displayed prominently if present
- Alerts update automatically
- Different visual treatment for different alert types

## 5. User Interface Requirements

### 5.1 Layout
- Clean, minimal design focused on information clarity
- High contrast for outdoor readability
- Large, easily tappable buttons (min 44x44px)
- Consistent spacing and typography

### 5.2 Color Scheme
- Primary: Caltrain red (#E31837) for branding
- Accent: Blue for interactive elements
- Success: Green for on-time status
- Warning: Yellow/Orange for delays
- Background: Light neutral colors

### 5.3 Components
- Station selector (dropdown/combobox)
- Train card showing departure info
- Weather widget with icon and temperature
- Alert banner for service notices
- Saved route card/button
- Loading skeletons for async data

## 6. Non-Functional Requirements

### 6.1 Performance
- Initial page load under 3 seconds on 3G
- Time to interactive under 5 seconds
- Optimize images and icons
- Implement loading states for all async operations

### 6.2 Accessibility
- WCAG 2.1 AA compliance
- Keyboard navigation support
- Screen reader friendly
- Proper ARIA labels
- Sufficient color contrast ratios

### 6.3 Error Handling
- Graceful degradation if APIs are unavailable
- Clear error messages for users
- Retry mechanisms for failed requests
- Fallback to cached data when possible

### 6.4 Browser Support
- Chrome, Firefox, Safari, Edge (latest 2 versions)
- iOS Safari, Chrome Mobile
- Progressive enhancement approach

## 7. Future Enhancements (Out of Scope for V1)

### 7.1 Advanced Features
- Push notifications for saved routes
- Real-time train tracking on map
- Multi-leg journey planning with connections
- Calendar integration for recurring commutes
- Historical delay data and reliability scores

### 7.2 Premium Features
- Crowding predictions based on historical data
- Alternative route suggestions during delays
- Integration with ride-sharing for last-mile connections
- Bike car availability tracking

### 7.3 Social Features
- Share trip plans with friends
- Commute buddy matching
- Community-reported issues

## 8. Success Metrics

### 8.1 Key Performance Indicators
- Daily active users
- Average session duration
- Saved route creation rate
- API response time
- Error rate

### 8.2 User Satisfaction
- Time to complete primary task (find next train)
- Return user rate
- Saved route usage percentage

## 9. Development Phases

### Phase 1: MVP (Week 1-2)
- Station selection UI
- Next trains display (static or simple API)
- Basic weather display
- Responsive layout

### Phase 2: Enhancement (Week 3)
- Saved routes functionality
- Service alerts integration
- Auto-refresh
- Error handling improvements

### Phase 3: Polish (Week 4)
- Performance optimization
- Accessibility audit
- Cross-browser testing
- Documentation

## 10. Technical Constraints

- Must work without user authentication (for simplicity)
- Data stored client-side only (localStorage)
- Free-tier API limits must be respected
- No backend database required for V1

## 11. API Keys Required

Development will require:
1. 511.org API key (free) OR access to Caltrain GTFS data
2. OpenWeatherMap API key (free tier)

Store in `.env.local` (Next.js environment variables):
```
TRANSIT_API_KEY=your_key_here
WEATHER_API_KEY=your_key_here
```

**Note:** In Next.js, prefix with `NEXT_PUBLIC_` if you need to access these in client components, otherwise keep them server-side only for security.

## 12. Project Structure (Next.js App Router)

```
caltrain-commuter/
├── app/
│   ├── page.tsx (main dashboard)
│   ├── layout.tsx
│   └── api/
│       ├── trains/route.ts
│       └── weather/route.ts
├── components/
│   ├── StationSelector.tsx
│   ├── TrainList.tsx
│   ├── WeatherWidget.tsx
│   ├── ServiceAlerts.tsx
│   └── SavedRoutes.tsx
├── lib/
│   ├── stations.ts (station data)
│   ├── types.ts (TypeScript interfaces)
│   └── utils.ts
├── public/
│   └── icons/
├── styles/
├── next.config.js
├── tailwind.config.js
└── tsconfig.json
```

**Initialize with:**
```bash
npx create-next-app@latest caltrain-commuter --typescript --tailwind --app
```

## 13. Acceptance Criteria

The MVP is complete when:
- [ ] User can select origin and destination stations
- [ ] Next 5 trains are displayed with times and direction
- [ ] Current weather for destination is shown
- [ ] User can save at least one favorite route
- [ ] App is responsive on mobile and desktop
- [ ] No critical bugs or broken functionality
- [ ] Basic error handling is in place