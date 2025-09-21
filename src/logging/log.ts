import { Notice } from "obsidian";
import { StatusError } from "../lib/status_error";
import type { Logger } from "./winston/logger";

export function LogUpdate(msg: string): void {
    const notice = new Notice(msg, 15000);
    notice.messageEl.innerHTML = `<b>Logged update</b>:<br/>${msg}`;
}

export function CreateErrorNotice(msg: string): void {
    const notice = new Notice("", 10000);
    notice.messageEl.innerHTML = msg;
}

export function LogError(logger: Logger, e: Error | StatusError): void {
    if (e instanceof StatusError) {
        CreateErrorNotice(
            `<b>Error</b>:<br/>${e.toString()}<br/>Check console for more information`
        );
        const meta: Record<string, unknown> = {};
        for (const [key, value] of e.getPayload().entries()) {
            meta[key] = value;
        }
        logger.crit(e.toString(), meta);
    } else {
        CreateErrorNotice(`<b>Logged Error</b>:<br/>${e.message}`);
        logger.crit(`Logged Error: ${e.message}`, { stack: e.stack, error: e });
    }
}
