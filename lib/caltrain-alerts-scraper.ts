// Caltrain.com Alerts Scraper
// Scrapes train-specific delay information from Caltrain.com/alerts

import {
  fetchWithRetry,
  handleApiError,
  createSuccessResponse,
  ApiResponse,
  AppError,
  ErrorType
} from './error-handling';

export interface CaltrainAlert {
  trainNumber?: string;
  delayMinutes?: number;
  alertText: string;
  type: 'delay' | 'running-ahead' | 'cancellation' | 'general' | 'elevator';
  severity: 'info' | 'warning' | 'critical';
}

export interface TrainDelay {
  trainNumber: string;
  delayMinutes: number;
  source: 'caltrain-alerts';
}

/**
 * Parse train delay information from alert text
 * Examples:
 * - "Train 167 Will Run Ahead of Train 165"
 * - "Please Expect Up To 40-45 Minute Delay for Train 165"
 * - "Train 123 is delayed by 15 minutes"
 */
function parseAlertForTrainDelay(alertText: string): TrainDelay | null {
  if (!alertText || typeof alertText !== 'string') {
    return null;
  }

  // Pattern 1: "Please Expect Up To X-Y Minute Delay for Train NNN"
  const delayPattern1 = /(?:expect|up to)\s+(?:up to\s+)?(\d+)(?:-(\d+))?\s*minute\s*delay\s+for\s+train\s+(\d+)/i;
  const match1 = alertText.match(delayPattern1);

  if (match1) {
    const minDelay = parseInt(match1[1], 10);
    const maxDelay = match1[2] ? parseInt(match1[2], 10) : minDelay;
    const trainNumber = match1[3];

    // Add NaN checks for parseInt results
    if (isNaN(minDelay) || (match1[2] && isNaN(maxDelay))) {
      return null;
    }

    // Use the maximum delay value for conservative estimates
    return {
      trainNumber,
      delayMinutes: maxDelay,
      source: 'caltrain-alerts'
    };
  }

  // Pattern 2: "Train NNN is delayed by X minutes"
  const delayPattern2 = /train\s+(\d+)\s+is\s+delayed\s+by\s+(\d+)\s*minutes?/i;
  const match2 = alertText.match(delayPattern2);

  if (match2) {
    const delayMinutes = parseInt(match2[2], 10);
    if (isNaN(delayMinutes)) {
      return null;
    }

    return {
      trainNumber: match2[1],
      delayMinutes,
      source: 'caltrain-alerts'
    };
  }

  // Pattern 3: "Train NNN: X minute delay"
  const delayPattern3 = /train\s+(\d+):\s*(\d+)\s*minute\s*delay/i;
  const match3 = alertText.match(delayPattern3);

  if (match3) {
    const delayMinutes = parseInt(match3[2], 10);
    if (isNaN(delayMinutes)) {
      return null;
    }

    return {
      trainNumber: match3[1],
      delayMinutes,
      source: 'caltrain-alerts'
    };
  }

  return null;
}

/**
 * Categorize alert type based on text content
 */
function categorizeAlert(alertText: string): CaltrainAlert['type'] {
  const lowerText = alertText.toLowerCase();

  if (lowerText.includes('elevator')) return 'elevator';
  if (lowerText.includes('cancel')) return 'cancellation';
  if (lowerText.includes('run ahead') || lowerText.includes('running ahead')) return 'running-ahead';
  if (lowerText.includes('delay')) return 'delay';

  return 'general';
}

/**
 * Determine severity based on alert type and content
 */
function determineSeverity(alertText: string, type: CaltrainAlert['type']): CaltrainAlert['severity'] {
  if (!alertText || typeof alertText !== 'string') {
    return 'info';
  }

  const lowerText = alertText.toLowerCase();

  if (type === 'cancellation') return 'critical';
  if (type === 'delay') {
    // Check if delay is significant (30+ minutes)
    const delayMatch = alertText.match(/(\d+)(?:-(\d+))?\s*minute/i);
    if (delayMatch) {
      const minDelay = parseInt(delayMatch[1], 10);
      const maxDelay = delayMatch[2] ? parseInt(delayMatch[2], 10) : minDelay;

      // Add NaN checks
      if (isNaN(minDelay) || (delayMatch[2] && isNaN(maxDelay))) {
        return 'warning'; // Default to warning for unparseable delays
      }

      if (maxDelay >= 30) return 'critical';
      if (maxDelay >= 10) return 'warning';
    }
    return 'warning';
  }
  if (type === 'elevator') return 'info';

  return 'info';
}

/**
 * Parse alert text to extract structured information
 */
function parseAlert(alertText: string): CaltrainAlert {
  const type = categorizeAlert(alertText);
  const severity = determineSeverity(alertText, type);

  // Extract train number if mentioned
  const trainMatch = alertText.match(/train\s+(\d+)/i);
  const trainNumber = trainMatch ? trainMatch[1] : undefined;

  // Extract delay information
  const delayInfo = parseAlertForTrainDelay(alertText);
  const delayMinutes = delayInfo?.delayMinutes;

  return {
    trainNumber,
    delayMinutes,
    alertText: alertText.trim(),
    type,
    severity
  };
}

/**
 * Fetch and parse alerts from Caltrain.com/alerts using Puppeteer
 *
 * The alerts are loaded dynamically via JavaScript, so we use a headless browser
 * to execute the page's JavaScript and extract the alert text.
 */
export async function fetchCaltrainAlerts(): Promise<ApiResponse<CaltrainAlert>> {
  let browser: any = null;

  try {
    // Dynamic import to avoid issues with Edge runtime
    const puppeteer = await import('puppeteer');

    console.log('Launching Puppeteer to scrape Caltrain alerts...');

    browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Set a reasonable timeout
    await page.setDefaultTimeout(15000);

    // Navigate to the alerts page
    await page.goto('https://www.caltrain.com/alerts', {
      waitUntil: 'networkidle2'
    });

    // Wait for the PADS alerts container to be populated
    await page.waitForSelector('.pads_service_alerts', { timeout: 10000 });

    // Give the JavaScript time to populate the alerts
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extract alert text from the page
    const alertTexts = await page.evaluate(() => {
      const alerts: string[] = [];

      // Try to find PADS service alerts
      const padsContainer = document.querySelector('.pads_service_alerts');
      if (padsContainer) {
        // Look for alert elements - they might be in divs, paragraphs, or list items
        const alertElements = padsContainer.querySelectorAll('div, p, li');
        alertElements.forEach(el => {
          const text = el.textContent?.trim();
          if (text && text.length > 10 && !text.includes('Tip:') && !text.includes('These are official')) {
            alerts.push(text);
          }
        });
      }

      // Also try GTFS realtime alerts
      const gtfsContainer = document.querySelector('.gtfs_rt_service_alerts');
      if (gtfsContainer) {
        const alertElements = gtfsContainer.querySelectorAll('div, p, li');
        alertElements.forEach(el => {
          const text = el.textContent?.trim();
          if (text && text.length > 10 && !text.includes('Tip:') && !text.includes('These alerts')) {
            alerts.push(text);
          }
        });
      }

      return alerts;
    });

    await browser.close();
    browser = null; // Mark as closed

    console.log(`Scraped ${alertTexts.length} raw alert texts from Caltrain.com`);

    if (alertTexts.length === 0) {
      console.warn('No alerts found on Caltrain.com/alerts page');
      return createSuccessResponse([], 'No alerts found on Caltrain.com');
    }

    // Combine all alert texts and parse them
    const combinedText = alertTexts.join('\n');
    const parsedAlerts = parseAlertsFromText(combinedText);

    console.log(`Parsed ${parsedAlerts.length} structured alerts`);

    return createSuccessResponse(parsedAlerts, `Scraped and parsed ${parsedAlerts.length} alerts from Caltrain.com`);
  } catch (error) {
    // Ensure browser is closed in case of error
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Error closing browser:', closeError);
      }
    }

    return handleApiError(error, 'fetchCaltrainAlerts');
  }
}

/**
 * Extract train delays from alert list
 */
export function extractTrainDelays(alerts: CaltrainAlert[]): Map<string, TrainDelay> {
  const delays = new Map<string, TrainDelay>();

  for (const alert of alerts) {
    const delayInfo = parseAlertForTrainDelay(alert.alertText);
    if (delayInfo) {
      // Only keep the maximum delay for each train if multiple alerts exist
      const existing = delays.get(delayInfo.trainNumber);
      if (!existing || delayInfo.delayMinutes > existing.delayMinutes) {
        delays.set(delayInfo.trainNumber, delayInfo);
      }
    }
  }

  return delays;
}

/**
 * Parse alerts from raw text (for testing or manual input)
 *
 * Example input:
 * ```
 * Train 167 Will Run Ahead of Train 165.
 * Please Expect Up To 40-45 Minute Delay for Train 165.
 * Elevator: Bayshore Northbound is out of service.
 * ```
 */
export function parseAlertsFromText(text: string): CaltrainAlert[] {
  // Split by periods or newlines to get individual alerts
  const lines = text
    .split(/[.\n]/)
    .map(line => line.trim())
    .filter(line => line.length > 10); // Filter out very short fragments

  return lines.map(parseAlert);
}
