# Observability Setup

This application includes comprehensive OpenTelemetry instrumentation for monitoring, tracing, and logging.

## Features

- **Distributed Tracing**: Automatic instrumentation of HTTP requests, database calls, and external API calls
- **Metrics Collection**: Performance metrics for key application indicators
- **Structured Logging**: Centralized logging with trace correlation
- **Client-Side Monitoring**: Browser performance and user interaction tracking
- **Server-Side Monitoring**: Node.js application performance and API monitoring

## Configuration

### Environment Variables

Configure the following environment variables to send telemetry data to your observability platform:

#### Server-Side Configuration
```bash
# OTLP endpoint for server-side telemetry
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# Optional: Bearer token for authentication
OTEL_EXPORTER_OTLP_BEARER_TOKEN=your_token_here
```

#### Client-Side Configuration
```bash
# OTLP endpoint for client-side telemetry (must be publicly accessible)
NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# Optional: Bearer token for authentication
NEXT_PUBLIC_OTEL_EXPORTER_OTLP_BEARER_TOKEN=your_token_here
```

### For Observe.ai

To send telemetry data to Observe, configure:

```bash
# Server-side
OTEL_EXPORTER_OTLP_ENDPOINT=https://your-tenant.observeinc.com:443
OTEL_EXPORTER_OTLP_BEARER_TOKEN=your_observe_token

# Client-side  
NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT=https://your-tenant.observeinc.com:443
NEXT_PUBLIC_OTEL_EXPORTER_OTLP_BEARER_TOKEN=your_observe_token
```

## What's Instrumented

### Automatic Server-Side Instrumentation
- HTTP requests and responses (Express, Next.js API routes)
- Database queries (if using supported databases)
- External HTTP calls (fetch, axios, etc.)
- File system operations
- DNS lookups

### Automatic Client-Side Instrumentation
- Page loads and navigation
- Fetch API calls
- XMLHttpRequest calls
- User interactions
- Performance metrics

## Development

### Running with Observability

1. Set environment variables in `.env.local`
2. Start the development server: `npm run dev`
3. OpenTelemetry will automatically initialize and start collecting telemetry

### Local Testing

For local testing, you can run a local OTLP collector:

```bash
# Using Docker
docker run -p 4317:4317 -p 4318:4318 otel/opentelemetry-collector-contrib:latest
```

## Health Checks

The application includes built-in health monitoring:
- OpenTelemetry initialization status is logged
- Failed telemetry exports are handled gracefully
- Application continues to function even if observability services are unavailable

## Troubleshooting

### Common Issues

1. **No telemetry data**: Check environment variables and network connectivity
2. **Build warnings**: Winston transport warnings are expected and don't affect functionality
3. **Client-side errors**: Ensure NEXT_PUBLIC_ prefixed variables are set for browser access

### Debug Mode

Enable debug logging by setting:
```bash
OTEL_LOG_LEVEL=debug
```

## Performance Impact

The OpenTelemetry instrumentation is designed to have minimal performance impact:
- Asynchronous telemetry export
- Configurable sampling rates
- Graceful degradation if observability services are unavailable
- No blocking operations in the critical path
