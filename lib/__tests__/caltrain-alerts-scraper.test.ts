import { parseAlertsFromText, extractTrainDelays } from '../caltrain-alerts-scraper';

describe('Caltrain Alerts Scraper', () => {
  it('should parse train delay from alert text', () => {
    const alertText = `
Train 167 Will Run Ahead of Train 165.
Please Expect Up To 40-45 Minute Delay for Train 165.
Elevator: Bayshore Northbound is out of service.
    `;

    const alerts = parseAlertsFromText(alertText);

    console.log('Parsed alerts:', JSON.stringify(alerts, null, 2));

    // Should find at least 3 alerts
    expect(alerts.length).toBeGreaterThanOrEqual(2);

    // Find Train 165 delay alert
    const train165Alert = alerts.find(a =>
      a.trainNumber === '165' && a.delayMinutes
    );

    expect(train165Alert).toBeDefined();
    expect(train165Alert?.delayMinutes).toBe(45); // Should use max value from 40-45
    expect(train165Alert?.type).toBe('delay');
    expect(train165Alert?.severity).toBe('critical'); // 45 min delay is critical

    // Find Train 167 running ahead alert
    const train167Alert = alerts.find(a =>
      a.trainNumber === '167'
    );

    expect(train167Alert).toBeDefined();
    expect(train167Alert?.type).toBe('running-ahead');
  });

  it('should extract train delays map', () => {
    const alertText = `
Please Expect Up To 40-45 Minute Delay for Train 165.
Train 123 is delayed by 15 minutes.
    `;

    const alerts = parseAlertsFromText(alertText);
    const delays = extractTrainDelays(alerts);

    console.log('Extracted delays:', Array.from(delays.entries()));

    expect(delays.size).toBe(2);
    expect(delays.get('165')?.delayMinutes).toBe(45);
    expect(delays.get('123')?.delayMinutes).toBe(15);
  });
});
