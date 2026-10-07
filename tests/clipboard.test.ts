import { describe, expect, it } from "vitest";
import { copyText } from "@/lib/clipboard";

/*
 * copyText says whether a copy worked. It awaits the clipboard, so a refusal
 * is reported rather than lost, and a missing clipboard is a failure too.
 */

describe("copyText", () => {
	it("copies the text and reports Copied", async () => {
		const written: string[] = [];
		const clipboard = {
			writeText: async (text: string) => {
				written.push(text);
			},
		};
		expect(await copyText("abc123", clipboard)).toBe("Copied");
		expect(written).toEqual(["abc123"]);
	});

	it("reports Copy failed when the clipboard refuses", async () => {
		const clipboard = {
			writeText: () => Promise.reject(new Error("NotAllowedError")),
		};
		expect(await copyText("abc123", clipboard)).toBe("Copy failed");
	});

	it("reports Copy failed when there is no clipboard", async () => {
		expect(await copyText("abc123", undefined)).toBe("Copy failed");
	});

	it("waits for the write before reporting", async () => {
		let done = false;
		const clipboard = {
			writeText: () =>
				new Promise<void>((resolve) =>
					setTimeout(() => {
						done = true;
						resolve();
					}, 5),
				),
		};
		await copyText("abc123", clipboard);
		expect(done).toBe(true);
	});
});
