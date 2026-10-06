import type { ApiFetcher } from "@ts-rest/core";
import type {
	Client,
	Engagement,
	PreconditionDetails,
	ValidationDetails,
} from "avel-server/contract";
import { ApiError, type ApiFailure, createApiClient } from "../src/lib/api";

/**
 * Shared fixtures for the Clients tests. Not a test file: vitest collects
 * only *.test.ts(x). Shapes are the contract's own types, so a contract
 * change that these fixtures no longer satisfy fails the typecheck.
 */

const ID = (n: number) =>
	`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export function client(n: number, overrides: Partial<Client> = {}): Client {
	return {
		id: ID(n),
		name: `Client ${n}`,
		status: "active",
		primaryContact: `contact${n}@example.com`,
		notesMd: null,
		engagementCount: 3,
		activeEngagementCount: 1,
		createdAt: "2026-10-01T09:00:00.000Z",
		updatedAt: "2026-10-05T09:00:00.000Z",
		...overrides,
	};
}

export function engagement(
	n: number,
	clientId: string,
	overrides: Partial<Engagement> = {},
): Engagement {
	return {
		id: ID(1000 + n),
		clientId,
		name: `Engagement ${n}`,
		scopeMd: null,
		status: "active",
		startedAt: "2026-09-01T00:00:00.000Z",
		closedAt: null,
		createdAt: "2026-09-01T00:00:00.000Z",
		updatedAt: "2026-09-01T00:00:00.000Z",
		...overrides,
	};
}

/**
 * An error envelope's failure, as the data layer would throw it. Typed per
 * code, like the contract: a precondition carries its reason, a validation
 * failure its issues, so a test cannot build an error the server cannot send.
 */
export function contractError(
	status: number,
	code: "PRECONDITION_FAILED",
	details: PreconditionDetails,
): ApiError;
export function contractError(
	status: number,
	code: "VALIDATION_FAILED",
	details?: ValidationDetails,
): ApiError;
export function contractError(
	status: number,
	code: "CONFLICT" | "NOT_FOUND",
): ApiError;
export function contractError(
	status: number,
	code: "VALIDATION_FAILED" | "PRECONDITION_FAILED" | "CONFLICT" | "NOT_FOUND",
	details?: PreconditionDetails | ValidationDetails,
): ApiError {
	// The overloads above pair each code with its details; this body only
	// assembles them, so the one cast is safe.
	return new ApiError({
		method: "POST",
		path: "/api/x",
		kind: "contract",
		status,
		code,
		message: "server message, never shown",
		details,
		requestId: "req_test",
	} as ApiFailure);
}

export type Recorded = { method: string; path: string; body: unknown };

/**
 * An API client whose fetcher answers from `respond` and records each call.
 * The default answer fails the test: a render that is not meant to fetch
 * proves it did not.
 */
export function fakeApi(
	respond: (call: Recorded) => { status: number; body: unknown } = (call) => {
		throw new Error(`unexpected request: ${call.method} ${call.path}`);
	},
) {
	const calls: Recorded[] = [];
	const api: ApiFetcher = async (args) => {
		const call = {
			method: args.method,
			path: args.path,
			body: args.body ? JSON.parse(String(args.body)) : undefined,
		};
		calls.push(call);
		const { status, body } = respond(call);
		return { status, body, headers: new Headers() };
	};
	return {
		client: createApiClient({ baseUrl: "http://avel.test", api }),
		calls,
	};
}
