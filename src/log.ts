import { Notice } from "obsidian";
import { StatusError } from "./lib/status_error";

export function LogUpdate(msg: string): void {
    const notice = new Notice(msg, 15000);
    notice.noticeEl.innerHTML = `<b>Templater update</b>:<br/>${msg}`;
}

export function LogError(e: Error | StatusError): void {
    const notice = new Notice("", 10000);
    if (e instanceof StatusError) {
        notice.noticeEl.innerHTML = `<b>Error</b>:<br/>${e.toString()}<br/>Check console for more information`;
        console.error(`Templater Error:`, e.toString(), e);
    } else {
        notice.noticeEl.innerHTML = `<b>Templater Error</b>:<br/>${e.message}`;
    }
}
