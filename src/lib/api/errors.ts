import type {
	AppRoute,
	AppRouter,
	ClientInferResponseBody,
} from "@ts-rest/core";
import type { ErrorCode, ErrorEnvelope } from "avel-server/contract";

/**
 * The error codes a router can answer with, read from the error envelopes in
 * its responses (`{ success: false, error: { code } }`). Used to prove that
 * every code a route can return is in the contract's union, and to test the
 * error map with a stand-in contract.
 */
export type ErrorCodeOf<T> = T extends AppRoute
	? CodeIn<ClientInferResponseBody<T>>
	: T extends AppRouter
		? { [K in keyof T]: ErrorCodeOf<T[K]> }[keyof T]
		: never;

type CodeIn<TBody> = TBody extends {
	success: false;
	error: { code: infer C extends string };
}
	? C
	: never;

/**
 * Every error code avel-server can return: the contract's own closed union
 * (src/contract/shared/errors.ts). `src/lib/error-map.ts` is keyed on it, so
 * a code the server adds fails this app's build until it has copy.
 */
export type ContractErrorCode = ErrorCode;

type Where = { method: string; path: string };

/**
 * An error envelope's body. For avel-server's own codes it is the contract's
 * union, discriminated on `code`, so narrowing on the code types `details`
 * (PRECONDITION_FAILED's reason, VALIDATION_FAILED's issues). A stand-in
 * vocabulary, as tests use, gets open details.
 */
export type ContractErrorBody<TCode extends string> = [TCode] extends [
	ContractErrorCode,
]
	? [ContractErrorCode] extends [TCode]
		? // Whole, not Omit<>: Omit over a union merges its members, and the
			// details would lose their per-code types.
			ErrorEnvelope["error"]
		: GenericErrorBody<TCode>
	: GenericErrorBody<TCode>;

type GenericErrorBody<TCode extends string> = {
	code: TCode;
	message: string;
	details?: unknown;
};

// Distributes the envelope's union, so each code keeps its own details.
type ContractFailure<TCode extends string> =
	ContractErrorBody<TCode> extends infer Body
		? Body extends unknown
			? { kind: "contract"; status: number } & Body
			: never
		: never;

/**
 * Why a request failed. Only `contract` comes from the server's vocabulary:
 * an error envelope, with its code, message (for logs and support; copy
 * never reads it), details typed by code, and request id. The
 * other three are what the client sees when no valid envelope arrives, and
 * they are client-side kinds, not error codes.
 *
 * `requestId` is the id support needs to find the request in the server's
 * logs: the envelope's, or the x-request-id header when there is no
 * envelope. Undefined only when nothing answered at all.
 */
export type ApiFailure<TCode extends string = ContractErrorCode> = Where & {
	requestId?: string;
} & (
		| { kind: "unreachable" }
		| { kind: "unexpected-status"; status: number }
		| { kind: "invalid-response"; status: number }
		| ContractFailure<TCode>
	);

/**
 * Thrown by every call through `src/lib/api`, and registered as TanStack
 * Query's default error, so `query.error` is always one of these.
 */
export class ApiError<TCode extends string = ContractErrorCode> extends Error {
	readonly failure: ApiFailure<TCode>;

	constructor(failure: ApiFailure<TCode>, options?: { cause?: unknown }) {
		super(`${failure.method} ${failure.path}: ${failure.kind}`, options);
		this.name = "ApiError";
		this.failure = failure;
	}

	/** The id to quote to support, when the server answered. */
	get requestId(): string | undefined {
		return this.failure.requestId;
	}
}
