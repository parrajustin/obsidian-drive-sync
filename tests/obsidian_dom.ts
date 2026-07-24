/**
 * Test-only shims for the DOM helpers that Obsidian adds to `Element`/`HTMLElement`
 * (`createEl`, `createDiv`, `createSpan`, `empty`) and to the global scope
 * (`createEl`/`createDiv`/`createSpan`). These mirror the subset of Obsidian's
 * `DomElementInfo` behavior used by the plugin UI code so the real UI modules can
 * run under jsdom.
 */

interface TestDomElementInfo {
    cls?: string | string[];
    text?: string;
    attr?: Record<string, string | number | boolean | null>;
}
type TestDomInfoArg = TestDomElementInfo | string | undefined;

function ApplyInfo(el: HTMLElement, info: TestDomInfoArg): void {
    if (info === undefined) {
        return;
    }
    if (typeof info === "string") {
        el.className = info;
        return;
    }
    if (info.cls !== undefined) {
        el.className = Array.isArray(info.cls) ? info.cls.join(" ") : info.cls;
    }
    if (info.text !== undefined) {
        el.textContent = info.text;
    }
    if (info.attr !== undefined) {
        for (const [key, value] of Object.entries(info.attr)) {
            if (value !== null) {
                el.setAttribute(key, String(value));
            }
        }
    }
}

function CreateElement(tag: string, info: TestDomInfoArg, cb?: (el: any) => void): HTMLElement {
    const el = document.createElement(tag);
    ApplyInfo(el, info);
    if (cb !== undefined) {
        cb(el);
    }
    return el;
}

/** Installs the Obsidian DOM helpers onto jsdom prototypes and the global scope. */
export function InstallObsidianDomHelpers(): void {
    const proto = Element.prototype as any;
    proto.empty = function (this: Element): void {
        while (this.firstChild !== null) {
            this.removeChild(this.firstChild);
        }
    };
    proto.createEl = function (
        this: Element,
        tag: string,
        info?: TestDomInfoArg,
        cb?: (el: any) => void
    ): HTMLElement {
        const el = CreateElement(tag, info, cb);
        this.appendChild(el);
        return el;
    };
    proto.createDiv = function (
        this: Element,
        info?: TestDomInfoArg,
        cb?: (el: any) => void
    ): HTMLElement {
        return (this as any).createEl("div", info, cb);
    };
    proto.createSpan = function (
        this: Element,
        info?: TestDomInfoArg,
        cb?: (el: any) => void
    ): HTMLElement {
        return (this as any).createEl("span", info, cb);
    };

    const globalScope = globalThis as any;
    globalScope.createEl = (tag: string, info?: TestDomInfoArg, cb?: (el: any) => void) =>
        CreateElement(tag, info, cb);
    globalScope.createDiv = (info?: TestDomInfoArg, cb?: (el: any) => void) =>
        CreateElement("div", info, cb);
    globalScope.createSpan = (info?: TestDomInfoArg, cb?: (el: any) => void) =>
        CreateElement("span", info, cb);

    // jsdom does not lay text out, so make `innerText` a deterministic alias of
    // `textContent` for both reads and writes.
    Object.defineProperty(HTMLElement.prototype, "innerText", {
        configurable: true,
        get(this: HTMLElement): string {
            return this.textContent ?? "";
        },
        set(this: HTMLElement, value: string) {
            this.textContent = value;
        }
    });
}
