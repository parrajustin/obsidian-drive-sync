import type { Batches } from "../batcher";

// export function CreateProtoTimestamps(logEntry: LogEntry) {
//     if (logEntry.entries.length > 0) {
//         logEntry.entries = logEntry.entries.map((entry) => {
//             return {
//                 timestamp: {
//                     seconds: Math.floor(entry.ts ?? 0 / 1000),
//                     nanos: (entry.ts ?? 0 % 1000) * 1000000
//                 },
//                 line: entry.line
//             };
//         });
//     }
//     return logEntry;
// }
export function PrepareJSONBatch(batch: Batches) {
    const streams = batch.streams.map((logStream) => {
        return {
            stream: logStream.labels,
            values: logStream.entries.map((entry) => {
                if (
                    entry.rest !== undefined &&
                    entry.rest !== null &&
                    typeof entry.rest === "object"
                ) {
                    return [JSON.stringify(entry.ts), entry.line, entry.rest];
                }
                return [JSON.stringify(entry.ts), entry.line];
            })
        };
    });
    return { streams };
}

export function PrepareProtoBatch(batch: Batches) {
    batch.streams = batch.streams.map((logEntry) => {
        // Skip preparation when the batch has been prepared already
        // TODO: The patch blocks new labels to be added, although the situation is better than before
        if (typeof logEntry.labels === "string") {
            return logEntry;
        }
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        let protoLabels = `{level="${logEntry.labels.level}"`;
        delete logEntry.labels.level;
        for (const key in logEntry.labels) {
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            protoLabels += `,${key}="${logEntry.labels[key]}"`;
        }
        protoLabels += "}";
        logEntry.labels = protoLabels;
        return logEntry;
    });
    return batch;
}
