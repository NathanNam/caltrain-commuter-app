// Tests for error handling utilities
import { 
  fetchWithRetry, 
  handleApiError, 
  createErrorResponse, 
  createSuccessResponse,
  validateApiResponse,
  AppError,
  ErrorType,
  WeatherResponseSchema
} from '../error-handling';

// Mock fetch for testing
global.fetch = jest.fn();

describe('Error Handling Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createErrorResponse', () => {
    it('should create a proper error response', () => {
      const response = createErrorResponse('Test error', 500, 1000);
      
      expect(response).toEqual({
        error: true,
        message: 'Test error',
        data: [],
        statusCode: 500,
        retryAfter: 1000
      });
    });
  });

  describe('createSuccessResponse', () => {
    it('should create a proper success response', () => {
      const data = [{ id: 1, name: 'test' }];
      const response = createSuccessResponse(data, 'Success message');
      
      expect(response).toEqual({
        error: false,
        data,
        message: 'Success message'
      });
    });
  });

  describe('AppError', () => {
    it('should create an AppError with proper properties', () => {
      const error = new AppError(
        'Test error',
        ErrorType.NETWORK_ERROR,
        500,
        { url: 'https://example.com' }
      );

      expect(error.message).toBe('Test error');
      expect(error.type).toBe(ErrorType.NETWORK_ERROR);
      expect(error.statusCode).toBe(500);
      expect(error.context).toEqual({ url: 'https://example.com' });
    });
  });

  describe('validateApiResponse', () => {
    it('should validate a correct weather response', () => {
      const validData = {
        main: { temp: 20, humidity: 60 },
        weather: [{ description: 'sunny', icon: '01d' }],
        wind: { speed: 5 }
      };

      const result = validateApiResponse(validData, WeatherResponseSchema, 'test');
      expect(result).toEqual(validData);
    });

    it('should throw AppError for invalid data', () => {
      const invalidData = {
        main: { temp: 20 }, // missing humidity
        weather: [] // empty array
      };

      expect(() => {
        validateApiResponse(invalidData, WeatherResponseSchema, 'test');
      }).toThrow(AppError);
    });
  });

  describe('handleApiError', () => {
    it('should handle AppError correctly', () => {
      const appError = new AppError('Test error', ErrorType.API_ERROR, 404);
      const result = handleApiError(appError, 'test-context');

      expect(result).toEqual({
        error: true,
        message: 'Test error',
        data: [],
        statusCode: 404
      });
    });

    it('should handle regular Error correctly', () => {
      const error = new Error('Regular error');
      const result = handleApiError(error, 'test-context');

      expect(result).toEqual({
        error: true,
        message: 'Regular error',
        data: []
      });
    });

    it('should handle unknown error correctly', () => {
      const result = handleApiError('string error', 'test-context');

      expect(result).toEqual({
        error: true,
        message: 'Unknown error occurred',
        data: []
      });
    });
  });

  describe('fetchWithRetry', () => {
    it('should succeed on first try', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ data: 'test' })
      };
      
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const response = await fetchWithRetry('https://example.com');
      
      expect(response).toBe(mockResponse);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on server error', async () => {
      const mockErrorResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      };
      
      const mockSuccessResponse = {
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ data: 'test' })
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(mockErrorResponse)
        .mockResolvedValueOnce(mockSuccessResponse);

      const response = await fetchWithRetry('https://example.com', {}, { retries: 1, retryDelay: 10 });
      
      expect(response).toBe(mockSuccessResponse);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw AppError after max retries', async () => {
      const mockErrorResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockErrorResponse);

      await expect(
        fetchWithRetry('https://example.com', {}, { retries: 1, retryDelay: 10 })
      ).rejects.toThrow(AppError);
      
      expect(global.fetch).toHaveBeenCalledTimes(2); // initial + 1 retry
    });

    it('should handle rate limiting', async () => {
      const mockRateLimitResponse = {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: {
          get: jest.fn().mockReturnValue('2') // 2 seconds retry-after
        }
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockRateLimitResponse);

      await expect(
        fetchWithRetry('https://example.com', {}, { retries: 0 })
      ).rejects.toThrow(AppError);
      
      const error = await fetchWithRetry('https://example.com', {}, { retries: 0 }).catch(e => e);
      expect(error.type).toBe(ErrorType.RATE_LIMIT_ERROR);
    });

    it('should not retry client errors (4xx except 429)', async () => {
      const mockClientErrorResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found'
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockClientErrorResponse);

      await expect(
        fetchWithRetry('https://example.com', {}, { retries: 2 })
      ).rejects.toThrow(AppError);
      
      expect(global.fetch).toHaveBeenCalledTimes(1); // No retries for 4xx
    });
  });
});
