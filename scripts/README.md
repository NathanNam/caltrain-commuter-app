# Scripts

This directory contains helper scripts for maintaining the Caltrain Commuter app.

## Update Moscone Events (Fully Automated) ⭐

**File:** `update-moscone-events-auto.mjs` **← Use this one!**

This script **automatically fetches** upcoming Moscone Center events from SF Travel's convention calendar and updates `lib/moscone-events.ts`.

### Why This Script?

Moscone Center hosts major conventions (like Dreamforce, Microsoft Ignite, TechCrunch Disrupt) that bring 50K-170K+ attendees and significantly impact Caltrain ridership. However, these events:
- Don't appear on Ticketmaster (they're B2B conferences, not ticketed public events)
- Are announced months in advance on convention calendars
- Need to be tracked in the app

### How to Use

Run this script **once a month** to keep events up to date:

```bash
# From the project root directory:
node scripts/update-moscone-events-auto.mjs
```

**That's it!** No manual research, no copying dates, no editing code.

The script will:
1. Automatically fetch events from SF Travel's convention calendar
2. Parse and extract Moscone Center events
3. Estimate crowd levels and attendance
4. Show you what it found
5. Ask for confirmation before updating the file

### Workflow

```bash
# 1. Run the script (from project root)
node scripts/update-moscone-events-auto.mjs

# 2. Review the events it found
#    (The script shows ~17 upcoming events automatically)

# 3. Type 'y' to confirm and update the file

# 4. Review the changes
git diff lib/moscone-events.ts

# 5. Adjust crowd levels if needed (optional)
#    Edit lib/moscone-events.ts manually if you want to tweak anything

# 6. Test the app
npm run dev

# 7. Commit the changes
git add lib/moscone-events.ts
git commit -m "Update Moscone events for [month]"
git push
```

### Example Output

```
🎯 Moscone Center Events Auto-Update

Fetching events from SF Travel convention calendar...
════════════════════════════════════════════════════════════════════════════════

✅ Found 17 upcoming Moscone Center events:

1. PyTorch Conference 2025
   Dates: 2025-10-21 to 2025-10-23
   Crowd Level: moderate (est. 30,000 attendees)

2. TechCrunch Disrupt 2025
   Dates: 2025-10-27 to 2025-10-29
   Crowd Level: high (est. 80,000 attendees)
   Info: TechCrunch startup conference

3. Microsoft Ignite 2025
   Dates: 2025-11-17 to 2025-11-21
   Crowd Level: high (est. 150,000 attendees)
   Info: Microsoft annual conference

...

Generate lib/moscone-events.ts with these events? (y/n):
```

### Automatic Features

✅ **Web scraping** - Fetches latest events from SF Travel automatically
✅ **Date parsing** - Handles various date formats
✅ **Crowd estimation** - Intelligently estimates attendance based on event name
✅ **Smart filtering** - Only includes events in the next 6 months
✅ **Zero manual work** - No need to copy/paste or research dates

### Crowd Level Intelligence

The script automatically detects crowd levels:
- **High** (100K+): Dreamforce, Microsoft Ignite, Oracle, WWDC, GDC, RSA
- **Moderate** (20K-100K): Most tech conferences, expos, summits
- **Low** (<20K): Small conventions

### Frequency

Run this script:
- **Monthly** - To catch newly announced events (1st of each month)
- **After major announcements** - When you hear about big conferences
- **Before deployment** - To ensure production has current data

### Customizing Results

After running the script, you can manually edit `lib/moscone-events.ts` to:
- Adjust crowd levels for specific events
- Update attendance estimates based on press releases
- Add descriptions for major events
- Remove events you don't want to track

### Data Source

Events are fetched from:
- **SF Travel Convention Calendar**: https://portal.sftravel.com/calendar_public/home_sfdc.cfm (official SF convention data)

### Troubleshooting

**If the script finds 0 events:**
1. Check your internet connection
2. Verify the website is accessible: https://portal.sftravel.com/calendar_public/home_sfdc.cfm
3. The website HTML structure may have changed (contact maintainer)

**If crowd levels seem wrong:**
- Edit `lib/moscone-events.ts` manually after running the script
- The estimates are intelligent guesses based on event names

### Notes

- Events are bundled with your app (no runtime API calls)
- This ensures reliability and no API dependencies
- The generated file includes a timestamp showing when it was last updated
- Safe to run multiple times - it regenerates the entire file each time

---

## Alternative: Manual Helper (Reference Only)

**File:** `update-moscone-events.mjs`

This is the older manual version where you had to update the event list in the script itself. **Use `update-moscone-events-auto.mjs` instead** - it's fully automated!
