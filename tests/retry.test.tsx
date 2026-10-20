import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { retryOf } from "@/components/avel/retry";
import { ErrorState } from "@/components/avel/surface";
import { ApiError } from "@/lib/api";

// An unreachable server on a read: the error map says retrying can help.
const unreachable = new ApiError({
	method: "GET",
	path: "/api/x",
	kind: "unreachable",
});

describe("Try again on a failed write", () => {
	it("sends the same variables again, so a kept attempt replays its key", () => {
		const mutate = vi.fn();
		const attempt = { key: "k-1", body: { contentMd: "hi" } };
		const r = retryOf({ variables: attempt, mutate, isPending: false });
		r.retry?.();
		expect(mutate).toHaveBeenCalledWith(attempt, undefined);
		expect(r.retrying).toBe(false);
		expect(
			retryOf({ variables: attempt, mutate, isPending: true }).retrying,
		).toBe(true);
	});

	it("runs the first send's callbacks, so a retry that lands clears the kept attempt", () => {
		const mutate = vi.fn();
		const attempt = { key: "k-1", body: { contentMd: "hi" } };
		const sent = { onSuccess: () => {} };
		retryOf({ variables: attempt, mutate, isPending: false }, sent).retry?.();
		expect(mutate).toHaveBeenCalledWith(attempt, sent);
	});

	it("offers nothing to retry before anything was sent", () => {
		expect(
			retryOf({ variables: undefined, mutate: vi.fn(), isPending: false })
				.retry,
		).toBeUndefined();
	});

	it("shows Try again only with something to retry, never a button that does nothing", () => {
		const without = renderToString(<ErrorState error={unreachable} />);
		expect(without).not.toContain('data-testid="surface-error-retry"');
		const withRetry = renderToString(
			<ErrorState error={unreachable} retry={() => {}} retrying={false} />,
		);
		expect(withRetry).toContain('data-testid="surface-error-retry"');
	});
});
