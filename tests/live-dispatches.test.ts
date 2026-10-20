import type { Dispatch, DispatchStatus } from "avel-server/contract";
import { describe, expect, it } from "vitest";
import { liveOf } from "@/lib/api/dispatches";
import { queryKeys } from "@/lib/api/keys";

/**
 * The Missions dashboard's live view merges each active mission's dispatch
 * read. Only what is queued or running shows, running first; it polls while
 * any list does; its age is the oldest read, so it never flatters.
 */

const at = (status: DispatchStatus, createdAt: string, id = createdAt) =>
	({ id, status, createdAt }) as Dispatch;

const read = (data: Dispatch[] | undefined, dataUpdatedAt: number) => ({
	data,
	dataUpdatedAt,
	status: data ? ("success" as const) : ("pending" as const),
	isFetching: false,
	refetch: () => {},
});

describe("liveOf", () => {
	it("keeps only queued and running dispatches, running first, newest first within", () => {
		const live = liveOf([
			read(
				[
					at("complete", "2026-10-19T10:00:00Z"),
					at("queued", "2026-10-19T11:00:00Z"),
					at("running", "2026-10-19T09:00:00Z"),
				],
				100,
			),
			read(
				[
					at("running", "2026-10-19T12:00:00Z"),
					at("halted", "2026-10-19T12:30:00Z"),
				],
				200,
			),
		]);
		expect(
			live.moving.map((d) => `${d.status} ${d.createdAt.slice(11, 13)}`),
		).toEqual(["running 12", "running 09", "queued 11"]);
		expect(live.polling).toBe(true);
	});

	it("stops polling once nothing moves, and reports the oldest read", () => {
		const live = liveOf([
			read([at("complete", "2026-10-19T10:00:00Z")], 300),
			read([at("failed", "2026-10-19T10:00:00Z")], 150),
		]);
		expect(live.moving).toEqual([]);
		expect(live.polling).toBe(false);
		expect(live.readAt).toBe(150);
		expect(live.status).toBe("success");
	});

	it("is pending until every list has been read, and has no age before the first", () => {
		const live = liveOf([read(undefined, 0), read([], 50)]);
		expect(live.status).toBe("pending");
		expect(liveOf([read(undefined, 0)]).readAt).toBe(0);
	});

	it("refreshes every list at once", () => {
		const calls: number[] = [];
		const live = liveOf([
			{ ...read([], 1), refetch: () => calls.push(1) },
			{ ...read([], 1), refetch: () => calls.push(2) },
		]);
		live.refetch();
		expect(calls).toEqual([1, 2]);
	});
});

describe("the dashboard's moving-dispatch read", () => {
	it("lives under the mission's detail key, so every dispatch write refreshes it", () => {
		const id = "00000000-0000-4000-8000-000000000001";
		// queryKeys.missions.detail in mission-data.ts: ["missions", "detail", id].
		const detail = ["missions", "detail", id];
		const moving = queryKeys.dispatches.moving(id);
		expect(moving.slice(0, detail.length)).toEqual(detail);
		// It is its own entry, never the mission page's full history.
		expect(moving).not.toEqual(queryKeys.dispatches.list(id));
	});
});
