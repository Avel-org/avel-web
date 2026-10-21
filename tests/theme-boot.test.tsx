import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BOOT_THEME_SCRIPT, ThemeRoot } from "@/lib/theme";

/*
 * The stored theme applies after hydration, so a dark viewer saw the light
 * shell first. An inline script in the wrapper marks it dark before paint.
 */

/** Runs the boot script against a fake wrapper and storage. */
function boot(stored: string | null, { throws = false } = {}) {
	const classes = new Set(["app"]);
	const attrs: Record<string, string> = { "data-theme": "light" };
	const wrapper = {
		classList: { add: (c: string) => classes.add(c) },
		setAttribute: (k: string, v: string) => {
			attrs[k] = v;
		},
	};
	const localStorage = {
		getItem: () => {
			if (throws) throw new Error("blocked");
			return stored;
		},
	};
	const document = { currentScript: { parentElement: wrapper } };
	new Function("localStorage", "document", BOOT_THEME_SCRIPT)(
		localStorage,
		document,
	);
	return { classes: [...classes], theme: attrs["data-theme"] };
}

describe("the theme before paint", () => {
	it("marks the wrapper dark when the viewer chose dark", () => {
		expect(boot("dark")).toEqual({ classes: ["app", "dark"], theme: "dark" });
	});

	it("leaves light, the default, alone, and survives blocked storage", () => {
		expect(boot("light")).toEqual({ classes: ["app"], theme: "light" });
		expect(boot(null)).toEqual({ classes: ["app"], theme: "light" });
		expect(boot("dark", { throws: true })).toEqual({
			classes: ["app"],
			theme: "light",
		});
	});

	it("sits inside the themed wrapper, first, so it runs before the shell paints", () => {
		const html = renderToString(
			<ThemeRoot>
				<p>shell</p>
			</ThemeRoot>,
		);
		expect(html).toMatch(/^<div data-theme="light" class="app"><script>/);
		expect(html).toContain('localStorage.getItem("avel.theme")');
	});
});
