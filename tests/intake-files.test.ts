import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
	INTAKE_FILE_MAX_BYTES,
	intakeFileContentUrl,
	purgeIntakeFile,
	uploadIntakeFile,
	uploadProblem,
} from "@/lib/api/intake-files";

/**
 * Intake uploads are byte routes outside the ts-rest contract, but they fail
 * exactly as contract calls do: an ApiError with the envelope's code and
 * request id, or "unreachable" when no envelope answered.
 */

const INTAKE = "00000000-0000-4000-8000-000000000001";

afterEach(() => {
	vi.unstubAllGlobals();
});

const answer = (status: number, body: unknown) =>
	vi.fn(
		async () =>
			new Response(body === null ? "" : JSON.stringify(body), { status }),
	);

describe("uploading an intake file", () => {
	it("sends the raw bytes to ?name= and returns the stored file", async () => {
		const fetch = answer(201, {
			success: true,
			data: { id: "f1", name: "brief.md", mime: "text/markdown" },
		});
		vi.stubGlobal("fetch", fetch);
		const file = new Blob(["# Brief"], { type: "text/markdown" });
		const saved = await uploadIntakeFile(INTAKE, file, "brief v2.md");
		expect(saved.id).toBe("f1");
		const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		// The browser posts same-origin; under node the base is the server origin.
		expect(
			url.endsWith(`/api/intakes/${INTAKE}/files?name=brief%20v2.md`),
		).toBe(true);
		expect(init.method).toBe("POST");
		expect(init.body).toBe(file);
		expect(init.credentials).toBe("same-origin");
	});

	it("turns a refusal into an ApiError with the envelope's code and request id", async () => {
		vi.stubGlobal(
			"fetch",
			answer(400, {
				success: false,
				error: {
					code: "VALIDATION_FAILED",
					message: "for logs only",
					requestId: "req-9",
				},
			}),
		);
		const error = await uploadIntakeFile(
			INTAKE,
			new Blob(["x"]),
			"a.svg",
		).catch((e) => e);
		expect(error).toBeInstanceOf(ApiError);
		expect(error.failure).toMatchObject({
			kind: "contract",
			status: 400,
			code: "VALIDATION_FAILED",
		});
		expect(error.requestId).toBe("req-9");
	});

	it("reads a gateway's 502 with no envelope as unreachable", async () => {
		vi.stubGlobal("fetch", answer(502, null));
		const error = await purgeIntakeFile(INTAKE, "f1").catch((e) => e);
		expect(error.failure.kind).toBe("unreachable");
	});

	it("reads a refused connection as unreachable", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new TypeError("Failed to fetch");
			}),
		);
		const error = await purgeIntakeFile(INTAKE, "f1").catch((e) => e);
		expect(error.failure.kind).toBe("unreachable");
	});

	it("checks only the size before sending: the server decides the type", () => {
		expect(uploadProblem({ size: INTAKE_FILE_MAX_BYTES })).toBeNull();
		expect(uploadProblem({ size: INTAKE_FILE_MAX_BYTES + 1 })).toBe(
			"This file is over 10 MB, the most an intake takes.",
		);
	});

	it("points a download at the content route", () => {
		expect(
			intakeFileContentUrl(INTAKE, "f1").endsWith(
				`/api/intakes/${INTAKE}/files/f1/content`,
			),
		).toBe(true);
	});
});

describe("after an upload or a purge", () => {
	it("reads the intake's file list again, purged or not, and the log", async () => {
		const { QueryClient } = await import("@tanstack/react-query");
		const { afterIntakeFileWrite } = await import("@/lib/api/intake-files");
		const { queryKeys } = await import("@/lib/api/keys");
		const qc = new QueryClient({
			defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } },
		});
		const keys = [
			queryKeys.intakes.files(INTAKE, false),
			queryKeys.intakes.files(INTAKE, true),
			queryKeys.activity.all(),
		];
		for (const key of keys) qc.setQueryData([...key], {});
		const other = queryKeys.intakes.files(
			"00000000-0000-4000-8000-000000000002",
			false,
		);
		qc.setQueryData([...other], {});
		await afterIntakeFileWrite(qc, INTAKE);
		for (const key of keys)
			expect(qc.getQueryState([...key])?.isInvalidated, String(key)).toBe(true);
		expect(qc.getQueryState([...other])?.isInvalidated).toBe(false);
	});
});
