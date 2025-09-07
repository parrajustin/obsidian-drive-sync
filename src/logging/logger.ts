import { LokiTransport } from "./loki/transport";
import type TransportStream from "winston-transport";
import {
    IS_TEST_ENV,
    LOKI_ACCESS_CLIENT_ID,
    LOKI_ACCESS_CLIENT_SECRET,
    LOKI_URL,
    PLUGIN_ENVIRONMENT,
    PLUGIN_VERSION,
    RUN_ID,
    SERVICE_NAME
} from "../constants";
import { format } from "logform";
import type { Logger } from "winston";
import winston, { createLogger, transports } from "winston";
import { THIS_APP } from "../main_app";

const USER_ID_FORMAT = format((info, _opts) => {
    if (THIS_APP.none) {
        return info;
    }
    info.uid = THIS_APP.safeValue()
        .userCreds.map((v) => v.user.uid)
        .valueOr(undefined);
    info.email = THIS_APP.safeValue()
        .userCreds.map((v) => v.user.email)
        .valueOr(undefined);
    return info;
});

export function CreateLogger(label: string): Logger {
    let transportStreams: TransportStream[] = [
        new LokiTransport({
            level: "error",
            host: LOKI_URL,
            labels: {
                env: PLUGIN_ENVIRONMENT,
                version: PLUGIN_VERSION,
                // eslint-disable-next-line @typescript-eslint/naming-convention, camelcase
                service_name: SERVICE_NAME,
                scene: label
            },
            format: format.combine(
                USER_ID_FORMAT(),
                format.label({ label }),
                format.timestamp(),
                format.json()
            ),
            headers: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "CF-Access-Client-Id": LOKI_ACCESS_CLIENT_ID,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "CF-Access-Client-Secret": LOKI_ACCESS_CLIENT_SECRET
            },
            clearOnError: false,
            onConnectionError: (err: unknown) => {
                console.log("ERROR!", err);
            }
        })
    ];
    if (PLUGIN_ENVIRONMENT !== "production") {
        transportStreams.unshift(
            new transports.Console({
                level: "debug",
                format: format.combine(
                    USER_ID_FORMAT(),
                    format.label({ label }),
                    format.timestamp(),
                    format.prettyPrint()
                )
            })
        );
    }
    if (IS_TEST_ENV) {
        transportStreams = [];
    }

    return createLogger({
        levels: winston.config.syslog.levels,
        format: format.combine(
            USER_ID_FORMAT(),
            format.label({ label }),
            format.timestamp(),
            format.prettyPrint()
        ),
        defaultMeta: { env: PLUGIN_ENVIRONMENT, version: PLUGIN_VERSION, runId: RUN_ID },
        transports: transportStreams
    });
}
