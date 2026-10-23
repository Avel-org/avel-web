import { QueryClient } from "@tanstack/react-query";
import type { ApiFetcher } from "@ts-rest/core";
import { contract } from "avel-server/contract";
import { describe, expect, it } from "vitest";
import {
	ApiError,
	call,
	createApiClient,
	healthQuery,
	queryKeys,
	resolveBaseUrl,
} from "@/lib/api";
import { describeError } from "@/lib/error-map";

const NOW = "2026-10-05T12:00:00.000Z";
const HEALTH = {
	ok: true,
	service: "avel-server",
	time: NOW,
} as const;
const FIRST_ID = "00000000-0000-4000-8000-000000000001";

// avel-server's own app, clock and ids: the real handler for the real route,
// served in-process with no network. Imported by path because the package
// exports only its contract, and dynamically so avel-web's type check does
// not compile the server's source under DOM types (its `duplex` request
// option exists only in Node's types).
type ServerApp = {
	request: (url: string, init?: RequestInit) => Promise<Response>;
};
const server = new URL("../../../avel-server/avel-server/src/", import.meta.url)
	.href;
const { createApp } = (await import(/* @vite-ignore */ `${server}app.ts`)) as {
	createApp: (deps: {
		clock: unknown;
		ids: unknown;
		logger: unknown;
		auth: unknown;
		db: () => unknown;
		webOrigins: readonly string[];
		drive: unknown;
		checkRunner: unknown;
	}) => ServerApp;
};
const { fixedClock } = (await import(
	/* @vite-ignore */ `${server}lib/clock.ts`
)) as { fixedClock: (iso: string) => unknown };
const { sequentialIds } = (await import(
	/* @vite-ignore */ `${server}lib/ids.ts`
)) as { sequentialIds: () => unknown };

const { silentLogger } = (await import(
	/* @vite-ignore */ `${server}lib/logger.ts`
)) as { silentLogger: () => unknown };

// The Drive's byte store, in memory (no disk), as the server's own test
// harnesses build it. AppDeps is all-required, so the app needs one even
// though these tests never upload.
const { memoryBlobs } = (await import(
	/* @vite-ignore */ `${server}gateways/blob.ts`
)) as { memoryBlobs: () => unknown };
const { DEFAULT_UPLOAD_MAX_BYTES } = (await import(
	/* @vite-ignore */ `${server}routes/files.ts`
)) as { DEFAULT_UPLOAD_MAX_BYTES: number };

// The one stand-in: auth's session lookup, which always answers "no session".
// Health is public (src/middleware/auth.ts, isPublicPath), so it never asks;
// any other route gets the server's real UNAUTHENTICATED envelope from its
// real middleware and error path. Real sign-in needs Better Auth's database,
// which this repo does not run.
const signedOut = { operatorFor: async () => ({ refused: "no_session" }) };

// No database: health never asks for one, and this proves it by failing
// loudly if anything does.
const noDatabase = () => {
	throw new Error("this test runs no database");
};

const realApp = () =>
	createApp({
		clock: fixedClock(NOW),
		ids: sequentialIds(),
		logger: silentLogger(),
		auth: signedOut,
		db: noDatabase,
		webOrigins: [],
		drive: { blobs: memoryBlobs(), maxBytes: DEFAULT_UPLOAD_MAX_BYTES },
		// The gate's check runner (avel-server, gate-check-runner): null runs
		// no test, typecheck or command check, as the server's own stubs do.
		checkRunner: null,
	});

async function read(res: Response) {
	const json = res.headers.get("content-type")?.includes("json");
	return {
		status: res.status,
		body: json ? await res.json() : await res.text(),
		headers: res.headers,
	};
}

function inProcess(app: ServerApp): ApiFetcher {
	return async ({ path, method, headers, body }) =>
		read(await app.request(path, { method, headers, body: body ?? undefined }));
}

// A fetcher that answers with whatever a test needs, standing in for a
// server that drifted from the contract.
function answering(
	status: number,
	body: unknown,
	{ type = "json", requestId }: { type?: string; requestId?: string } = {},
): ApiFetcher {
	return async () => ({
		status,
		body,
		headers: new Headers({
			"content-type": `application/${type}`,
			...(requestId ? { "x-request-id": requestId } : {}),
		}),
	});
}

const ok = (data: unknown) => ({ success: true, data });
const envelope = (code: string, extra: Record<string, unknown> = {}) => ({
	success: false,
	error: { code, message: "for logs only", requestId: "req-1", ...extra },
});

async function failure(promise: Promise<unknown>) {
	const error = await promise.then(
		() => null,
		(e: unknown) => e,
	);
	expect(error).toBeInstanceOf(ApiError);
	return (error as ApiError).failure;
}

const health = (api: ApiFetcher) => {
	const client = createApiClient({ baseUrl: "http://avel.test", api });
	return call(contract.health, () => client.health());
};

describe("the data layer against avel-server's real health route", () => {
	it("speaks the envelope, with a request id header, on the wire", async () => {
		const res = await realApp().request("/api/health");
		expect(res.headers.get("x-request-id")).toBe(FIRST_ID);
		expect(await res.json()).toEqual({ success: true, data: HEALTH });
	});

	it("returns the envelope's data through a query, end to end", async () => {
		const api = createApiClient({
			baseUrl: "http://avel.test",
			api: inProcess(realApp()),
		});
		const data = await new QueryClient().fetchQuery(healthQuery(api));
		expect(data).toEqual(HEALTH);
	});

	it("turns the server's own error envelope into an ApiError with its code", async () => {
		// A real refusal from the real app: without a session, a non-public
		// route answers 401 before anything else, even one that does not exist.
		const answer = await read(await realApp().request("/api/missions"));
		expect(answer.headers.get("x-request-id")).toBe(FIRST_ID);
		const where = { method: "GET", path: "/api/missions" } as const;
		expect(await failure(call(where, async () => answer))).toEqual({
			...where,
			kind: "contract",
			status: 401,
			code: "UNAUTHENTICATED",
			message: "Sign in to continue",
			requestId: FIRST_ID,
		});
	});

	it("keys the health query by its one definition", () => {
		const api = createApiClient({ api: answering(200, ok(HEALTH)) });
		expect(healthQuery(api).queryKey).toEqual(queryKeys.health());
		expect(queryKeys.health()).toEqual(["health"]);
	});
});

describe("every answer becomes data or an ApiError the error map can read", () => {
	const where = { method: "GET", path: "/api/health" } as const;

	it("unwraps the success envelope: hooks get data, never the envelope", async () => {
		expect(await health(answering(200, ok(HEALTH)))).toEqual(HEALTH);
		expect(
			await health(answering(200, { ...ok(HEALTH), meta: { page: 1 } })),
		).toEqual(HEALTH);
	});

	it("rejects a bare body: every response is an envelope now", async () => {
		expect(
			await failure(health(answering(200, HEALTH, { requestId: "req-9" }))),
		).toEqual({
			...where,
			kind: "invalid-response",
			status: 200,
			requestId: "req-9",
		});
	});

	it("maps an error envelope to its code, message, details and request id", async () => {
		const details = { body: [{ path: ["name"], message: "Required" }] };
		for (const status of [400, 404, 500]) {
			expect(
				await failure(
					health(
						answering(status, envelope("VALIDATION_FAILED", { details }), {
							requestId: "req-1",
						}),
					),
				),
			).toEqual({
				...where,
				kind: "contract",
				status,
				code: "VALIDATION_FAILED",
				message: "for logs only",
				details,
				requestId: "req-1",
			});
		}
	});

	it("carries a precondition's typed reason, and a validation failure's issues", async () => {
		const precondition = await failure(
			health(
				answering(
					422,
					envelope("PRECONDITION_FAILED", {
						details: { reason: "client_closed", clientId: FIRST_ID },
					}),
				),
			),
		);
		expect(precondition).toMatchObject({
			kind: "contract",
			code: "PRECONDITION_FAILED",
			details: { reason: "client_closed", clientId: FIRST_ID },
		});
		const issues = { body: [{ path: ["name"], message: "Required" }] };
		expect(
			await failure(
				health(
					answering(400, envelope("VALIDATION_FAILED", { details: issues })),
				),
			),
		).toMatchObject({ code: "VALIDATION_FAILED", details: issues });
	});

	it("rejects a precondition failure whose details break the contract", async () => {
		for (const details of [undefined, {}, { reason: "something_else" }]) {
			expect(
				(
					await failure(
						health(
							answering(422, envelope("PRECONDITION_FAILED", { details })),
						),
					)
				).kind,
			).toBe("invalid-response");
		}
	});

	it("rejects an error code outside the contract's closed union", async () => {
		expect(
			(await failure(health(answering(404, envelope("SOMETHING_NEW"))))).kind,
		).toBe("invalid-response");
	});

	it("keeps the header's request id when the body is not an envelope", async () => {
		expect(
			await failure(
				health(
					answering(404, "Not Found", { type: "text", requestId: "req-7" }),
				),
			),
		).toEqual({
			...where,
			kind: "invalid-response",
			status: 404,
			requestId: "req-7",
		});
	});

	it("a refused connection is unreachable, with no request id", async () => {
		const failed = await failure(
			health(async () => {
				throw new TypeError("fetch failed");
			}),
		);
		expect(failed).toEqual({ ...where, kind: "unreachable" });
	});

	it("a non-JSON body for a JSON route is invalid-response", async () => {
		expect(
			(await failure(health(answering(200, "ok", { type: "text" })))).kind,
		).toBe("invalid-response");
	});

	it("a status the contract does not declare is unexpected-status", async () => {
		// 418, not a gateway status: a bare 503 is the gateway case below.
		expect(
			await failure(
				health(answering(418, "teapot", { type: "text", requestId: "req-5" })),
			),
		).toEqual({
			...where,
			kind: "unexpected-status",
			status: 418,
			requestId: "req-5",
		});
	});

	for (const status of [502, 503, 504]) {
		it(`a gateway's bare ${status} is unreachable, so a read offers Try again`, async () => {
			// What the dev proxy sends while avel-server restarts: JSON, but not
			// the error envelope.
			const proxy = { message: "avel-server is not reachable" };
			const failed = await failure(health(answering(status, proxy)));
			expect(failed).toEqual({ ...where, kind: "unreachable" });
			const copy = describeError(new ApiError(failed));
			expect(copy.retry).toBe(true);
			expect(copy.what).toBe("avel-server did not answer.");
			// And a text body, as a load balancer's error page would be.
			expect(
				(
					await failure(
						health(answering(status, "Bad Gateway", { type: "text" })),
					)
				).kind,
			).toBe("unreachable");
		});
	}

	it("keeps a gateway answer's request id when it has one", async () => {
		expect(
			await failure(
				health(answering(503, "down", { type: "text", requestId: "req-3" })),
			),
		).toEqual({ ...where, kind: "unreachable", requestId: "req-3" });
	});

	it("avel-server's own 502, with the envelope, stays a contract error", async () => {
		const failed = await failure(
			health(answering(502, envelope("EXTERNAL_GITHUB"))),
		);
		expect(failed.kind).toBe("contract");
		expect(failed).toMatchObject({ status: 502, code: "EXTERNAL_GITHUB" });
	});

	it("an enveloped 503, which the contract does not declare, stays unexpected-status", async () => {
		expect(
			(await failure(health(answering(503, envelope("INTERNAL"))))).kind,
		).toBe("unexpected-status");
	});

	it("a write the gateway dropped is unreachable but not retried for you", async () => {
		const copy = describeError(
			new ApiError({
				method: "POST",
				path: "/api/clients",
				kind: "unreachable",
			}),
		);
		expect(copy.retry).toBe(false);
		expect(copy.written).toBe(
			"AVEL cannot tell whether this change was saved.",
		);
	});

	it("an off-contract 200 is still invalid-response, never unreachable", async () => {
		expect(
			(await failure(health(answering(200, { unexpected: true })))).kind,
		).toBe("invalid-response");
	});

	it("an undeclared success status is not trusted as success", async () => {
		// The contract declares only 200 for health, so 201 has no shape to
		// validate against. Returning its body would hand a screen data its
		// types do not describe.
		expect(await failure(health(answering(201, ok(HEALTH))))).toEqual({
			...where,
			kind: "unexpected-status",
			status: 201,
		});
	});

	it("exposes the request id on the error itself, for support", async () => {
		const error = await health(
			answering(500, envelope("INTERNAL"), { requestId: "req-1" }),
		).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(ApiError);
		expect((error as ApiError).requestId).toBe("req-1");
	});
});

// The running server, when there is one. Skipped, not failed, without it,
// the same way avel-server's database tests skip without DATABASE_URL.
const live = await fetch("http://localhost:8787/api/health").then(
	(r) => r.ok,
	() => false,
);

describe.skipIf(!live)("the data layer against a running avel-server", () => {
	it("fetches health over the network, unwrapped and validated", async () => {
		const api = createApiClient({ baseUrl: "http://localhost:8787" });
		const data = await new QueryClient().fetchQuery(healthQuery(api));
		expect(data.ok).toBe(true);
		expect(data.service).toBe("avel-server");
		expect(Number.isNaN(Date.parse(data.time))).toBe(false);
	});

	it("sends a request id header with every answer", async () => {
		const res = await fetch("http://localhost:8787/api/health");
		expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
	});
});

describe("where requests go", () => {
	it("in the browser, the app's own origin, so /api goes through its proxy", () => {
		expect(resolveBaseUrl({ isServer: false })).toBe("");
		expect(
			resolveBaseUrl({ isServer: false, serverOrigin: "http://avel:9000" }),
		).toBe("");
	});

	it("on the server, an absolute origin, because SSR cannot fetch a relative URL", () => {
		expect(resolveBaseUrl({ isServer: true })).toBe("http://localhost:8787");
		expect(
			resolveBaseUrl({ isServer: true, serverOrigin: "http://avel:9000" }),
		).toBe("http://avel:9000");
	});

	it("a client built without a base URL uses this rule", async () => {
		// Tests run in Node, so this is the server side: AVEL_API_ORIGIN.
		const saved = process.env.AVEL_API_ORIGIN;
		process.env.AVEL_API_ORIGIN = "http://origin.test";
		try {
			let requested = "";
			const api = createApiClient({
				api: async (args) => {
					requested = args.path;
					return answering(200, ok(HEALTH))(args);
				},
			});
			await call(contract.health, () => api.health());
			expect(requested).toBe("http://origin.test/api/health");
		} finally {
			if (saved === undefined) delete process.env.AVEL_API_ORIGIN;
			else process.env.AVEL_API_ORIGIN = saved;
		}
	});

	it("an explicit override wins on both sides", () => {
		for (const isServer of [true, false]) {
			expect(resolveBaseUrl({ isServer, override: "https://api.test" })).toBe(
				"https://api.test",
			);
		}
	});
});

// The app's own /api proxy in `pnpm dev`, when the dev server is up: the
// browser's path, same-origin, end to end to avel-server.
const proxied = await fetch("http://localhost:3000/api/health").then(
	(r) => r.ok,
	() => false,
);

describe.skipIf(!proxied)("the data layer through the app's /api proxy", () => {
	it("fetches health from the app's origin, unwrapped and validated", async () => {
		const api = createApiClient({ baseUrl: "http://localhost:3000" });
		const data = await new QueryClient().fetchQuery(healthQuery(api));
		expect(data.service).toBe("avel-server");
	});
});
