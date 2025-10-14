# Scripts

This directory contains helper scripts for maintaining the Caltrain Commuter app.

## Update Moscone Events

**File:** `update-moscone-events.mjs`

This script helps you update the Moscone Center events list that powers the Event Crowding Alerts feature.

### Why This Script?

Moscone Center hosts major conventions (like Dreamforce, Microsoft Ignite, TechCrunch Disrupt) that bring 50K-170K+ attendees and significantly impact Caltrain ridership. However, these events:
- Don't appear on Ticketmaster (they're B2B conferences, not ticketed public events)
- Are announced months in advance on convention calendars
- Need to be manually tracked in the app

### How to Use

Run this script **once a month** to keep events up to date:

```bash
# From the project root directory:
node scripts/update-moscone-events.mjs

# Or if you're in the scripts directory:
cd ..
node scripts/update-moscone-events.mjs
```

**Important:** Always run the script from the project root directory, not from within the `scripts/` folder.

The script will:
1. Show you the current events in `lib/moscone-events.ts`
2. Display suggested upcoming events based on SF Travel's convention calendar
3. Provide links to verify the dates
4. Ask if you want to update the file

### Workflow

```bash
# 1. Run the script
node scripts/update-moscone-events.mjs

# 2. Review the suggested events and verify dates at:
#    https://portal.sftravel.com/calendar_public/home_sfdc.cfm

# 3. If dates look correct, type 'y' to update the file

# 4. Review the changes
git diff lib/moscone-events.ts

# 5. Adjust crowd levels or attendance numbers if needed
#    Edit lib/moscone-events.ts manually if you need to tweak anything

# 6. Test the app
npm run dev

# 7. Commit the changes
git add lib/moscone-events.ts
git commit -m "Update Moscone events for [month]"
git push
```

### Example Output

```
🎯 Moscone Center Events Update Helper

📋 CURRENT EVENTS in lib/moscone-events.ts:

1. Dreamforce 2025
   2025-10-14 to 2025-10-16

────────────────────────────────────────────────

🔍 SUGGESTED UPCOMING EVENTS:

1. Dreamforce 2025
   Dates: 2025-10-14 to 2025-10-16
   Crowd: high (est. 170,000 attendees)
   Info: Salesforce annual conference

2. PyTorch Conference 2025
   Dates: 2025-10-21 to 2025-10-23
   Crowd: moderate (est. 30,000 attendees)

...

Generate lib/moscone-events.ts with these events? (y/n):
```

### Customizing Events

After running the script, you can manually edit `lib/moscone-events.ts` to:

- **Adjust crowd levels**: Change `'moderate'` to `'high'` for bigger events
- **Update attendance estimates**: Based on press releases or past attendance
- **Add descriptions**: For major events like Dreamforce
- **Add/remove events**: The script is just a starting point

### Event Data Sources

The script suggests events from:
- **SF Travel Convention Calendar**: https://portal.sftravel.com/calendar_public/home_sfdc.cfm (official)
- **Moscone Center**: https://www.moscone.com/events (official)
- **Convention Calendar**: https://conventioncalendar.com/us/ca/san-francisco/moscone-center (3rd party aggregator)

### Crowd Level Guidelines

- **High** (100K+ attendees): Dreamforce, Microsoft Ignite, Oracle OpenWorld, WWDC
- **Moderate** (20K-100K): Most tech conferences, large trade shows
- **Low** (<20K): Small conventions, regional conferences

### Frequency

Run this script:
- **Monthly** - To catch newly announced events
- **After major announcements** - When Salesforce announces Dreamforce dates, etc.
- **Before deployment** - To ensure your production app has current data

### Notes

- The script doesn't make API calls during runtime - it just helps you update the static file
- Events are hardcoded in `lib/moscone-events.ts` and bundled with your app
- This is intentional to avoid runtime dependencies and ensure reliability
- The file includes a comment with the last update date for tracking
