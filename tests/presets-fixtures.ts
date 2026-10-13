import type { AgentTemplate, Preset, Role } from "avel-server/contract";
import { ApiError } from "../src/lib/api";

/**
 * Shared fixtures for the Presets tests. Not a test file: vitest collects
 * only *.test.ts(x). Shapes are the contract's own types, so a contract
 * change that these fixtures no longer satisfy fails the typecheck.
 */

export const ID = (n: number) =>
	`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** A template id whose first group differs from every other fixture's. */
export const TEMPLATE = (n: number) =>
	`${String(n).padStart(8, "a")}-0000-4000-8000-000000000000`;

export function preset(n: number, overrides: Partial<Preset> = {}): Preset {
	return {
		id: ID(n),
		name: `Preset ${n}`,
		description: null,
		cut: "vertical",
		agents: [
			{
				agentTemplateId: TEMPLATE(1),
				waves: ["A", "B"],
				territory: null,
				writablePaths: null,
				estimatedTokens: 120000,
			},
		],
		version: 1,
		createdAt: "2026-10-01T09:00:00.000Z",
		updatedAt: "2026-10-05T09:00:00.000Z",
		...overrides,
	};
}

export function template(n: number, roles: Role[] = ["schema"]): AgentTemplate {
	return {
		id: TEMPLATE(n),
		slug: `template-${n}`,
		name: `Template ${n}`,
		kind: "horizontal",
		description: null,
		roles,
		engagementId: null,
		waveDefaults: ["A"],
		title: "Frontend engineer",
		identityVersion: null,
		identitySha256: null,
		identityStale: false,
		staleInputs: [],
		writablePaths: [],
		version: 1,
		createdAt: "2026-10-01T09:00:00.000Z",
		updatedAt: "2026-10-01T09:00:00.000Z",
	};
}

export const unreachable = () =>
	new ApiError({ method: "GET", path: "/api/x", kind: "unreachable" });

/** A contract error with this code, as the server would answer it. */
export const contractError = (
	code: string,
	status: number,
	details?: unknown,
) =>
	new ApiError({
		method: "GET",
		path: "/api/presets",
		kind: "contract",
		status,
		code,
		message: "for logs only",
		...(details === undefined ? {} : { details }),
	} as ConstructorParameters<typeof ApiError>[0]);
