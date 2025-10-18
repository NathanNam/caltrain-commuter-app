// Twitter/X @CaltrainAlerts scraper for real-time delay information
// This serves as a backup when 511.org GTFS-Realtime is unavailable

import puppeteer from 'puppeteer';

export interface TwitterTrainDelay {
  trainNumber: string;
  delayMinutes: number;
  direction?: 'Northbound' | 'Southbound';
  timestamp: Date;
  tweetText: string;
}

/**
 * Scrape recent tweets from @CaltrainAlerts for train delay information
 * Example tweets:
 * - "Train 151 is running approximately 19 minutes late."
 * - "Train 425 southbound delayed 9 minutes"
 * - "NB Train 153 on time"
 */
export async function scrapeCaltrainAlertsTwitter(): Promise<TwitterTrainDelay[]> {
  const delays: TwitterTrainDelay[] = [];

  let browser;
  try {
    console.log('[Twitter Scraper] Launching browser to fetch @CaltrainAlerts tweets...');

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();

    // Set a realistic user agent to avoid blocking
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Navigate to @CaltrainAlerts profile
    await page.goto('https://x.com/CaltrainAlerts', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Wait for tweets to load
    await page.waitForSelector('article[data-testid="tweet"]', { timeout: 10000 });

    // Extract tweet text from recent tweets (last 24 hours)
    const tweets = await page.evaluate(() => {
      const tweetElements = document.querySelectorAll('article[data-testid="tweet"]');
      const results: { text: string; time: string }[] = [];

      tweetElements.forEach((tweet) => {
        // Get tweet text
        const textElement = tweet.querySelector('div[data-testid="tweetText"]');
        const timeElement = tweet.querySelector('time');

        if (textElement && timeElement) {
          results.push({
            text: textElement.textContent || '',
            time: timeElement.getAttribute('datetime') || '',
          });
        }
      });

      return results;
    });

    console.log(`[Twitter Scraper] Found ${tweets.length} recent tweets from @CaltrainAlerts`);

    // Parse each tweet for train delay information
    for (const tweet of tweets) {
      console.log(`[Twitter Scraper] Analyzing tweet: "${tweet.text}"`);
      const parsed = parseDelayFromTweet(tweet.text, tweet.time);
      if (parsed) {
        delays.push(parsed);
        console.log(`[Twitter Scraper]  ✓ Parsed delay: Train ${parsed.trainNumber} delayed ${parsed.delayMinutes} min`);
      } else {
        console.log(`[Twitter Scraper]  ✗ No delay info found in tweet`);
      }
    }

  } catch (error) {
    console.error('[Twitter Scraper] Error scraping @CaltrainAlerts:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return delays;
}

/**
 * Parse train delay information from a tweet text
 *
 * Common patterns:
 * - "Train 151 is running approximately 19 minutes late"
 * - "Train 425 southbound delayed 9 minutes"
 * - "NB Train 153 on time"
 * - "Train 157 running 5 min late"
 * - "SB 429 delayed by 12 minutes"
 */
function parseDelayFromTweet(tweetText: string, timestamp: string): TwitterTrainDelay | null {
  // Train number patterns
  const trainNumberPattern = /(?:Train\s+|NB\s+Train\s+|SB\s+Train\s+|NB\s+|SB\s+)?(\d{3})/i;
  const trainMatch = tweetText.match(trainNumberPattern);

  if (!trainMatch) {
    return null; // No train number found
  }

  const trainNumber = trainMatch[1];

  // Direction patterns
  let direction: 'Northbound' | 'Southbound' | undefined;
  if (/northbound|NB\s+Train|NB\s+\d/i.test(tweetText)) {
    direction = 'Northbound';
  } else if (/southbound|SB\s+Train|SB\s+\d/i.test(tweetText)) {
    direction = 'Southbound';
  }

  // Check if train is on time
  if (/on time|on-time/i.test(tweetText)) {
    return {
      trainNumber,
      delayMinutes: 0,
      direction,
      timestamp: new Date(timestamp),
      tweetText,
    };
  }

  // Delay patterns
  // Match: "19 minutes late", "delayed 9 minutes", "running 5 min late", "delayed by 12 minutes"
  const delayPatterns = [
    /(\d+)\s+min(?:ute)?s?\s+late/i,
    /delayed?\s+(?:by\s+)?(\d+)\s+min(?:ute)?s?/i,
    /running\s+(?:approximately\s+)?(\d+)\s+min(?:ute)?s?\s+late/i,
    /approximately\s+(\d+)\s+min(?:ute)?s?\s+late/i,
  ];

  for (const pattern of delayPatterns) {
    const match = tweetText.match(pattern);
    if (match) {
      const delayMinutes = parseInt(match[1], 10);
      return {
        trainNumber,
        delayMinutes,
        direction,
        timestamp: new Date(timestamp),
        tweetText,
      };
    }
  }

  // If we found a train number but no clear delay info, skip it
  return null;
}

/**
 * Get delay for a specific train from Twitter alerts
 */
export async function getTrainDelayFromTwitter(trainNumber: string): Promise<number | null> {
  try {
    const delays = await scrapeCaltrainAlertsTwitter();

    // Find the most recent tweet about this train
    const trainDelay = delays.find((d) => d.trainNumber === trainNumber);

    if (trainDelay) {
      console.log(`[Twitter Scraper] Found delay for train ${trainNumber}: ${trainDelay.delayMinutes} min`);
      return trainDelay.delayMinutes;
    }

    return null;
  } catch (error) {
    console.error(`[Twitter Scraper] Error getting delay for train ${trainNumber}:`, error);
    return null;
  }
}

/**
 * Get all current train delays from Twitter alerts
 * Returns a map of train number to delay in minutes
 */
export async function getAllTrainDelaysFromTwitter(): Promise<Map<string, number>> {
  const delayMap = new Map<string, number>();

  try {
    const delays = await scrapeCaltrainAlertsTwitter();

    // Build map of train number to delay
    for (const delay of delays) {
      // Use the most recent tweet for each train (first occurrence)
      if (!delayMap.has(delay.trainNumber)) {
        delayMap.set(delay.trainNumber, delay.delayMinutes);
      }
    }

    console.log(`[Twitter Scraper] Retrieved delays for ${delayMap.size} trains`);
  } catch (error) {
    console.error('[Twitter Scraper] Error getting all train delays:', error);
  }

  return delayMap;
}
