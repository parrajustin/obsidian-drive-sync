import { ConsoleSpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
// import type { Span } from "@opentelemetry/sdk-trace-web";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
// import { ZipkinExporter } from "@opentelemetry/exporter-zipkin";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { PLUGIN_ENVIRONMENT, PLUGIN_VERSION, SERVICE_NAME } from "../../constants";

const spanProcessors = [];
if (PLUGIN_ENVIRONMENT !== "production") {
    spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
}

const provider = new WebTracerProvider({
    resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: SERVICE_NAME,
        [ATTR_SERVICE_VERSION]: PLUGIN_VERSION
    }),
    // Note: For production consider using the "BatchSpanProcessor" to reduce the number of requests
    // to your exporter. Using the SimpleSpanProcessor here as it sends the spans immediately to the
    // exporter without delay
    spanProcessors
});
// new SimpleSpanProcessor(
//     new ZipkinExporter({
//         // testing interceptor
//         // getExportRequestHeaders: () => {
//         //   return {
//         //     foo: 'bar',
//         //   }
//         // }
//     })
// )

provider.register();

export const TRACER = provider.getTracer("obisidan-frontend");
