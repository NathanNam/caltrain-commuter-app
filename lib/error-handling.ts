// Error handling utilities and types for the Caltrain Commuter App
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { z } from 'zod';

// Standardized error response interface
export interface ApiErrorResponse<T = any> {
  error: true;
  message: string;
  data: T[];
  statusCode?: number;
  retryAfter?: number;
}

// Successful API response interface
export interface ApiSuccessResponse<T = any> {
  error: false;
  data: T[];
  message?: string;
}

// Union type for API responses
export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse<T>;

// Error types for different scenarios
export enum ErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  API_ERROR = 'API_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  PARSE_ERROR = 'PARSE_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

// Custom error class with additional context
export class AppError extends Error {
  public readonly type: ErrorType;
  public readonly statusCode?: number;
  public readonly retryAfter?: number;
  public readonly context?: Record<string, any>;

  constructor(
    message: string,
    type: ErrorType = ErrorType.UNKNOWN_ERROR,
    statusCode?: number,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.statusCode = statusCode;
    this.context = context;

    // Extract retry-after from context if available
    if (context?.retryAfter) {
      this.retryAfter = context.retryAfter;
    }
  }
}

// Fetch configuration with timeout and retry options
export interface FetchConfig {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  retryBackoff?: number;
}

// Default fetch configuration
export const DEFAULT_FETCH_CONFIG: Required<FetchConfig> = {
  timeout: 30000, // 30 seconds
  retries: 3,
  retryDelay: 1000, // 1 second
  retryBackoff: 2 // exponential backoff multiplier
};

// Sleep utility for retry delays
const sleep = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

// Enhanced fetch with timeout, retry logic, and error handling
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  config: FetchConfig = {}
): Promise<Response> {
  const {
    timeout,
    retries,
    retryDelay,
    retryBackoff
  } = { ...DEFAULT_FETCH_CONFIG, ...config };

  const tracer = trace.getTracer('caltrain-app');
  
  return tracer.startActiveSpan(`fetch-${new URL(url).pathname}`, async (span) => {
    span.setAttributes({
      'http.url': url,
      'http.method': options.method || 'GET',
      'fetch.timeout': timeout,
      'fetch.retries': retries
    });

    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt <= retries) {
      try {
        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        span.setAttributes({
          'http.status_code': response.status,
          'fetch.attempt': attempt + 1
        });

        // Check for rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          const retryAfterMs = retryAfter ? parseInt(retryAfter) * 1000 : retryDelay * Math.pow(retryBackoff, attempt);
          
          span.recordException(new AppError(
            `Rate limited. Retry after ${retryAfterMs}ms`,
            ErrorType.RATE_LIMIT_ERROR,
            429,
            { retryAfter: retryAfterMs, url }
          ));

          if (attempt < retries) {
            await sleep(retryAfterMs);
            attempt++;
            continue;
          }
          
          throw new AppError(
            'Rate limit exceeded',
            ErrorType.RATE_LIMIT_ERROR,
            429,
            { retryAfter: retryAfterMs, url }
          );
        }

        // Check for other HTTP errors
        if (!response.ok) {
          const errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          
          // Don't retry client errors (4xx) except rate limits
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            const error = new AppError(errorMessage, ErrorType.API_ERROR, response.status, { url });
            span.recordException(error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
            throw error;
          }

          // Retry server errors (5xx)
          if (attempt < retries) {
            lastError = new AppError(errorMessage, ErrorType.API_ERROR, response.status, { url });
            span.addEvent(`Retrying after HTTP ${response.status}`, { attempt: attempt + 1 });
            await sleep(retryDelay * Math.pow(retryBackoff, attempt));
            attempt++;
            continue;
          }

          const error = new AppError(errorMessage, ErrorType.API_ERROR, response.status, { url });
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
          throw error;
        }

        span.setStatus({ code: SpanStatusCode.OK });
        return response;

      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }

        // Handle timeout errors
        if (error instanceof Error && error.name === 'AbortError') {
          lastError = new AppError(
            `Request timeout after ${timeout}ms`,
            ErrorType.TIMEOUT_ERROR,
            undefined,
            { url, timeout }
          );
        } else if (error instanceof TypeError && error.message.includes('fetch')) {
          // Network errors
          lastError = new AppError(
            `Network error: ${error.message}`,
            ErrorType.NETWORK_ERROR,
            undefined,
            { url, originalError: error.message }
          );
        } else {
          lastError = new AppError(
            `Fetch error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            ErrorType.UNKNOWN_ERROR,
            undefined,
            { url, originalError: error instanceof Error ? error.message : String(error) }
          );
        }

        span.recordException(lastError);

        if (attempt < retries) {
          span.addEvent(`Retrying after error`, { 
            attempt: attempt + 1, 
            error: lastError.message 
          });
          await sleep(retryDelay * Math.pow(retryBackoff, attempt));
          attempt++;
          continue;
        }

        span.setStatus({ code: SpanStatusCode.ERROR, message: lastError.message });
        throw lastError;
      }
    }

    // This should never be reached, but TypeScript requires it
    throw lastError || new AppError('Maximum retries exceeded', ErrorType.UNKNOWN_ERROR);
  });
}

// Utility to create error response
export function createErrorResponse<T = any>(
  message: string,
  statusCode?: number,
  retryAfter?: number
): ApiErrorResponse<T> {
  return {
    error: true,
    message,
    data: [],
    statusCode,
    retryAfter
  };
}

// Utility to create success response
export function createSuccessResponse<T = any>(
  data: T[],
  message?: string
): ApiSuccessResponse<T> {
  return {
    error: false,
    data,
    message
  };
}

// Utility to handle API errors and log them
export function handleApiError(error: unknown, context: string): ApiErrorResponse {
  const tracer = trace.getTracer('caltrain-app');
  
  return tracer.startActiveSpan(`handle-error-${context}`, (span) => {
    let appError: AppError;

    if (error instanceof AppError) {
      appError = error;
    } else if (error instanceof Error) {
      appError = new AppError(
        error.message,
        ErrorType.UNKNOWN_ERROR,
        undefined,
        { context, originalError: error.message }
      );
    } else {
      appError = new AppError(
        'Unknown error occurred',
        ErrorType.UNKNOWN_ERROR,
        undefined,
        { context, originalError: String(error) }
      );
    }

    span.recordException(appError);
    span.setAttributes({
      'error.type': appError.type,
      'error.context': context,
      'error.status_code': appError.statusCode || 0
    });
    span.setStatus({ code: SpanStatusCode.ERROR, message: appError.message });

    console.error(`[${context}] Error:`, {
      message: appError.message,
      type: appError.type,
      statusCode: appError.statusCode,
      context: appError.context
    });

    return createErrorResponse(
      appError.message,
      appError.statusCode,
      appError.retryAfter
    );
  });
}

// Validation schemas for common API responses
export const WeatherResponseSchema = z.object({
  main: z.object({
    temp: z.number(),
    humidity: z.number()
  }),
  weather: z.array(z.object({
    description: z.string(),
    icon: z.string()
  })).min(1),
  wind: z.object({
    speed: z.number()
  }).optional()
});

export const ESPNEventSchema = z.object({
  id: z.string(),
  date: z.string(),
  competitions: z.array(z.object({
    competitors: z.array(z.object({
      homeAway: z.enum(['home', 'away']),
      team: z.object({
        abbreviation: z.string().optional(),
        displayName: z.string().optional()
      }).optional()
    })).optional()
  })).optional(),
  season: z.object({
    type: z.number()
  }).optional()
});

export const MLBGameSchema = z.object({
  gamePk: z.number(),
  gameDate: z.string(),
  gameType: z.string(),
  teams: z.object({
    home: z.object({
      team: z.object({
        id: z.number(),
        name: z.string()
      })
    }),
    away: z.object({
      team: z.object({
        id: z.number(),
        name: z.string()
      })
    })
  })
});

export const NHLGameSchema = z.object({
  id: z.number(),
  gameDate: z.string(),
  startTimeUTC: z.string(),
  gameType: z.number(),
  homeTeam: z.object({
    abbrev: z.string(),
    placeName: z.object({
      default: z.string()
    }).optional()
  }),
  awayTeam: z.object({
    abbrev: z.string(),
    placeName: z.object({
      default: z.string()
    }).optional()
  })
});

// Utility to validate API responses
export function validateApiResponse<T>(
  data: unknown,
  schema: z.ZodSchema<T>,
  context: string
): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError(
        `Invalid API response format: ${error.errors.map(e => e.message).join(', ')}`,
        ErrorType.VALIDATION_ERROR,
        undefined,
        { context, validationErrors: error.errors }
      );
    }
    throw new AppError(
      `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ErrorType.VALIDATION_ERROR,
      undefined,
      { context }
    );
  }
}
