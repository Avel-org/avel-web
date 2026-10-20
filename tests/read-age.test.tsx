import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	isStale,
	pollingLabel,
	ReadAge,
	readAgeLabel,
} from "@/components/avel/read-age";
import { Surface } from "@/components/avel/surface";
import { QUERY_STALE_MS } from "@/lib/api/provider";
import { tagOf } from "./render-page";

/**
 * A region says how fresh its data is (design and data flow audit, F1): when
 * it was read, stale past its threshold with Refresh, and what it does while
 * it polls. It never says "Live".
 */

const NOW = Date.parse("2026-10-19T12:00:00.000Z");
const MIN = 60_000;

afterEach(() => {
	vi.useRealTimers();
});
const at = (now: number) => {
	vi.useFakeTimers();
	vi.setSystemTime(now);
};

describe("the read age", () => {
	it("says when the data was read, from the query's dataUpdatedAt", () => {
		expect(readAgeLabel(NOW, NOW)).toBe("Read just now");
		expect(readAgeLabel(NOW - 4 * MIN, NOW)).toBe("Read 4 minutes ago");
		// A server clock a little ahead never reads as the future.
		expect(readAgeLabel(NOW + 5_000, NOW)).toBe("Read just now");
	});

	it("is stale only past the region's threshold", () => {
		expect(isStale(NOW - 30_000, NOW, 30_000)).toBe(false);
		expect(isStale(NOW - 30_001, NOW, 30_000)).toBe(true);
	});

	it("names the poll interval while polling, and Final once it stops", () => {
		expect(pollingLabel("polling")).toBe(
			"Updating every 5 s while a dispatch runs",
		);
		expect(pollingLabel("final")).toBe("Final");
	});

	it("marks a stale value with the broken ring and offers Refresh", () => {
		at(NOW);
		const html = renderToString(
			<ReadAge
				readAt={NOW - 2 * MIN}
				staleAfterMs={30_000}
				onRefresh={() => {}}
			/>,
		);
		expect(tagOf(html, "read-age")).toContain('data-stale="true"');
		expect(html).toContain('data-tone="stale"');
		expect(html).toContain(">Read 2 minutes ago<");
		expect(html).toContain('data-testid="read-age-refresh"');
	});

	it("shows a fresh value plainly, with no Refresh", () => {
		at(NOW);
		const html = renderToString(
			<ReadAge
				readAt={NOW - 5_000}
				staleAfterMs={30_000}
				onRefresh={() => {}}
			/>,
		);
		expect(tagOf(html, "read-age")).toContain('data-stale="false"');
		expect(html).not.toContain("read-age-refresh");
		expect(html).not.toContain('data-tone="stale"');
	});

	it("never says Live, and a polling region is never stale", () => {
		at(NOW);
		const html = renderToString(
			<ReadAge
				readAt={NOW - 10 * MIN}
				staleAfterMs={30_000}
				onRefresh={() => {}}
				polling="polling"
			/>,
		);
		expect(html).toContain(">Updating every 5 s while a dispatch runs<");
		expect(html).not.toMatch(/\bLive\b/);
		expect(html).not.toContain("read-age-refresh");
	});
});

describe("a Surface with freshness", () => {
	const props = {
		loading: <p>loading</p>,
		empty: <p>empty</p>,
		error: () => <p>error</p>,
		children: (rows: string[]) => <p>{rows.join(",")}</p>,
	};

	it("puts the read age under its data, at the query client's stale time by default", () => {
		at(NOW);
		const html = renderToString(
			<Surface
				data-testid="r"
				freshness={{}}
				query={{
					status: "success",
					data: ["a"],
					dataUpdatedAt: NOW - QUERY_STALE_MS - 1,
					refetch: () => {},
					isFetching: false,
				}}
				{...props}
			/>,
		);
		expect(html.indexOf(">a<")).toBeLessThan(html.indexOf("r-read-age"));
		expect(tagOf(html, "r-read-age")).toContain('data-stale="true"');
	});

	it("shows the age on an empty region too: an empty list has an age", () => {
		at(NOW);
		const html = renderToString(
			<Surface
				data-testid="r"
				freshness={{ staleAfterMs: 5 * MIN }}
				query={{
					status: "success",
					data: [],
					dataUpdatedAt: NOW - MIN,
					refetch: () => {},
				}}
				{...props}
			/>,
		);
		expect(html).toContain(">empty<");
		expect(tagOf(html, "r-read-age")).toContain('data-stale="false"');
	});

	it("says nothing without freshness, or without a read time", () => {
		at(NOW);
		const without = renderToString(
			<Surface
				data-testid="r"
				query={{
					status: "success",
					data: ["a"],
					dataUpdatedAt: NOW,
					refetch: () => {},
				}}
				{...props}
			/>,
		);
		const unread = renderToString(
			<Surface
				data-testid="r"
				freshness={{}}
				query={{ status: "success", data: ["a"] }}
				{...props}
			/>,
		);
		expect(without).not.toContain("read-age");
		expect(unread).not.toContain("read-age");
	});
});
