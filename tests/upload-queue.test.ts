import { describe, expect, it } from "vitest";
import { uploadQueue } from "@/components/avel/intake-files";

/** A promise the test settles by hand: an upload still in flight. */
function deferred() {
	let resolve: () => void = () => {};
	const promise = new Promise<void>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("intake uploads, one at a time across drops", () => {
	it("starts a second drop's files only after the first's finish, never overlapping", async () => {
		const log: string[] = [];
		const inFlight = new Map<string, ReturnType<typeof deferred>>();
		let running = 0;
		let most = 0;
		const queue = uploadQueue(async (name: string) => {
			running++;
			most = Math.max(most, running);
			log.push(`start ${name}`);
			const d = deferred();
			inFlight.set(name, d);
			await d.promise;
			log.push(`end ${name}`);
			running--;
		});

		void queue.add(["a1", "a2"]);
		await tick();
		// A second drop while the first is uploading: it waits its turn.
		void queue.add(["b1"]);
		await tick();
		expect(log).toEqual(["start a1"]);

		for (const name of ["a1", "a2", "b1"]) {
			inFlight.get(name)?.resolve();
			await tick();
			await tick();
		}
		expect(log).toEqual([
			"start a1",
			"end a1",
			"start a2",
			"end a2",
			"start b1",
			"end b1",
		]);
		expect(most).toBe(1);
	});

	it("runs again for a drop after the queue has emptied", async () => {
		const done: string[] = [];
		const queue = uploadQueue(async (name: string) => {
			done.push(name);
		});
		await queue.add(["x"]);
		await queue.add(["y"]);
		expect(done).toEqual(["x", "y"]);
	});
});
