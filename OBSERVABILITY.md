# OpenTelemetry Observability Setup

This Caltrain Commuter App has been instrumented with OpenTelemetry for comprehensive observability including traces, metrics, and logs.

## Features

- **Distributed Tracing**: Automatic instrumentation of HTTP requests, API calls, and database operations
- **Metrics Collection**: Performance metrics for key application indicators
- **Structured Logging**: Centralized logging with trace correlation
- **Error Tracking**: Automatic error capture and monitoring
- **Client & Server Monitoring**: Full-stack observability for both browser and server components

## Configuration

### Environment Variables

Configure the following environment variables to send telemetry data to your observability platform:

```bash
# Server-side configuration
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_EXPORTER_OTLP_BEARER_TOKEN=your_token_here

# Client-side configuration (Next.js public variables)
NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
NEXT_PUBLIC_OTEL_EXPORTER_OTLP_BEARER_TOKEN=your_token_here
```

### For Observe.ai

To send data to Observe, set:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=https://your-tenant.observeinc.com:443
OTEL_EXPORTER_OTLP_BEARER_TOKEN=your_observe_token

NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT=https://your-tenant.observeinc.com:443
NEXT_PUBLIC_OTEL_EXPORTER_OTLP_BEARER_TOKEN=your_observe_token
```

## What's Instrumented

### Server-Side (Node.js/Next.js API Routes)
- HTTP requests and responses
- Database queries (if any)
- External API calls (weather, transit APIs)
- File system operations
- Error handling and exceptions

### Client-Side (Browser)
- Page loads and navigation
- Fetch API calls
- XMLHttpRequest calls
- User interactions
- JavaScript errors

## Files Added

- `otel-server.ts` - Server-side OpenTelemetry configuration
- `otel-client.ts` - Client-side OpenTelemetry configuration  
- `instrumentation.ts` - Next.js instrumentation hook
- `components/OtelClientInit.tsx` - Client-side initialization component

## Development

### Local Testing

For local development, you can run a local OTLP collector:

```bash
# Using Docker
docker run -p 4317:4317 -p 4318:4318 otel/opentelemetry-collector-contrib:latest
```

### Disabling Observability

To disable observability (e.g., for testing), simply don't set the OTLP endpoint environment variables. The application will continue to work normally without sending telemetry data.

## Monitoring Key Metrics

The instrumentation automatically captures:

- **Request latency** for API endpoints
- **Error rates** across the application
- **Database query performance** (if applicable)
- **External API call success/failure rates**
- **Page load times** and user experience metrics

## Troubleshooting

1. **No data appearing**: Check that environment variables are set correctly
2. **Build errors**: Ensure all OpenTelemetry packages are installed
3. **Performance impact**: The instrumentation is designed to have minimal overhead
4. **CORS issues**: Ensure your OTLP endpoint accepts requests from your domain

For more information, see the [OpenTelemetry documentation](https://opentelemetry.io/docs/).
