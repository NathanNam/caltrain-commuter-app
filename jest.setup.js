// Optional: configure or set up a testing framework before each test.
// If you delete this file, remove `setupFilesAfterEnv` from `jest.config.js`

// Mock OpenTelemetry for tests
jest.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: jest.fn(() => ({
      startActiveSpan: jest.fn((name, fn) => {
        const mockSpan = {
          setAttributes: jest.fn(),
          recordException: jest.fn(),
          setStatus: jest.fn(),
          addEvent: jest.fn(),
          end: jest.fn()
        };
        return fn(mockSpan);
      })
    }))
  },
  SpanStatusCode: {
    OK: 1,
    ERROR: 2
  }
}));

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
