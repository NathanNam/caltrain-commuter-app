# Observability Setup

This application is instrumented with OpenTelemetry for comprehensive observability including tracing, metrics, and logging.

## Configuration

### Environment Variables

Add these environment variables to your `.env.local` file to configure observability:

```bash
# OpenTelemetry Configuration
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_EXPORTER_OTLP_BEARER_TOKEN=your_token_here

# Client-side configuration (for browser telemetry)
NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
NEXT_PUBLIC_OTEL_EXPORTER_OTLP_BEARER_TOKEN=your_token_here
```

### Default Configuration

- **OTLP Endpoint**: Defaults to `http://localhost:4318` if not configured
- **Service Name**: `caltrain-commuter-app` (server), `caltrain-commuter-app-client` (browser)
- **Exporters**: OTLP HTTP for traces and logs, OTLP Proto for metrics
- **Auto-instrumentation**: Enabled for HTTP, database, and other common operations

## Features

### Automatic Instrumentation

The application automatically instruments:

**Server-side:**
- HTTP requests and responses
- Database connections and queries
- External API calls (weather, transit, events)
- File system operations
- And many more Node.js operations

**Client-side:**
- Page loads and navigation
- Fetch API calls
- XMLHttpRequest calls
- User interactions

### Tracing

- Distributed tracing across client and server
- Automatic trace correlation between frontend and backend
- Span creation for all instrumented operations
- Error tracking with stack traces

### Metrics

- Performance metrics for HTTP requests
- Custom application metrics
- Resource utilization metrics
- Automatic metric collection from instrumented libraries

### Logging

- Structured logging with trace correlation
- Automatic log correlation with traces
- Error logging with context
- Performance and operational logs

## Usage

### Development

The instrumentation is automatically enabled when you run:

```bash
npm run dev
```

### Production

The instrumentation is included in production builds:

```bash
npm run build
npm start
```

### Viewing Telemetry Data

1. **Local Development**: Use a local OTLP collector or observability backend
2. **Production**: Configure the OTLP endpoint to point to your observability platform

## Health Checks

The application includes automatic health monitoring through OpenTelemetry:

- Service startup/shutdown events are logged
- Automatic error detection and reporting
- Performance monitoring for all API endpoints
- Real-time metrics for application health

## Troubleshooting

### Common Issues

1. **Missing telemetry data**: Check that OTEL_EXPORTER_OTLP_ENDPOINT is correctly configured
2. **Authentication errors**: Verify OTEL_EXPORTER_OTLP_BEARER_TOKEN is set correctly
3. **Client-side issues**: Ensure NEXT_PUBLIC_ prefixed variables are set for browser telemetry

### Logs

Check the application logs for OpenTelemetry initialization messages:
- "OpenTelemetry SDK started" indicates successful server-side setup
- "OpenTelemetry Web SDK started" indicates successful client-side setup

## Performance Impact

The instrumentation is designed to have minimal performance impact:
- Asynchronous data export
- Efficient sampling strategies
- Graceful degradation when observability services are unavailable
- No impact on application functionality if telemetry fails
