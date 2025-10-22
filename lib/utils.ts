// Utility functions for the Caltrain Commuter App

/**
 * Format time string to human-readable format
 * @param time - ISO date string or valid date string
 * @throws {Error} - If the time string is invalid
 */
export function formatTime(time: string): string {
  // Input validation
  if (!time || typeof time !== 'string') {
    throw new Error('formatTime: time parameter must be a non-empty string');
  }

  const date = new Date(time);

  // Check if the date is valid
  if (isNaN(date.getTime())) {
    throw new Error(`formatTime: invalid date string "${time}"`);
  }

  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Calculate duration between two times in minutes
 * @param start - ISO date string or valid date string
 * @param end - ISO date string or valid date string
 * @throws {Error} - If either time string is invalid
 */
export function calculateDuration(start: string, end: string): number {
  // Input validation
  if (!start || typeof start !== 'string') {
    throw new Error('calculateDuration: start parameter must be a non-empty string');
  }
  if (!end || typeof end !== 'string') {
    throw new Error('calculateDuration: end parameter must be a non-empty string');
  }

  const startDate = new Date(start);
  const endDate = new Date(end);

  // Check if dates are valid
  if (isNaN(startDate.getTime())) {
    throw new Error(`calculateDuration: invalid start date string "${start}"`);
  }
  if (isNaN(endDate.getTime())) {
    throw new Error(`calculateDuration: invalid end date string "${end}"`);
  }

  const startTime = startDate.getTime();
  const endTime = endDate.getTime();

  // Check for negative duration
  if (endTime < startTime) {
    throw new Error('calculateDuration: end time cannot be before start time');
  }

  return Math.round((endTime - startTime) / 60000);
}

/**
 * Format duration in minutes to readable string
 * @param minutes - Duration in minutes (must be non-negative)
 * @throws {Error} - If minutes is not a valid number or is negative
 */
export function formatDuration(minutes: number): string {
  // Input validation
  if (typeof minutes !== 'number' || isNaN(minutes)) {
    throw new Error('formatDuration: minutes parameter must be a valid number');
  }
  if (minutes < 0) {
    throw new Error('formatDuration: minutes parameter cannot be negative');
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

/**
 * Get current date/time as ISO string
 */
export function getCurrentTime(): string {
  return new Date().toISOString();
}

/**
 * Convert Celsius to Fahrenheit
 * @param celsius - Temperature in Celsius
 * @throws {Error} - If celsius is not a valid number
 */
export function celsiusToFahrenheit(celsius: number): number {
  if (typeof celsius !== 'number' || isNaN(celsius)) {
    throw new Error('celsiusToFahrenheit: celsius parameter must be a valid number');
  }
  return Math.round((celsius * 9/5) + 32);
}

/**
 * Convert meters per second to miles per hour
 * @param mps - Speed in meters per second
 * @throws {Error} - If mps is not a valid number or is negative
 */
export function mpsToMph(mps: number): number {
  if (typeof mps !== 'number' || isNaN(mps)) {
    throw new Error('mpsToMph: mps parameter must be a valid number');
  }
  if (mps < 0) {
    throw new Error('mpsToMph: mps parameter cannot be negative');
  }
  return Math.round(mps * 2.237);
}

/**
 * Merge class names for Tailwind
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
