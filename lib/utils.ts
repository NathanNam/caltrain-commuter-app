// Utility functions for the Caltrain Commuter App

/**
 * Format time string to human-readable format
 */
export function formatTime(time: string): string {
  const date = new Date(time);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Calculate duration between two times in minutes
 */
export function calculateDuration(start: string, end: string): number {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  return Math.round((endTime - startTime) / 60000);
}

/**
 * Format duration in minutes to readable string
 */
export function formatDuration(minutes: number): string {
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
 */
export function celsiusToFahrenheit(celsius: number): number {
  return Math.round((celsius * 9/5) + 32);
}

/**
 * Convert meters per second to miles per hour
 */
export function mpsToMph(mps: number): number {
  return Math.round(mps * 2.237);
}

/**
 * Merge class names for Tailwind
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
