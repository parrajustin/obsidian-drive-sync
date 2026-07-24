import type { Tracer } from "@opentelemetry/api";
import { trace } from "@opentelemetry/api";
import type { SpanProcessor } from "@opentelemetry/sdk-trace-base";
import {
    BatchSpanProcessor,
    ConsoleSpanExporter,
    SimpleSpanProcessor
} from "@opentelemetry/sdk-trace-base";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
    ATTR_SERVICE_NAME,
    ATTR_SERVICE_VERSION,
    SEMRESATTRS_DEPLOYMENT_ENVIRONMENT
} from "@opentelemetry/semantic-conventions";
import {
    GRAFANA_TEMPO_URL,
    LOKI_ACCESS_CLIENT_ID,
    LOKI_ACCESS_CLIENT_SECRET,
    PLUGIN_ENVIRONMENT,
    PLUGIN_VERSION,
    RUN_ID,
    SERVICE_NAME
} from "../../constants";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const collectorOptions = {
    url: GRAFANA_TEMPO_URL, // url is optional and can be omitted - default is http://localhost:4318/v1/traces
    headers: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "CF-Access-Client-Id": LOKI_ACCESS_CLIENT_ID,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "CF-Access-Client-Secret": LOKI_ACCESS_CLIENT_SECRET
    }, // an optional object containing custom headers to be sent with each request will only work with http
    concurrencyLimit: 10 // an optional limit on pending requests
};

// In a headless Node environment (the CLI binary) there is no browser context
// and we must NOT ship the user's traces to the plugin's remote collector.
// Detect Node and skip the network exporter + provider registration entirely,
// falling back to the OpenTelemetry API's no-op tracer. Browser (Obsidian)
// behavior is unchanged.
const isBrowser = typeof window !== "undefined";

const spanProcessors: SpanProcessor[] = isBrowser
    ? [
          new BatchSpanProcessor(new OTLPTraceExporter(collectorOptions), {
              // The maximum queue size. After the size is reached spans are dropped.
              maxQueueSize: 1000,
              // The interval between two consecutive exports
              scheduledDelayMillis: 10000
          })
      ]
    : [];
// const spanProcessors: SpanProcessor[] = [
//     new BatchSpanProcessor(
//         new ZipkinExporter({
//             headers: {
//                 // eslint-disable-next-line @typescript-eslint/naming-convention
//                 "CF-Access-Client-Id": LOKI_ACCESS_CLIENT_ID,
//                 // eslint-disable-next-line @typescript-eslint/naming-convention
//                 "CF-Access-Client-Secret": LOKI_ACCESS_CLIENT_SECRET
//             },
//             url: ZEIPKIN_URL
//         }),
//         {
//             // The maximum queue size. After the size is reached spans are dropped.
//             maxQueueSize: 1000,
//             // The interval between two consecutive exports
//             scheduledDelayMillis: 10000
//         }
//     )
// ];
if (isBrowser && PLUGIN_ENVIRONMENT !== "production") {
    spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
}

function CreateTracer(): Tracer {
    if (!isBrowser) {
        // No provider registered → the API hands back a non-recording no-op
        // tracer. Spans still satisfy the decorator interface but go nowhere.
        return trace.getTracer("obsidian-drive-sync-node");
    }
    const provider = new WebTracerProvider({
        resource: resourceFromAttributes({
            [ATTR_SERVICE_NAME]: SERVICE_NAME,
            [ATTR_SERVICE_VERSION]: PLUGIN_VERSION,
            [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: PLUGIN_ENVIRONMENT,
            // eslint-disable-next-line @typescript-eslint/naming-convention, camelcase
            run_id: RUN_ID
        }),
        spanProcessors
    });
    provider.register();
    return provider.getTracer("obisidan-frontend");
}

export const TRACER = CreateTracer();
