import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataPanel } from "../src/components/avel/data-panel";
import { EXPORT_LIFECYCLE, Lifecycle } from "../src/components/avel/lifecycle";
import { Table, TableBody } from "../src/components/ui/table";

// Where motion happens is where a container is marked data-enter
// (motion.ts): rows into a table rise, what replaces a panel's content
// fades, a lifecycle's new current mark settles. Without the marker the
// change is instant, so the markers are the contract.

describe("the containers that animate what enters them", () => {
	it("rises a row into any table body", () => {
		const html = renderToString(
			<Table>
				<TableBody />
			</Table>,
		);
		expect(html).toMatch(/<tbody data-slot="table-body" data-enter="rise"/);
	});

	it("fades in what replaces a panel's content, and its changed count", () => {
		const html = renderToString(
			<DataPanel data-testid="p" title="Clients" count={3}>
				<p>rows</p>
			</DataPanel>,
		);
		expect(html).toMatch(/<div data-enter="fade" class="min-h-0[^"]*"><p>rows/);
		// The count's parent fades in a new count (the badge is keyed by it).
		expect(html).toMatch(
			/data-testid="p-toggle" data-enter="fade"[\s\S]*data-testid="p-count"/,
		);
	});

	it("settles the mark on a lifecycle's current step, and eases its fill", () => {
		const html = renderToString(
			<Lifecycle
				spec={EXPORT_LIFECYCLE}
				current="previewed"
				label="Export"
				data-testid="lc"
			/>,
		);
		expect(html).toMatch(
			/<span aria-hidden="true" data-enter="settle" class="[^"]*transition-colors duration-\(--duration-state\)/,
		);
	});
});
