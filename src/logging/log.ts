import { Notice } from "obsidian";
import { StatusError } from "../lib/status_error";
import type winston from "winston";

export function LogUpdate(msg: string): void {
    const notice = new Notice(msg, 15000);
    notice.messageEl.innerHTML = `<b>Logged update</b>:<br/>${msg}`;
}

export function LogError(logger: winston.Logger, e: Error | StatusError): void {
    const notice = new Notice("", 10000);
    if (e instanceof StatusError) {
        notice.messageEl.innerHTML = `<b>Error</b>:<br/>${e.toString()}<br/>Check console for more information`;
        const meta: Record<string, unknown> = {};
        for (const [key, value] of e.getPayload().entries()) {
            meta[key] = value;
        }
        logger.crit(e.toString(), meta);
    } else {
        notice.messageEl.innerHTML = `<b>Logged Error</b>:<br/>${e.message}`;
        logger.crit(`Logged Error: ${e.message}`, e.toString(), e);
    }
}
