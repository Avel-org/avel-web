import type { UseQueryResult } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	ErrorState,
	Surface,
	type SurfaceQuery,
} from "@/components/avel/surface";
import { ApiError } from "@/lib/api";

const html = (element: ReactElement) => renderToString(element);

const states = {
	loading: <p>skeleton rows</p>,
	empty: <p>nothing yet</p>,
	error: ErrorState,
};

// Functions, not constants: a constant with a union annotation is narrowed to
// the variant it was initialised with, which loses the data type.
const pending = (): SurfaceQuery<string[], ApiError> => ({ status: "pending" });
const success = <T,>(data: T) => ({ status: "success", data }) as const;
const failed = (
	error: ApiError,
	isFetching = false,
): SurfaceQuery<string[], ApiError> => ({
	status: "error",
	error,
	refetch: () => undefined,
	isFetching,
});

const unreachable = new ApiError({
	method: "GET",
	path: "/api/health",
	kind: "unreachable",
});
const broken = new ApiError({
	method: "GET",
	path: "/api/health",
	kind: "invalid-response",
	status: 200,
});

describe("<Surface> renders exactly one of its states", () => {
	it("loading: the skeleton, marked busy, and nothing else", () => {
		const out = html(
			<Surface data-testid="r" query={pending()} {...states}>
				{(rows) => <p>{rows.join()}</p>}
			</Surface>,
		);
		expect(out).toContain(
			'data-testid="r" data-state="loading" aria-busy="true"',
		);
		expect(out).toContain("skeleton rows");
		expect(out).not.toContain("nothing yet");
	});

	it("empty: an empty array shows the empty state", () => {
		const out = html(
			<Surface data-testid="r" query={success([] as string[])} {...states}>
				{(rows) => <p>rows: {rows.join()}</p>}
			</Surface>,
		);
		expect(out).toContain('data-state="empty"');
		expect(out).toContain("nothing yet");
		expect(out).not.toContain("rows:");
	});

	it("success: data reaches the children", () => {
		const out = html(
			<Surface data-testid="r" query={success(["a", "b"])} {...states}>
				{(rows) => <p>{`rows: ${rows.join("+")}`}</p>}
			</Surface>,
		);
		expect(out).toContain('data-state="success"');
		expect(out).toContain("rows: a+b");
		expect(out).not.toContain("nothing yet");
	});

	it("a non-array uses its own isEmpty", () => {
		const page = { items: [] as string[], next: null };
		const out = html(
			<Surface
				data-testid="r"
				query={success(page)}
				isEmpty={(p) => p.items.length === 0}
				{...states}
			>
				{() => <p>page</p>}
			</Surface>,
		);
		expect(out).toContain('data-state="empty"');
	});

	it("error: what happened, whether anything was written, and Try again when it can help", () => {
		const out = html(
			<Surface data-testid="r" query={failed(unreachable)} {...states}>
				{() => <p>never</p>}
			</Surface>,
		);
		expect(out).toContain('data-state="error"');
		expect(out).toContain('role="alert"');
		expect(out).toContain("avel-server did not answer.");
		expect(out).toContain("Nothing was written.");
		expect(out).toContain('data-testid="surface-error-retry"');
		expect(out).toContain("Try again");
	});

	it("error: no Try again when retrying cannot change the result", () => {
		const out = html(
			<Surface data-testid="r" query={failed(broken)} {...states}>
				{() => <p>never</p>}
			</Surface>,
		);
		expect(out).toContain("did not match its contract");
		expect(out).not.toContain("surface-error-retry");
		expect(out).not.toContain("Try again");
	});

	it("error: v3's couldn't-load box, with the envelope's code in mono when there is one", () => {
		const notFound = new ApiError({
			method: "GET",
			path: "/api/missions/x",
			kind: "contract",
			status: 404,
			code: "NOT_FOUND",
			message: "no such mission",
		} as ConstructorParameters<typeof ApiError>[0]);
		const out = html(
			<Surface data-testid="r" query={failed(notFound)} {...states}>
				{() => <p>never</p>}
			</Surface>,
		);
		const box = out.match(/<div role="alert"[^>]*>/)?.[0] ?? "";
		for (const cls of ["bg-gate-block-soft", "border-gate-block-line"]) {
			expect(box).toContain(cls);
		}
		expect(out).toMatch(
			/data-testid="surface-error-code"[^>]*>.*<code class="type-mono[^"]*">NOT_FOUND<\/code>/s,
		);
		expect(
			html(
				<Surface data-testid="r" query={failed(unreachable)} {...states}>
					{() => <p>never</p>}
				</Surface>,
			),
		).not.toContain("surface-error-code");
	});

	it("error: shows the request reference whole, in mono, with a copy button", () => {
		// A long id: hashes are content, so it wraps and is never truncated.
		const id = "req_7f3c9a0b2e1d4c6f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d";
		const out = html(
			<Surface
				data-testid="r"
				query={failed(
					new ApiError({
						method: "GET",
						path: "/api/health",
						kind: "invalid-response",
						status: 200,
						requestId: id,
					}),
				)}
				{...states}
			>
				{() => <p>never</p>}
			</Surface>,
		);
		const reference = out.slice(
			out.indexOf('data-testid="surface-error-reference"'),
		);
		expect(reference).toMatch(
			/<span class="type-caption text-text-subtle">Request reference<\/span>/,
		);
		const value = reference.match(
			/<code[^>]*data-testid="surface-error-request-id"[^>]*>([^<]*)</,
		);
		expect(value?.[1]).toBe(id);
		const code = value?.[0] ?? "";
		expect(code).toMatch(/\btype-mono\b/);
		expect(code).toMatch(/\bbreak-all\b/);
		expect(code).not.toMatch(/\btruncate\b|text-ellipsis|line-clamp/);
		const copy =
			reference.match(
				/<button[^>]*data-testid="surface-error-copy"[^>]*>/,
			)?.[0] ?? "";
		expect(copy).toContain('aria-label="Copy request reference"');
		expect(copy).toContain('data-variant="ghost"');
		expect(copy).not.toMatch(/\sdisabled=""/);
		expect(reference).toMatch(
			/<span aria-live="polite" data-testid="surface-error-copy-status" class="sr-only"><\/span>/,
		);
		// Once, under all three lines of the error copy, inside the alert.
		expect(out.match(/data-testid="surface-error-reference"/g)).toHaveLength(1);
		const alert = out.slice(out.indexOf('role="alert"'));
		const before = alert.slice(
			0,
			alert.indexOf('data-testid="surface-error-reference"'),
		);
		expect(before.match(/<p[\s>]/g)).toHaveLength(3);
	});

	it("error: renders no reference line at all without a request id", () => {
		const out = html(
			<Surface data-testid="r" query={failed(unreachable)} {...states}>
				{() => <p>never</p>}
			</Surface>,
		);
		expect(out).not.toContain("surface-error-reference");
		expect(out).not.toContain("Request reference");
		expect(out).not.toContain("surface-error-copy");
	});

	it("error: while retrying, the button is disabled and says so", () => {
		const out = html(
			<Surface data-testid="r" query={failed(unreachable, true)} {...states}>
				{() => <p>never</p>}
			</Surface>,
		);
		expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Trying again<\/button>/);
	});

	it("not built: a centred empty state that states the absence in words", () => {
		const out = html(
			<Surface
				data-testid="r"
				notBuilt={{
					title: "Your missions",
					what: "avel-server has no mission routes yet.",
					needs: ["mission.list"],
				}}
			/>,
		);
		expect(out).toContain('data-testid="r" data-state="not-built"');
		expect(out).toContain('data-testid="surface-not-built"');
		// The glyph never stands alone: the eyebrow says "Not built".
		expect(out).toMatch(/lucide-circle-dashed/);
		expect(out).toMatch(/data-testid="empty-state-eyebrow"[^>]*>Not built</);
		expect(out).toMatch(/data-testid="empty-state-title"[^>]*>Your missions</);
		expect(out).toContain("avel-server has no mission routes yet.");
		expect(out).toMatch(
			/data-testid="surface-not-built-need"[^>]*>mission.list</,
		);
	});

	it("not built: grows to fill its parent, so it centres in the page", () => {
		const out = html(
			<Surface
				data-testid="r"
				notBuilt={{ title: "T", what: "Nothing yet.", needs: [] }}
			/>,
		);
		expect(out).toMatch(/data-state="not-built" class="flex flex-1 flex-col"/);
		expect(out).not.toContain("surface-not-built-need");
	});

	it("not built: takes the route's icon when given one", () => {
		const out = html(
			<Surface
				data-testid="r"
				notBuilt={{ title: "T", what: "W", needs: [], icon: Layers }}
			/>,
		);
		expect(out).toMatch(/lucide-layers/);
		expect(out).not.toMatch(/lucide-circle-dashed/);
	});

	it("not built, inline: one line for a narrow column, the why in its title and read out", () => {
		const out = html(
			<Surface
				data-testid="r"
				notBuilt={{
					title: "The rule",
					what: "No rule is recorded yet.",
					needs: [],
					size: "inline",
					line: "Not recorded yet.",
				}}
			/>,
		);
		expect(out).toContain('data-testid="r" data-state="not-built"');
		// No flex-1 column: it sits on a line, not filling a region.
		expect(out).not.toMatch(/data-state="not-built" class="flex flex-1/);
		const line = out.match(/<p[^>]*data-testid="surface-not-built"[^>]*>/)?.[0];
		expect(line).toContain('title="No rule is recorded yet."');
		expect(out).toContain(">Not built<");
		expect(out).toContain(">Not recorded yet.<");
		expect(out).toMatch(/class="sr-only">No rule is recorded yet\.</);
		expect(out).toMatch(/lucide-circle-dashed/);
	});
});

// Type-level checks, compiled by `pnpm typecheck`. Each directive fails the
// build if <Surface> stops rejecting what it names. Elements are created,
// never rendered.
describe("<Surface> rejects a missing state at compile time", () => {
	it("compiles only with every required prop", () => {
		const query = pending() as UseQueryResult<string[], ApiError>;
		// A TanStack Query result is a SurfaceQuery.
		const asSurface: SurfaceQuery<string[], ApiError> = query;
		expect(asSurface.status).toBe("pending");

		// @ts-expect-error loading is required
		<Surface data-testid="r" query={query} empty={null} error={ErrorState}>
			{() => null}
		</Surface>;
		// @ts-expect-error empty is required
		<Surface data-testid="r" query={query} loading={null} error={ErrorState}>
			{() => null}
		</Surface>;
		// @ts-expect-error error is required
		<Surface data-testid="r" query={query} loading={null} empty={null}>
			{() => null}
		</Surface>;
		// @ts-expect-error success (children) is required
		<Surface
			data-testid="r"
			query={query}
			loading={null}
			empty={null}
			error={ErrorState}
		/>;
		// @ts-expect-error a non-array result has to say what empty means
		<Surface
			data-testid="r"
			query={success({ items: [] })}
			loading={null}
			empty={null}
			error={ErrorState}
		>
			{() => null}
		</Surface>;
		// @ts-expect-error a not-built region has no query to render
		<Surface
			data-testid="r"
			notBuilt={{ title: "t", what: "x", needs: [] }}
			query={query}
		/>;
		// @ts-expect-error data-testid is required
		<Surface notBuilt={{ title: "t", what: "x", needs: [] }} />;
		// @ts-expect-error a not-built region must say what will live there
		<Surface data-testid="r" notBuilt={{ what: "x", needs: [] }} />;
	});
});
