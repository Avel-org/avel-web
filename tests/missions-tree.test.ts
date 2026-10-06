import { type MissionListItem, missionListItem } from "avel-server/contract";
import { describe, expect, it } from "vitest";
import {
	buildTree,
	rollup,
	treeKey,
	visibleItems,
} from "@/components/avel/mission-tree";

const id = (n: number) =>
	`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function mission(
	n: number,
	extra: Partial<MissionListItem> = {},
): MissionListItem {
	return missionListItem.parse({
		id: id(n),
		origin: "client",
		type: "full-build",
		sprintN: 1,
		status: "active",
		cut: "vertical",
		cutSource: "derived",
		client: { id: id(900), name: "Meridian" },
		engagement: { id: id(800), name: "Booking" },
		lastExport: null,
		lastActivityAt: null,
		needsYou: null,
		createdAt: "2026-10-01T00:00:00.000Z",
		updatedAt: "2026-10-01T00:00:00.000Z",
		...extra,
	});
}

const A1 = mission(1);
const A2 = mission(2, { status: "halted" });
const B1 = mission(3, { engagement: { id: id(801), name: "Portal" } });
const C1 = mission(4, {
	client: { id: id(901), name: "Northwind" },
	engagement: { id: id(802), name: "Audit" },
});

describe("building the tree", () => {
	it("groups client missions by client, then engagement, in first-seen order", () => {
		const tree = buildTree([A1, C1, B1, A2]);
		expect(tree.map((g) => g.name)).toEqual(["Meridian", "Northwind"]);
		const [meridian] = tree;
		expect(meridian?.groups.map((g) => g.name)).toEqual(["Booking", "Portal"]);
		expect(meridian?.groups[0]?.missions.map((m) => m.id)).toEqual([
			A1.id,
			A2.id,
		]);
		expect(meridian?.missions).toHaveLength(3);
	});

	it("groups internal missions by type, with no client level", () => {
		const internal = [
			mission(10, {
				origin: "internal",
				type: "benchmark",
				client: null,
				engagement: null,
			}),
			mission(11, {
				origin: "internal",
				type: "probe",
				client: null,
				engagement: null,
			}),
			mission(12, {
				origin: "internal",
				type: "benchmark",
				client: null,
				engagement: null,
			}),
		];
		const tree = buildTree(internal);
		expect(tree.map((g) => [g.kind, g.name, g.missions.length])).toEqual([
			["type", "benchmark", 2],
			["type", "probe", 1],
		]);
		expect(tree.every((g) => g.groups.length === 0)).toBe(true);
	});

	it("never lets a client and a type share a node id", () => {
		const ids = buildTree([A1]).map((g) => g.id);
		expect(ids[0]).toBe(`client:${id(900)}`);
	});

	it("rolls up by status, in panel order, leaving out statuses with none", () => {
		expect(rollup([A2, A1, mission(5)])).toEqual([
			{ status: "active", count: 2 },
			{ status: "halted", count: 1 },
		]);
	});
});

describe("the rows on screen", () => {
	const tree = buildTree([A1, A2, C1]);

	it("walks groups and missions in order, with levels and parents", () => {
		const items = visibleItems(tree, new Set());
		expect(
			items.map((i) => [i.level, i.parentId?.split(":")[0] ?? null]),
		).toEqual([
			[1, null],
			[2, "client"],
			[3, "engagement"],
			[3, "engagement"],
			[1, null],
			[2, "client"],
			[3, "engagement"],
		]);
	});

	it("hides a closed group's rows", () => {
		const meridian = tree[0]?.id ?? "";
		const items = visibleItems(tree, new Set([meridian]));
		expect(items.map((i) => i.id)).toEqual([
			meridian,
			tree[1]?.id,
			tree[1]?.groups[0]?.id,
			`mission:${C1.id}`,
		]);
		expect(items[0]?.expanded).toBe(false);
	});
});

describe("the keyboard (WAI-ARIA tree pattern)", () => {
	const tree = buildTree([A1, A2]);
	const open = visibleItems(tree, new Set());
	const client = open[0]?.id ?? "";
	const engagement = open[1]?.id ?? "";
	const leaf = open[2]?.id ?? "";

	it("moves down and up, and stops at the ends", () => {
		expect(treeKey("ArrowDown", open, client)).toEqual({
			type: "focus",
			id: engagement,
		});
		expect(treeKey("ArrowUp", open, engagement)).toEqual({
			type: "focus",
			id: client,
		});
		expect(treeKey("ArrowUp", open, client)).toBeNull();
		expect(treeKey("ArrowDown", open, open.at(-1)?.id ?? "")).toBeNull();
	});

	it("jumps to the first and last rows with Home and End", () => {
		expect(treeKey("Home", open, leaf)).toEqual({ type: "focus", id: client });
		expect(treeKey("End", open, client)).toEqual({
			type: "focus",
			id: open.at(-1)?.id,
		});
	});

	it("opens a closed group with Right, then steps into it", () => {
		const closed = visibleItems(tree, new Set([client]));
		expect(treeKey("ArrowRight", closed, client)).toEqual({
			type: "expand",
			id: client,
		});
		expect(treeKey("ArrowRight", open, client)).toEqual({
			type: "focus",
			id: engagement,
		});
		expect(treeKey("ArrowRight", open, leaf)).toBeNull();
	});

	it("closes an open group with Left, and steps out to the parent otherwise", () => {
		expect(treeKey("ArrowLeft", open, engagement)).toEqual({
			type: "collapse",
			id: engagement,
		});
		expect(treeKey("ArrowLeft", open, leaf)).toEqual({
			type: "focus",
			id: engagement,
		});
		const closed = visibleItems(tree, new Set([client]));
		expect(treeKey("ArrowLeft", closed, client)).toBeNull();
	});

	it("opens a mission with Enter, and does nothing on a group", () => {
		expect(treeKey("Enter", open, leaf)).toEqual({ type: "open", mission: A1 });
		expect(treeKey("Enter", open, client)).toBeNull();
	});
});
