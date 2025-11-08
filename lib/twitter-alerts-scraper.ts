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
  console.log('[Twitter Scraper] Function called - starting scrape process');
  const delays: TwitterTrainDelay[] = [];

  let browser;
  try {
    console.log('[Twitter Scraper] Attempting to import Puppeteer...');
    // Dynamic import to avoid issues with Edge runtime
    const puppeteer = await import('puppeteer');
    console.log('[Twitter Scraper] Puppeteer imported successfully');

    console.log('[Twitter Scraper] Launching browser to fetch @CaltrainAlerts tweets...');

    browser = await puppeteer.default.launch({
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

    // Navigate to @CaltrainAlerts profile with 'with_replies' to get chronological timeline
    // This ensures we see ALL tweets, not just pinned/top tweets
    await page.goto('https://x.com/CaltrainAlerts/with_replies', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    console.log('[Twitter Scraper] Waiting for tweets to load...');
    // Wait for tweets to load
    await page.waitForSelector('article[data-testid="tweet"]', { timeout: 10000 });

    // Give extra time for initial tweets to fully render
    console.log('[Twitter Scraper] Waiting 3 seconds for initial tweets to render...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Scroll down to load more tweets (5 scrolls to get more recent tweets)
    console.log('[Twitter Scraper] Scrolling to load more tweets...');
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      // Wait for new tweets to load after each scroll
      console.log(`[Twitter Scraper] Scroll ${i + 1}/5 - waiting 3 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Extract tweet text from recent tweets (last 24 hours)
    const allTweets = await page.evaluate(() => {
      const tweetElements = document.querySelectorAll('article[data-testid="tweet"]');
      const allResults: { text: string; time: string; tweetDate: string }[] = [];

      tweetElements.forEach((tweet) => {
        // Get tweet text
        const textElement = tweet.querySelector('div[data-testid="tweetText"]');
        const timeElement = tweet.querySelector('time');

        if (textElement && timeElement) {
          const tweetTime = timeElement.getAttribute('datetime');
          if (tweetTime) {
            allResults.push({
              text: textElement.textContent || '',
              time: tweetTime,
              tweetDate: new Date(tweetTime).toISOString(),
            });
          }
        }
      });

      return allResults;
    });

    console.log(`[Twitter Scraper] Found ${allTweets.length} total tweets on page`);

    // Log first 5 tweets to debug what we're actually seeing
    for (let i = 0; i < Math.min(allTweets.length, 5); i++) {
      const tweet = allTweets[i];
      console.log(`[Twitter Scraper] Tweet ${i + 1}: "${tweet.text.substring(0, 80)}..." (posted: ${tweet.tweetDate})`);
    }

    // Filter to last 24 hours
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const tweets = allTweets.filter(tweet => {
      const tweetDate = new Date(tweet.time);
      return tweetDate >= oneDayAgo;
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
 * - "Train 166 southbound is running about 14 minutes late approaching San Carlos"
 * - "Train 169 northbound is running about 10 minutes late approaching Santa Clara"
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
  // Also match: "running about 14 minutes late", "approximately 10 minutes late"
  const delayPatterns = [
    /(\d+)\s+min(?:ute)?s?\s+late/i,
    /delayed?\s+(?:by\s+)?(\d+)\s+min(?:ute)?s?/i,
    /running\s+(?:about\s+|approximately\s+)?(\d+)\s+min(?:ute)?s?\s+late/i,
    /approximately\s+(\d+)\s+min(?:ute)?s?\s+late/i,
    /about\s+(\d+)\s+min(?:ute)?s?\s+late/i,
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
  console.log('[Twitter Scraper - getAllTrainDelaysFromTwitter] Starting to fetch all train delays...');
  const delayMap = new Map<string, number>();

  try {
    console.log('[Twitter Scraper - getAllTrainDelaysFromTwitter] Calling scrapeCaltrainAlertsTwitter()...');
    const delays = await scrapeCaltrainAlertsTwitter();
    console.log(`[Twitter Scraper - getAllTrainDelaysFromTwitter] Received ${delays.length} delay records from scraper`);

    // Build map of train number to delay
    for (const delay of delays) {
      // Use the most recent tweet for each train (first occurrence)
      if (!delayMap.has(delay.trainNumber)) {
        delayMap.set(delay.trainNumber, delay.delayMinutes);
        console.log(`[Twitter Scraper - getAllTrainDelaysFromTwitter] Added train ${delay.trainNumber}: ${delay.delayMinutes} min delay`);
      }
    }

    console.log(`[Twitter Scraper - getAllTrainDelaysFromTwitter] Retrieved delays for ${delayMap.size} trains`);
  } catch (error) {
    console.error('[Twitter Scraper - getAllTrainDelaysFromTwitter] Error getting all train delays:', error);
  }

  return delayMap;
}
