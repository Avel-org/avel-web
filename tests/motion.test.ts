import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	enterFrames,
	enterKindOf,
	STATE_MS,
	watchEntering,
} from "../src/shell/motion";

// Motion within AVEL-DESIGN.md section 4: the state duration, nothing
// bouncy, and no motion under reduced motion. The watcher animates only
// elements added to a container marked data-enter.

const css = readFileSync(
	new URL("../src/styles/app.css", import.meta.url),
	"utf8",
);

const attrs = (value: string | null) => ({
	getAttribute: (name: string) => (name === "data-enter" ? value : null),
});

describe("entering", () => {
	it("reads the kind off the container, and nothing else", () => {
		expect(enterKindOf(attrs("rise"))).toBe("rise");
		expect(enterKindOf(attrs("fade"))).toBe("fade");
		expect(enterKindOf(attrs("settle"))).toBe("settle");
		expect(enterKindOf(attrs("bounce"))).toBeNull();
		expect(enterKindOf(attrs(null))).toBeNull();
		expect(enterKindOf(null)).toBeNull();
	});

	it("goes only from faint to settled: no overshoot", () => {
		for (const kind of ["rise", "fade", "settle"] as const) {
			const frames = enterFrames(kind);
			expect(frames).toHaveLength(2);
			expect(frames[0]?.opacity).toBe(0);
			expect(frames[1]?.opacity).toBe(1);
		}
		expect(enterFrames("settle")[0]?.transform).toBe("scale(0.6)");
		expect(enterFrames("rise")[0]?.transform).toBe("translateY(3px)");
	});

	it("runs for the state duration the stylesheet names", () => {
		expect(css).toMatch(
			new RegExp(String.raw`--duration-state:\s*${STATE_MS}ms`),
		);
	});
});

describe("the watcher", () => {
	let fire: (records: unknown[]) => void = () => {};
	const reduce = { matches: false };

	function install() {
		vi.stubGlobal(
			"MutationObserver",
			class {
				constructor(callback: (records: unknown[]) => void) {
					fire = callback;
				}
				observe() {}
				disconnect() {}
			},
		);
		class FakeElement {
			animate = vi.fn();
		}
		vi.stubGlobal("HTMLElement", FakeElement);
		vi.stubGlobal("SVGElement", class {});
		vi.stubGlobal("window", { matchMedia: () => reduce });
		watchEntering({} as Node);
		return FakeElement;
	}

	afterEach(() => {
		vi.unstubAllGlobals();
		reduce.matches = false;
	});

	it("animates an element added to a marked container, with that kind", () => {
		const El = install();
		const row = new El();
		fire([{ target: attrs("rise"), addedNodes: [row] }]);
		expect(row.animate).toHaveBeenCalledTimes(1);
		expect(row.animate.mock.calls[0]?.[0]).toEqual(enterFrames("rise"));
		expect(row.animate.mock.calls[0]?.[1]).toMatchObject({
			duration: STATE_MS,
		});
	});

	it("leaves an element added anywhere unmarked alone", () => {
		const El = install();
		const row = new El();
		fire([{ target: attrs(null), addedNodes: [row] }]);
		expect(row.animate).not.toHaveBeenCalled();
	});

	it("does nothing under reduced motion", () => {
		const El = install();
		reduce.matches = true;
		const row = new El();
		fire([{ target: attrs("fade"), addedNodes: [row] }]);
		expect(row.animate).not.toHaveBeenCalled();
	});
});

describe("the gate run's sweep", () => {
	it("loops only through its utilities, which the reduced-motion rule stops", () => {
		expect(css).toMatch(/@utility progress-sweep \{\s*animation: avelSweep/);
		expect(css).toMatch(/@utility progress-sheen \{[^}]*animation: avelSheen/);
		expect(css).toMatch(
			/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-iteration-count: 1 !important/,
		);
	});
});
