import { describe, expect, it } from "@jest/globals";
import { InstallObsidianDomHelpers } from "../../tests/obsidian_dom";
import { CreateIcon, IconName } from "./icon";

InstallObsidianDomHelpers();

describe("CreateIcon", () => {
    it.each(Object.values(IconName))("creates a span icon for %s", (iconName: IconName) => {
        const tooltip = `tooltip-${iconName}`;
        const span = CreateIcon(tooltip, iconName);

        expect(span.tagName).toBe("SPAN");
        expect(span.className).toBe("progress-icons");
        expect(span.getAttribute("aria-label")).toBe(tooltip);
        expect(span.getAttribute("data-icon")).toBe(iconName);
        expect(span.getAttribute("aria-hidden")).toBe("true");
        // Every icon embeds the matching lucide svg.
        const svg = span.querySelector("svg");
        expect(svg).not.toBeNull();
        expect(svg!.getAttribute("class")).toBe(`lucide lucide-${iconName}`);
    });

    it("covers every icon name in the enum", () => {
        expect(Object.values(IconName)).toHaveLength(12);
    });

    it("creates independent spans on each call", () => {
        const first = CreateIcon("a", IconName.EYE);
        const second = CreateIcon("b", IconName.EYE);
        expect(first).not.toBe(second);
        expect(first.getAttribute("aria-label")).toBe("a");
        expect(second.getAttribute("aria-label")).toBe("b");
    });
});
