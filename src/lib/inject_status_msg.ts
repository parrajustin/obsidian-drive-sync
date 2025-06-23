import type { StatusError } from "./status_error";

export function InjectStatusMsg(
    msg: string,
    meta?: Record<string, string>
): (error: StatusError) => void {
    return (error: StatusError) => {
        error.message = `${msg} | ${error.message}`;
        if (meta !== undefined) {
            InjectMeta(meta)(error);
        }
    };
}

export function InjectMeta(meta: Record<string, string>): (error: StatusError) => void {
    return (error: StatusError) => {
        for (const key of Object.keys(meta)) {
            const value = meta[key]!;
            error.setPayload(key, value);
        }
    };
}
