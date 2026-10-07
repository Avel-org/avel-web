import {
	type ApiFetcher,
	type AppRoute,
	initClient,
	ResponseValidationError,
	type SuccessfulHttpStatusCode,
	tsRestFetchApi,
	UnknownStatusError,
	validateResponse,
} from "@ts-rest/core";
import {
	contract,
	type ErrorEnvelope,
	errorEnvelope,
} from "avel-server/contract";
import { ApiError } from "./errors";

/**
 * Where requests go. In the browser it is the app's own origin (""): the app
 * forwards /api to avel-server, so the browser never makes a cross-origin
 * call that CORS would block. Server rendering cannot fetch a relative URL,
 * so on the server it is avel-server's origin, from AVEL_API_ORIGIN (the same
 * variable the proxy reads) or avel-server's default port. VITE_AVEL_API_URL
 * overrides both.
 */
export function resolveBaseUrl(env: {
	isServer: boolean;
	override?: string;
	serverOrigin?: string;
}): string {
	if (env.override) return env.override;
	return env.isServer ? (env.serverOrigin ?? "http://localhost:8787") : "";
}

function defaultBaseUrl(): string {
	return resolveBaseUrl({
		isServer: typeof window === "undefined",
		override: import.meta.env.VITE_AVEL_API_URL,
		serverOrigin:
			typeof process === "undefined" ? undefined : process.env.AVEL_API_ORIGIN,
	});
}

/**
 * A typed client for avel-server's contract. Responses are validated against
 * the contract's Zod shapes, and a status the contract does not declare
 * throws, so a server that drifted from the pinned contract fails loudly
 * instead of handing a screen a shape its types do not describe.
 *
 * `api` is injectable so a test can serve requests from avel-server's own app
 * without a network.
 */
export function createApiClient(
	options: { baseUrl?: string; api?: ApiFetcher } = {},
) {
	return initClient(contract, {
		baseUrl: options.baseUrl ?? defaultBaseUrl(),
		api: validating(options.api ?? tsRestFetchApi),
		throwOnUnknownStatus: true,
	});
}

/** Statuses a gateway in front of avel-server answers when it gets no answer. */
const GATEWAY_STATUSES = new Set([502, 503, 504]);

/** The header avel-server sets on every /api response. */
const REQUEST_ID_HEADER = "x-request-id";

/**
 * Checks every response against the contract before ts-rest hands it back.
 * A status the contract does not declare for the route, or a body that does
 * not match the shape declared for its status, becomes an ApiError here,
 * where the route and the response headers are both at hand, so even a
 * malformed answer carries its request id. ts-rest's own `validateResponse`
 * option is not used: it throws a bare ZodError, which cannot be told apart
 * from a network failure, and it skips any body that is not JSON.
 */
function validating(api: ApiFetcher): ApiFetcher {
	return async (args) => {
		const response = await api({ ...args, validateResponse: false });
		const where = {
			method: args.route.method,
			path: args.route.path,
			requestId: response.headers.get(REQUEST_ID_HEADER) ?? undefined,
		};
		// A gateway's 502, 503 or 504 with no error envelope came from whatever
		// stands in front of avel-server (the dev proxy, a load balancer), not
		// from avel-server: it did not answer. That is unreachable and worth
		// retrying, not a contract mismatch. avel-server's own 502 carries the
		// envelope and stays a contract error.
		if (
			GATEWAY_STATUSES.has(response.status) &&
			!errorEnvelope.safeParse(response.body).success
		) {
			throw new ApiError({ ...where, kind: "unreachable" });
		}
		if (!(response.status in args.route.responses)) {
			throw new ApiError({
				...where,
				kind: "unexpected-status",
				status: response.status,
			});
		}
		try {
			const { body } = validateResponse({ appRoute: args.route, response });
			return { ...response, body };
		} catch (cause) {
			if (!(cause instanceof ResponseValidationError)) throw cause;
			throw new ApiError(
				{ ...where, kind: "invalid-response", status: response.status },
				{ cause },
			);
		}
	};
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** The `data` of a route's success envelope. */
type SuccessData<TResponse> = TResponse extends {
	status: SuccessfulHttpStatusCode;
	body: { success: true; data: infer D };
}
	? D
	: never;

/** The `meta` of a route's success envelope: a list route's cursor and counts. */
type SuccessMeta<TResponse> = TResponse extends {
	status: SuccessfulHttpStatusCode;
	body: { success: true; meta: infer M };
}
	? M
	: never;

/**
 * Runs one request and returns its success envelope's `data`, or throws an
 * ApiError. Every query function goes through this, so hooks return the data
 * itself and `query.error` is always an ApiError with copy in
 * `src/lib/error-map.ts`.
 *
 * Every declared response is an envelope (the contract's success envelope,
 * or the error envelope on 400, 404, 500 and any route-specific error
 * status), and `validating` has already checked the body against it. So a
 * 2xx here is a success envelope and anything else is an error envelope.
 */
export async function call<
	TResponse extends { status: number; body: unknown; headers: Headers },
>(
	route: Pick<AppRoute, "method" | "path">,
	request: () => Promise<TResponse>,
): Promise<SuccessData<TResponse>> {
	const body = await callEnvelope(route, request);
	return body.data as SuccessData<TResponse>;
}

/**
 * call() for a list route: returns the envelope's `data` and its `meta`,
 * where a list keeps its next cursor (and, for missions, its counts).
 */
export async function callPage<
	TResponse extends { status: number; body: unknown; headers: Headers },
>(
	route: Pick<AppRoute, "method" | "path">,
	request: () => Promise<TResponse>,
): Promise<{ data: SuccessData<TResponse>; meta: SuccessMeta<TResponse> }> {
	const body = await callEnvelope(route, request);
	return {
		data: body.data as SuccessData<TResponse>,
		meta: body.meta as SuccessMeta<TResponse>,
	};
}

/** The success envelope, or an ApiError for everything else. */
async function callEnvelope<
	TResponse extends { status: number; body: unknown; headers: Headers },
>(
	route: Pick<AppRoute, "method" | "path">,
	request: () => Promise<TResponse>,
): Promise<{ data: unknown; meta?: unknown }> {
	const where = { method: route.method, path: route.path };
	let response: TResponse;
	try {
		response = await request();
	} catch (cause) {
		if (cause instanceof ApiError) throw cause;
		if (cause instanceof UnknownStatusError) {
			// Unreachable while `validating` checks statuses first; kept so a
			// change of fetcher cannot turn this into "unreachable".
			throw new ApiError(
				{ ...where, kind: "unexpected-status", status: cause.response.status },
				{ cause },
			);
		}
		// fetch rejects only when no response arrived: refused, dropped, or
		// aborted. Anything that answered is handled in `validating`.
		throw new ApiError({ ...where, kind: "unreachable" }, { cause });
	}

	if (response.status >= 200 && response.status < 300) {
		return response.body as { data: unknown; meta?: unknown };
	}
	const { error } = response.body as ErrorEnvelope;
	// Spread whole, so each code keeps the details the contract gives it:
	// code, message, details and requestId, as validated.
	throw new ApiError({
		...where,
		kind: "contract",
		status: response.status,
		...error,
	});
}
