import { initContract } from "@ts-rest/core";
import {
	type contract,
	type ErrorCode,
	errorCode,
	PRECONDITION_REASONS,
	type PreconditionReason,
} from "avel-server/contract";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
	ApiError,
	type ApiFailure,
	type ContractErrorCode,
	type ErrorCodeOf,
} from "@/lib/api";
import {
	CONTRACT_ERROR_COPY,
	describeError,
	describeWith,
	type ErrorCopyTable,
	PRECONDITION_COPY,
} from "@/lib/error-map";

// The mechanism is proven on a stand-in contract, so the type checks below
// can name codes that are missing or invented. These codes are test
// fixtures, not AVEL's vocabulary; the real table is tested further down.
const c = initContract();
const envelope = <C extends string>(code: z.ZodType<C>) =>
	z.object({
		success: z.literal(false),
		error: z.object({ code, message: z.string(), requestId: z.string() }),
	});
const fixture = c.router({
	thing: {
		create: {
			method: "POST",
			path: "/things",
			body: z.object({}),
			responses: {
				201: z.object({ id: z.string() }),
				409: envelope(z.literal("FIXTURE_REPLAY")),
				422: envelope(z.enum(["FIXTURE_PRECONDITION", "FIXTURE_LIMIT"])),
			},
		},
	},
});
type FixtureCode = ErrorCodeOf<typeof fixture>;

const copy = (what: string) => ({
	what,
	written: "Nothing was written.",
	next: "Do the next thing.",
	retry: false,
});

const table: ErrorCopyTable<FixtureCode> = {
	FIXTURE_REPLAY: copy("replay"),
	FIXTURE_PRECONDITION: copy("precondition"),
	FIXTURE_LIMIT: copy("limit"),
};

// Type-level checks. `pnpm typecheck` compiles this file, so each line below
// fails the build if the mechanism stops catching what it names.
// @ts-expect-error a code with no copy fails the build
const missing: ErrorCopyTable<FixtureCode> = {
	FIXTURE_REPLAY: copy("replay"),
	FIXTURE_PRECONDITION: copy("precondition"),
};
const invented: ErrorCopyTable<FixtureCode> = {
	...table,
	// @ts-expect-error a code the contract does not define fails the build
	FIXTURE_INVENTED: copy("invented"),
};
// @ts-expect-error a code outside the union cannot be described
const unknownCode: FixtureCode = "SOMETHING_ELSE";
// The union is exactly the codes in the envelopes, from every status.
type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;
const derived: Equals<
	FixtureCode,
	"FIXTURE_REPLAY" | "FIXTURE_PRECONDITION" | "FIXTURE_LIMIT"
> = true;
void [missing, invented, unknownCode, derived];

const fail = <T extends string>(failure: ApiFailure<T>) =>
	new ApiError(failure);
const read = { method: "GET", path: "/api/x" } as const;
const write = { method: "POST", path: "/api/x" } as const;

describe("the error map is keyed on the contract's codes", () => {
	it("returns the table's copy for a contract code", () => {
		const describe = describeWith(table);
		expect(
			describe(
				fail({
					...write,
					kind: "contract",
					status: 422,
					code: "FIXTURE_LIMIT",
					message: "for logs only",
				}),
			),
		).toEqual(copy("limit"));
	});
});

describe("copy for failures that arrive without an envelope", () => {
	it("an unreachable read wrote nothing and can be tried again", () => {
		const c = describeError(fail({ ...read, kind: "unreachable" }));
		expect(c.written).toBe("Nothing was written.");
		expect(c.retry).toBe(true);
	});

	it("an unreachable write says it cannot tell, and offers no blind retry", () => {
		const c = describeError(fail({ ...write, kind: "unreachable" }));
		expect(c.written).toBe("AVEL cannot tell whether this change was saved.");
		expect(c.retry).toBe(false);
	});

	it("a server failure on a read can be tried again", () => {
		const c = describeError(
			fail({ ...read, kind: "unexpected-status", status: 503 }),
		);
		expect(c.what).toContain("503");
		expect(c.retry).toBe(true);
	});

	it("an undeclared 4xx will repeat, so there is no Try again", () => {
		const c = describeError(
			fail({ ...read, kind: "unexpected-status", status: 404 }),
		);
		expect(c.retry).toBe(false);
	});

	it("a response that broke the contract will repeat, so there is no Try again", () => {
		const c = describeError(
			fail({ ...read, kind: "invalid-response", status: 200 }),
		);
		expect(c.retry).toBe(false);
		expect(c.written).toBe("Nothing was written.");
	});

	it("never parses a message: copy depends on kind, method and status only", () => {
		const a = new ApiError({ ...read, kind: "unreachable" });
		const b = new ApiError({ ...read, kind: "unreachable" });
		b.message = "something entirely different";
		expect(describeError(a)).toEqual(describeError(b));
	});
});

// The real table, keyed on avel-server's own union. Type checks first: the
// error map's code type is the contract's union exactly, and every code any
// route can answer with is in it.
const sameUnion: Equals<ContractErrorCode, ErrorCode> = true;
const routesCovered: Equals<
	Exclude<ErrorCodeOf<typeof contract>, ContractErrorCode>,
	never
> = true;
void [sameUnion, routesCovered];

const CODES = errorCode.options;
const as = (method: "GET" | "POST", code: ErrorCode) =>
	describeError(
		new ApiError({
			method,
			path: "/api/x",
			kind: "contract",
			status: 400,
			code,
			message: "for logs only",
			requestId: "req-1",
			// The one code whose details are required.
			...(code === "PRECONDITION_FAILED"
				? { details: { reason: "client_closed" } }
				: {}),
		} as ApiFailure),
	);

describe("copy for every code in avel-server's contract", () => {
	it("has an entry for each of the contract's codes, and no others", () => {
		expect(CODES).toHaveLength(22);
		expect(Object.keys(CONTRACT_ERROR_COPY).sort()).toEqual([...CODES].sort());
	});

	it("writes every line as a plain sentence: capital or name first, a full stop, no middle dot or dash aside", () => {
		for (const code of CODES) {
			for (const method of ["GET", "POST"] as const) {
				const copy = as(method, code);
				for (const line of [copy.what, copy.written, copy.next]) {
					expect(line, `${code} ${method}: ${line}`).toMatch(
						/^(?:[A-Z]|avel-server)[^·—]*\.$/,
					);
				}
			}
		}
	});

	it("offers Try again only where retrying can change the result", () => {
		const retryable = CODES.flatMap((code) =>
			(["GET", "POST"] as const)
				.filter((method) => as(method, code).retry)
				.map((method) => `${code} ${method}`),
		);
		expect(retryable.sort()).toEqual([
			"EXTERNAL_GITHUB GET",
			"EXTERNAL_GITHUB POST",
			"INTERNAL GET",
		]);
	});

	it("says a failed read wrote nothing, and a failed write cannot be sure", () => {
		expect(as("GET", "INTERNAL").written).toBe("Nothing was written.");
		expect(as("POST", "INTERNAL").written).toBe(
			"AVEL cannot tell whether this change was saved.",
		);
		expect(as("GET", "EXTERNAL_GITHUB").written).toBe("Nothing was written.");
		expect(as("POST", "EXTERNAL_GITHUB").written).toMatch(/cannot tell/);
	});

	it("follows BLAST-RADIUS.md where it says what the screen offers", () => {
		expect(as("POST", "POLICY_FORBIDS_TARGET").next).toMatch(/pull request/);
		expect(as("POST", "TREE_TOO_LARGE").next).toMatch(/zip/);
		expect(as("POST", "REPO_NOT_FOUND").next).toMatch(/zip/);
		expect(as("POST", "BLAST_RADIUS_VIOLATION").next).toMatch(
			/cannot be overridden/,
		);
		expect(as("POST", "PREVIEW_STALE").next).toMatch(/Preview again/);
		expect(as("POST", "DETERMINISM_VIOLATION").what).toMatch(
			/failure in AVEL, not in your work/,
		);
	});

	it("never reads the server's message: two messages, one copy", () => {
		const with_ = (message: string) =>
			describeError(
				new ApiError({
					...write,
					kind: "contract",
					status: 409,
					code: "CONFLICT",
					message,
					requestId: "req-1",
				}),
			);
		expect(with_("one thing")).toEqual(with_("something else entirely"));
	});
});

const precondition = (reason: PreconditionReason) =>
	describeError(
		new ApiError({
			method: "POST",
			path: "/api/engagements",
			kind: "contract",
			status: 422,
			code: "PRECONDITION_FAILED",
			message: "for logs only",
			requestId: "req-1",
			details: { reason },
		}),
	);

describe("PRECONDITION_FAILED says which precondition, from its typed reason", () => {
	it("has copy for exactly the contract's reasons", () => {
		expect(Object.keys(PRECONDITION_COPY).sort()).toEqual(
			[...PRECONDITION_REASONS].sort(),
		);
	});

	it("tells the operator what to do for each reason, never the pre-flight wording", () => {
		expect(precondition("client_has_active_engagements")).toEqual({
			what: "This client still has active engagements.",
			written: "Nothing was changed.",
			next: "Close its active engagements first, then close the client.",
			retry: false,
		});
		expect(precondition("client_not_found").what).toBe(
			"This client no longer exists.",
		);
		expect(precondition("client_closed").next).toMatch(/^Reopen the client/);
		for (const reason of PRECONDITION_REASONS) {
			expect(precondition(reason).next).not.toMatch(/pre-flight/);
		}
	});

	it("types details only once the code is narrowed", () => {
		const read = (error: ApiError) => {
			const { failure } = error;
			if (
				failure.kind === "contract" &&
				failure.code === "PRECONDITION_FAILED"
			) {
				const reason: PreconditionReason = failure.details.reason;
				return reason;
			}
			if (failure.kind === "contract" && failure.code === "VALIDATION_FAILED") {
				return failure.details?.body?.[0]?.message;
			}
			if (failure.kind === "contract") {
				// @ts-expect-error other codes' details stay unknown
				return failure.details.reason;
			}
			return undefined;
		};
		expect(
			read(
				new ApiError({
					method: "POST",
					path: "/x",
					kind: "contract",
					status: 422,
					code: "PRECONDITION_FAILED",
					message: "m",
					requestId: "r",
					details: { reason: "client_closed" },
				}),
			),
		).toBe("client_closed");
	});

	it("refuses to build a precondition failure without its reason", () => {
		const build = () =>
			new ApiError({
				method: "POST",
				path: "/x",
				kind: "contract",
				status: 422,
				code: "PRECONDITION_FAILED",
				message: "m",
				requestId: "r",
				// @ts-expect-error details.reason is required for this code
				details: {},
			});
		expect(build).not.toThrow();
	});
});
