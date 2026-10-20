import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	type DataColumn,
	DataTable,
	type SortState,
} from "@/components/avel/data-table";
import { tagOf } from "./render-page";

// A throwaway row type: the table is typed by whatever the caller passes.
type Row = { key: string; name: string; hash: string; n: number };
const ROWS: Row[] = [
	{ key: "a", name: "Alpha", hash: "0b7e4d2", n: 3 },
	{ key: "b", name: "Beta", hash: "a3f9c21", n: 12 },
];
const COLUMNS: DataColumn<Row>[] = [
	{ id: "name", header: "Name", cell: (r) => r.name, sortable: true },
	{
		id: "hash",
		header: "Hash",
		cell: (r) => r.hash,
		mono: true,
		width: "8rem",
	},
	{
		id: "n",
		header: "Count",
		cell: (r) => r.n,
		align: "end",
		mono: true,
		sortable: true,
	},
];

type Props = Partial<Parameters<typeof DataTable<Row>>[0]>;
const render = (props: Props = {}) =>
	renderToString(
		<DataTable<Row>
			data-testid="t"
			label="Things"
			columns={COLUMNS}
			rows={ROWS}
			getRowId={(r) => r.key}
			{...props}
		/>,
	);

const headerOf = (html: string, column: string) =>
	html.match(new RegExp(`<th[^>]*data-column="${column}"[^>]*>`))?.[0] ?? "";

describe("DataTable", () => {
	it("renders every row with its testid, and every column's cell", () => {
		const html = render();
		expect(html).toMatch(/data-testid="t-row-a"/);
		expect(html).toMatch(/data-testid="t-row-b"/);
		expect(html).toContain(">Alpha<");
		expect(html).toContain(">a3f9c21<");
		expect(html.match(/<th[\s>]/g)).toHaveLength(3);
	});

	it("names itself for screen readers with a hidden caption", () => {
		expect(render()).toContain('<caption class="sr-only">Things</caption>');
	});

	it("sets machine columns in mono with tabular numerals, and aligns as told", () => {
		const html = render();
		const cells = [...html.matchAll(/<td[^>]*class="([^"]*)"[^>]*>([^<]*)</g)];
		const cellOf = (text: string) =>
			cells.find((m) => m[2] === text)?.[1] ?? "";
		expect(cellOf("0b7e4d2")).toMatch(/\btype-mono\b.*\btabular-nums\b/);
		expect(cellOf("Alpha")).not.toMatch(/type-mono/);
		expect(cellOf("12")).toMatch(/\btext-right\b/);
		expect(cellOf("Alpha")).toMatch(/\btext-left\b/);
		expect(headerOf(html, "hash")).toContain("width:8rem");
	});

	it("sets density once, on the container, from the row tokens", () => {
		expect(tagOf(render(), "t")).toContain(
			"[--row-pad:var(--row-comfortable)]",
		);
		expect(tagOf(render({ density: "compact" }), "t")).toContain(
			"[--row-pad:var(--row-compact)]",
		);
		expect(render()).toMatch(/<td[^>]*class="[^"]*py-\(--row-pad\)/);
	});

	it("sticks its header under the page top bar, with no scroll container around it", () => {
		const html = render();
		expect(headerOf(html, "name")).toContain("sticky top-(--topbar-height)");
		expect(tagOf(html, "t-table")).not.toMatch(/overflow/);
		// The Table primitive's wrapper scrolls, which would trap the header.
		expect(html).not.toContain('data-slot="table-container"');
	});

	it("drops stickiness and scrolls sideways when the header need not stick", () => {
		const html = render({ stickyHeader: false });
		// No sticky of its own; the primitive's group-scoped sticky needs a
		// data-sticky-header table, which DataTable never renders.
		expect(headerOf(html, "name")).not.toMatch(/class="(?:[^"]*\s)?sticky\s/);
		expect(headerOf(html, "name")).not.toContain("top-(--topbar-height)");
		expect(tagOf(html, "t-table")).toMatch(/\boverflow-x-auto\b/);
	});
});

describe("DataTable sorting", () => {
	const sort: SortState = { column: "n", direction: "desc" };

	it("shows sort state on sortable headers only, holding no sort itself", () => {
		const html = render({ sort, onSortChange: () => {} });
		expect(headerOf(html, "n")).toContain('aria-sort="descending"');
		expect(headerOf(html, "name")).toContain('aria-sort="none"');
		expect(headerOf(html, "hash")).not.toContain("aria-sort");
		// Rows stay in the order given: Alpha (3) before Beta (12), despite "desc".
		expect(html.indexOf("t-row-a")).toBeLessThan(html.indexOf("t-row-b"));
		expect(
			render({
				sort: { column: "n", direction: "asc" },
				onSortChange: () => {},
			}),
		).toMatch(
			/data-column="n"[^>]*aria-sort="ascending"|aria-sort="ascending"[^>]*data-column="n"/,
		);
	});

	it("draws the direction as a glyph, and offers sort buttons only with a handler", () => {
		const html = render({ sort, onSortChange: () => {} });
		expect(html).toMatch(
			/data-testid="t-sort-n"[^>]*>Count<svg[^>]*lucide-arrow-down/,
		);
		expect(html).toMatch(
			/data-testid="t-sort-name"[^>]*>Name<svg[^>]*lucide-chevrons-up-down/,
		);
		expect(render({ sort })).not.toContain("t-sort-");
		expect(render({ sort })).not.toContain("aria-sort");
	});
});

describe("DataTable expandable rows", () => {
	const html = render({
		renderDetail: (r) => <p data-testid={`d-${r.key}`}>{r.name} detail</p>,
	});

	it("adds a leading chevron button per row that controls its detail row", () => {
		const expand = tagOf(html, "t-expand-a");
		expect(expand).toMatch(/^<button type="button"/);
		expect(expand).toContain('aria-expanded="false"');
		expect(expand).toContain('aria-label="Show details"');
		const controls = expand.match(/aria-controls="([^"]+)"/)?.[1];
		expect(tagOf(html, "t-detail-a")).toContain(`id="${controls}"`);
		expect(html.match(/<th[\s>]/g)).toHaveLength(4);
	});

	it("spans the detail across every column, closed and inert until opened", () => {
		const detail = html.slice(html.indexOf('data-testid="t-detail-a"'));
		expect(detail).toMatch(
			/^[^>]*>\s*<td colSpan="4"|^[^>]*>\s*<td colspan="4"/i,
		);
		expect(tagOf(html, "t-detail-a")).toContain('data-state="closed"');
		expect(detail).toMatch(/<div inert=""[^>]*class="[^"]*grid-rows-\[0fr\]/);
		expect(detail).toContain("transition-[grid-template-rows]");
	});

	it("adds nothing when rows are not expandable", () => {
		const plain = render();
		expect(plain).not.toContain("t-expand-");
		expect(plain).not.toContain("t-detail-");
	});

	it("never mounts a closed row's detail, so a fetching detail waits for expand", () => {
		let calls = 0;
		const out = render({
			renderDetail: (r) => {
				calls++;
				return <p data-testid={`d-${r.key}`}>{r.name} detail</p>;
			},
		});
		expect(calls).toBe(0);
		expect(out).not.toContain('data-testid="d-a"');
		expect(out).not.toContain('data-testid="d-b"');
		// The detail row itself is there, closed, ready to open.
		expect(tagOf(out, "t-detail-a")).toContain('data-state="closed"');
	});
});

describe("DataTable row actions and cards", () => {
	it("makes rows reachable by keyboard only when they act", () => {
		expect(tagOf(render({ onRowClick: () => {} }), "t-row-a")).toMatch(
			/tabindex="0"/i,
		);
		expect(tagOf(render({ onRowClick: () => {} }), "t-row-a")).toMatch(
			/\bcursor-pointer\b/,
		);
		expect(tagOf(render(), "t-row-a")).not.toMatch(/tabindex/i);
	});

	it("swaps the table for stacked cards below md when given a card", () => {
		const html = render({ renderCard: (r) => <div>{`${r.name} card`}</div> });
		expect(tagOf(html, "t-table")).toMatch(/\bmax-md:hidden\b/);
		expect(tagOf(html, "t-cards")).toMatch(/\bmd:hidden\b/);
		expect(tagOf(html, "t-cards")).toContain('aria-label="Things"');
		expect(html).toMatch(/data-testid="t-card-b"[^>]*><div>Beta card<\/div>/);
		expect(render()).not.toContain("t-cards");
		expect(tagOf(render(), "t-table")).not.toContain("max-md:hidden");
	});
});
