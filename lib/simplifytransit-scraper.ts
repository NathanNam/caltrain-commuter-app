// SimplifyTransit Alerts Scraper
// Scrapes real-time alerts from https://app.simplifytransit.com/alerts/caltrain
// This provides system-wide delay information as a backup to GTFS-RT

export interface SimplifyTransitAlert {
  title: string;
  cause: string;
  effect: string;
  startTime: string;
  endTime: string;
  delayMinutes?: number; // Extracted from title if delay range is specified
  isSystemWide: boolean;
}

/**
 * Parse delay duration from alert title
 * Examples:
 * - "Please Continue to Expect Up to 30-60 Delay for All Trains"
 * - "Expect 30-60 Minute Delay for All Trains Near San Jose Diridon"
 */
function parseDelayFromTitle(title: string): number | undefined {
  const lowerTitle = title.toLowerCase();

  // Check if this mentions "all trains" (system-wide)
  if (!lowerTitle.includes('all trains')) {
    return undefined;
  }

  // Pattern: "30-60 minute delay" or "30-60 delay"
  const rangeMatch = title.match(/(\d+)-(\d+)\s*(?:minute\s*)?delay/i);
  if (rangeMatch) {
    // Use max delay for conservative estimates
    return parseInt(rangeMatch[2]);
  }

  // Pattern: "30 minute delay"
  const singleMatch = title.match(/(\d+)\s*minute\s*delay/i);
  if (singleMatch) {
    return parseInt(singleMatch[1]);
  }

  return undefined;
}

/**
 * Fetch and parse alerts from SimplifyTransit
 * This uses Puppeteer to scrape the dynamic JavaScript-rendered page
 */
export async function fetchSimplifyTransitAlerts(): Promise<SimplifyTransitAlert[]> {
  try {
    // Dynamic import to avoid issues with Edge runtime
    const puppeteer = await import('puppeteer');

    console.log('[SimplifyTransit] Launching browser to fetch alerts...');

    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Set a reasonable timeout
    await page.setDefaultTimeout(15000);

    // Navigate to the alerts page
    await page.goto('https://app.simplifytransit.com/alerts/caltrain', {
      waitUntil: 'networkidle2'
    });

    console.log('[SimplifyTransit] Waiting for alerts to load...');

    // Wait for alert containers to appear
    // The page structure should have alert cards/divs
    await new Promise(resolve => setTimeout(resolve, 3000)); // Give time for JavaScript to render

    // Extract alert data from the page
    const alerts = await page.evaluate(() => {
      const alertElements: SimplifyTransitAlert[] = [];

      // Try to find alert containers
      // Structure may vary, so we'll look for common patterns
      const alertCards = document.querySelectorAll('.alert, .card, [class*="alert"], [class*="Alert"]');

      alertCards.forEach((card) => {
        try {
          // Extract alert title
          const titleEl = card.querySelector('h1, h2, h3, h4, .title, [class*="title"], [class*="Title"]');
          const title = titleEl?.textContent?.trim() || '';

          // Extract cause
          const causeEl = card.querySelector('[class*="cause"], [class*="Cause"]');
          const cause = causeEl?.textContent?.trim().replace('Alert Cause', '').trim() || '';

          // Extract effect
          const effectEl = card.querySelector('[class*="effect"], [class*="Effect"]');
          const effect = effectEl?.textContent?.trim().replace('Alert Effect', '').trim() || '';

          // Extract times
          const startTimeEl = card.querySelector('[class*="start"], [class*="Start"]');
          const startTime = startTimeEl?.textContent?.trim().replace('Start Time', '').trim() || '';

          const endTimeEl = card.querySelector('[class*="end"], [class*="End"]');
          const endTime = endTimeEl?.textContent?.trim().replace('End Time', '').trim() || '';

          if (title) {
            alertElements.push({
              title,
              cause,
              effect,
              startTime,
              endTime,
              isSystemWide: title.toLowerCase().includes('all trains')
            });
          }
        } catch (error) {
          console.error('[SimplifyTransit] Error parsing alert card:', error);
        }
      });

      // Fallback: Try to extract all text content if structured parsing fails
      if (alertElements.length === 0) {
        const bodyText = document.body.innerText;

        // Look for the delay pattern in the raw text
        const delayMatch = bodyText.match(/Please.*?(\d+)-(\d+).*?Delay.*?All Trains/i);
        if (delayMatch) {
          alertElements.push({
            title: delayMatch[0],
            cause: 'other cause',
            effect: 'significant delays',
            startTime: '',
            endTime: '',
            isSystemWide: true
          });
        }
      }

      return alertElements;
    });

    await browser.close();

    console.log(`[SimplifyTransit] Found ${alerts.length} alerts`);

    // Parse delay information from titles
    const parsedAlerts = alerts.map(alert => ({
      ...alert,
      delayMinutes: parseDelayFromTitle(alert.title)
    }));

    // Log parsed alerts
    for (const alert of parsedAlerts) {
      console.log(`[SimplifyTransit] Alert: "${alert.title}"`);
      if (alert.delayMinutes) {
        console.log(`[SimplifyTransit]   Delay: ${alert.delayMinutes} min (system-wide: ${alert.isSystemWide})`);
      }
    }

    return parsedAlerts;
  } catch (error) {
    console.error('[SimplifyTransit] Error scraping alerts:', error);
    return [];
  }
}

/**
 * Get system-wide delay minutes from SimplifyTransit alerts
 * Returns the maximum delay if multiple alerts exist
 */
export async function getSystemWideDelayFromSimplify(): Promise<number | null> {
  try {
    const alerts = await fetchSimplifyTransitAlerts();

    // Find system-wide alerts with delay information
    const systemWideDelays = alerts
      .filter(alert => alert.isSystemWide && alert.delayMinutes)
      .map(alert => alert.delayMinutes!);

    if (systemWideDelays.length === 0) {
      return null;
    }

    // Return maximum delay (most conservative estimate)
    const maxDelay = Math.max(...systemWideDelays);
    console.log(`[SimplifyTransit] System-wide delay: ${maxDelay} min`);
    return maxDelay;
  } catch (error) {
    console.error('[SimplifyTransit] Error getting system-wide delay:', error);
    return null;
  }
}
