import { Notice } from "obsidian";
import { StatusError } from "../lib/status_error";
// import {
//     LOKI_ACCESS_CLIENT_ID,
//     LOKI_ACCESS_CLIENT_SECRET,
//     LOKI_URL,
//     PLUGIN_ENVIRONMENT,
//     PLUGIN_VERSION
// } from "../constants";

export function LogUpdate(msg: string): void {
    const notice = new Notice(msg, 15000);
    notice.messageEl.innerHTML = `<b>Logged update</b>:<br/>${msg}`;
}

export function LogError(e: Error | StatusError): void {
    const notice = new Notice("", 10000);
    if (e instanceof StatusError) {
        notice.messageEl.innerHTML = `<b>Error</b>:<br/>${e.toString()}<br/>Check console for more information`;
        // eslint-disable-next-line no-console
        console.error(`Logged Error:`, e.toString(), e);
    } else {
        notice.messageEl.innerHTML = `<b>Logged Error</b>:<br/>${e.message}`;
    }
}
