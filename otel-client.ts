import { metrics } from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { DocumentLoadInstrumentation } from "@opentelemetry/instrumentation-document-load";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { XMLHttpRequestInstrumentation } from "@opentelemetry/instrumentation-xml-http-request";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from "@opentelemetry/sdk-logs";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  SimpleSpanProcessor,
  WebTracerProvider,
} from "@opentelemetry/sdk-trace-web";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

// Configuration
const serviceName = "caltrain-commuter-app-client"; // replace with your service name

// Client side environment variables:
const otlpEndpoint =
  process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";
const otlpEndpointBearerToken = process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_BEARER_TOKEN;

const authHeader: Record<string, string> = otlpEndpointBearerToken
  ? { Authorization: `Bearer ${otlpEndpointBearerToken}` }
  : {};

// Create resource
const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: serviceName,
});

const provider = new WebTracerProvider({
  resource,
  spanProcessors: [
    // If existing otel instrumentation already has a span processor, add the following span processor and
    // trace exporter to their existing spanProcessors array.
    new SimpleSpanProcessor(
      new OTLPTraceExporter({
        url: `${otlpEndpoint}/v1/traces`,
        headers: {
          ...authHeader,
          "x-observe-target-package": "Tracing",
        },
      })
    ),
  ],
});

// Initialize Meter Provider
const meterProvider = new MeterProvider({
  resource,
  readers: [
    // If existing otel instrumentation already has a metric reader, add the following metric reader to their existing
    // metricReaders array. If they use the deprecated metricReader field instead of metricReaders, replace it with the
    // metricReaders field and add both readers to the array.
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${otlpEndpoint}/v1/metrics`,
        headers: {
          ...authHeader,
          "x-observe-target-package": "Metrics",
          "Content-Type": "application/x-protobuf",
        },
      }),
    }),
  ],
});

// Initialize Logger Provider
const loggerProvider = new LoggerProvider({
  resource,
  processors: [
    // If existing otel instrumentation already has a logger provider with a log processor, add the following log
    // processor to their existing processors array.
    new BatchLogRecordProcessor(
      new OTLPLogExporter({
        url: `${otlpEndpoint}/v1/logs`,
        headers: {
          ...authHeader,
          "x-observe-target-package": "Logs",
        },
      })
    ),
  ],
});

// Initialize OpenTelemetry and return initialized components
export function initOtel() {
  try {
    // Registering instrumentations / plugins
    registerInstrumentations({
      instrumentations: [
        new DocumentLoadInstrumentation(),
        new FetchInstrumentation({
          ignoreUrls: [new RegExp(`.*${otlpEndpoint}.*`)],
        }),
        new XMLHttpRequestInstrumentation({
          ignoreUrls: [new RegExp(`.*${otlpEndpoint}.*`)],
        }),
      ],
    });

    logs.setGlobalLoggerProvider(loggerProvider);
    metrics.setGlobalMeterProvider(meterProvider);
    provider.register({});

    const logger = logs.getLogger(serviceName);
    logger.emit({
      severityNumber: SeverityNumber.INFO,
      severityText: "INFO",
      body: "OpenTelemetry Web SDK started",
    });
  } catch (error) {
    const logger = logs.getLogger(serviceName);
    logger.emit({
      severityNumber: SeverityNumber.ERROR,
      severityText: "ERROR",
      body: "Error starting OpenTelemetry SDK",
      attributes: { error: (error as Error).message },
    });
    throw error;
  }
}
