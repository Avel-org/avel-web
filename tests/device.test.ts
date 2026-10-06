import { describe, expect, it } from "vitest";

// Every route module, imported for real, so the check reads the staticData the
// router will see rather than guessing from file text.
const modules = import.meta.glob<{
	Route: { options: { staticData?: { device?: unknown } } };
}>(["../src/routes/*.tsx", "!../src/routes/__root.tsx"], { eager: true });

const DEVICES = ["capture", "construction", "approve"];

describe("every route declares a device class", () => {
	it("found the route modules", () => {
		expect(Object.keys(modules).length).toBeGreaterThan(0);
	});

	it("each declares capture, construction or approve", () => {
		const missing = Object.entries(modules)
			.filter(
				([, mod]) =>
					!DEVICES.includes(mod.Route.options.staticData?.device as string),
			)
			.map(([path]) => path.replace("../src/routes/", ""));
		expect(missing).toEqual([]);
	});
});
