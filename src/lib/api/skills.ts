import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	type CreateSkillBody,
	contract,
	type createSkillSourceBody,
	type UpdateSkillBody,
	type updateSkillSourceBody,
} from "avel-server/contract";
import type { z } from "zod";
import { type ApiClient, call } from "./client";
import type { ApiError } from "./errors";
import { queryKeys } from "./keys";
import { useApiClient } from "./provider";

/*
 * Writing the skill library (module 4): an operator creates, edits, approves
 * and retires skills, and keeps the sources they come from. Agents never
 * write a skill. The reads stay in catalog.ts beside the other catalog lists.
 * Each write is an options builder, so a test runs it against a fake API
 * without rendering, and a hook that mounts it.
 */

export type CreateSkillSourceBody = z.infer<typeof createSkillSourceBody>;
export type UpdateSkillSourceBody = z.infer<typeof updateSkillSourceBody>;

// ---------------------------------------------------------------------------
// Skills.

/** POST /api/skills: a draft at version 1. A slug a live skill holds is 409. */
export function createSkillOptions(api: ApiClient, queryClient: QueryClient) {
	return {
		mutationFn: (body: CreateSkillBody) =>
			call(contract.skills.create, () => api.skills.create({ body })),
		onSuccess: () => afterSkillWrite(queryClient),
	};
}

export function useCreateSkill() {
	return useMutation(createSkillOptions(useApiClient(), useQueryClient()));
}

/**
 * PATCH /api/skills/:id: any subset of fields. Every save bumps the version
 * and recomputes the hash; changing a hashed field of an approved skill
 * returns it to draft. A retired skill is 409.
 */
export function updateSkillOptions(api: ApiClient, queryClient: QueryClient) {
	return {
		mutationFn: ({ id, patch }: { id: string; patch: UpdateSkillBody }) =>
			call(contract.skills.update, () =>
				api.skills.update({ params: { id }, body: patch }),
			),
		onSuccess: () => afterSkillWrite(queryClient),
		onError: (error: ApiError) => rereadOnConflict(queryClient, error),
	};
}

export function useUpdateSkill() {
	return useMutation(updateSkillOptions(useApiClient(), useQueryClient()));
}

/**
 * POST /api/skills/:id/approve with the hash the operator reviewed. If the
 * skill changed since, the hashes differ and the server answers 409.
 */
export function approveSkillOptions(api: ApiClient, queryClient: QueryClient) {
	return {
		mutationFn: ({
			id,
			contentSha256,
		}: {
			id: string;
			contentSha256: string;
		}) =>
			call(contract.skills.approve, () =>
				api.skills.approve({ params: { id }, body: { contentSha256 } }),
			),
		onSuccess: () => afterSkillWrite(queryClient),
		onError: (error: ApiError) => rereadOnConflict(queryClient, error),
	};
}

export function useApproveSkill() {
	return useMutation(approveSkillOptions(useApiClient(), useQueryClient()));
}

/** POST /api/skills/:id/retire: draft or approved to retired, for good. */
export function retireSkillOptions(api: ApiClient, queryClient: QueryClient) {
	return {
		mutationFn: (id: string) =>
			call(contract.skills.retire, () => api.skills.retire({ params: { id } })),
		onSuccess: () => afterSkillWrite(queryClient),
		onError: (error: ApiError) => rereadOnConflict(queryClient, error),
	};
}

export function useRetireSkill() {
	return useMutation(retireSkillOptions(useApiClient(), useQueryClient()));
}

/**
 * Every skill write logs an activity row and changes what the catalog shows:
 * the skill, its list, its source's count, and, through the approved role
 * skills an identity is written from, each agent's staleness. A mission's
 * skills embed the skill, and its grants feed every roster entry's access,
 * so those read again too.
 */
export function afterSkillWrite(queryClient: QueryClient) {
	return Promise.all([
		queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all() }),
		queryClient.invalidateQueries({ queryKey: queryKeys.missionSkills.all() }),
		queryClient.invalidateQueries({
			predicate: ({ queryKey }) =>
				queryKey[0] === "missions" &&
				queryKey[1] === "roster" &&
				queryKey[3] === "access",
		}),
		queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
	]);
}

/**
 * A 409 on a skill write means this page is behind: the skill changed,
 * was approved or was retired elsewhere. The skill reads again, so the
 * operator sees what is there before trying again.
 */
export function rereadOnConflict(queryClient: QueryClient, error: ApiError) {
	if (error.failure.kind === "contract" && error.failure.code === "CONFLICT") {
		return afterSkillWrite(queryClient);
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// Skill sources.

export function skillSourceQuery(api: ApiClient, id: string) {
	return queryOptions({
		queryKey: queryKeys.catalog.skillSource(id),
		queryFn: () =>
			call(contract.skillSources.get, () =>
				api.skillSources.get({ params: { id } }),
			),
	});
}

/** One live source with its skill count; a removed one answers NOT_FOUND. */
export function useSkillSource(id: string) {
	return useQuery(skillSourceQuery(useApiClient(), id));
}

/** POST /api/skill-sources. */
export function createSkillSourceOptions(
	api: ApiClient,
	queryClient: QueryClient,
) {
	return {
		mutationFn: (body: CreateSkillSourceBody) =>
			call(contract.skillSources.create, () =>
				api.skillSources.create({ body }),
			),
		onSuccess: () => afterSkillSourceWrite(queryClient),
	};
}

export function useCreateSkillSource() {
	return useMutation(
		createSkillSourceOptions(useApiClient(), useQueryClient()),
	);
}

/** PATCH /api/skill-sources/:id: any subset of name, kind, url and license. */
export function updateSkillSourceOptions(
	api: ApiClient,
	queryClient: QueryClient,
) {
	return {
		mutationFn: ({ id, patch }: { id: string; patch: UpdateSkillSourceBody }) =>
			call(contract.skillSources.update, () =>
				api.skillSources.update({ params: { id }, body: patch }),
			),
		onSuccess: () => afterSkillSourceWrite(queryClient),
	};
}

export function useUpdateSkillSource() {
	return useMutation(
		updateSkillSourceOptions(useApiClient(), useQueryClient()),
	);
}

/**
 * DELETE /api/skill-sources/:id, a soft delete. Refused with 422
 * skill_source_in_use while any live skill, retired ones included, comes
 * from it.
 */
export function removeSkillSourceOptions(
	api: ApiClient,
	queryClient: QueryClient,
) {
	return {
		mutationFn: (id: string) =>
			call(contract.skillSources.remove, () =>
				api.skillSources.remove({ params: { id } }),
			),
		onSuccess: () => afterSkillSourceWrite(queryClient),
	};
}

export function useRemoveSkillSource() {
	return useMutation(
		removeSkillSourceOptions(useApiClient(), useQueryClient()),
	);
}

/**
 * A source write logs an activity row. Every skill carries its source's name
 * and kind, and so does each mission skill, so those read again with the
 * sources.
 */
export function afterSkillSourceWrite(queryClient: QueryClient) {
	return Promise.all([
		queryClient.invalidateQueries({
			queryKey: queryKeys.catalog.skillSourcesAll(),
		}),
		queryClient.invalidateQueries({ queryKey: queryKeys.catalog.skillsAll() }),
		queryClient.invalidateQueries({ queryKey: queryKeys.missionSkills.all() }),
		queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
	]);
}
