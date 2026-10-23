import type { AgentTemplate } from "avel-server/contract";
import { useEffect, useMemo } from "react";
import type { ApiError } from "@/lib/api";
import { loadedRows, useAgentTemplates } from "@/lib/api/catalog";

/*
 * The agent template catalog as the team pages read it: every page of it,
 * and the names a PresetAgent's template id stands for.
 */

export type Names =
	| { status: "pending" }
	| { status: "error" }
	| {
			status: "success";
			byId: ReadonlyMap<string, Pick<AgentTemplate, "name" | "slug">>;
	  };

/**
 * The whole template catalog, every page, or where reading it stands. A
 * failed read carries its error and a retry, so a region can show the error
 * map's copy with Try again (section 8).
 */
export type AllTemplates =
	| { status: "pending" }
	| {
			status: "error";
			error: ApiError;
			retry: () => void;
			retrying: boolean;
	  }
	| {
			status: "success";
			byId: ReadonlyMap<string, AgentTemplate>;
			list: AgentTemplate[];
	  };

/**
 * Every template in the catalog. Every page is fetched, and the result is
 * pending until the last one is in, so a template past the first page is
 * never mistaken for an unknown one or left out of a check.
 */
export function useAllTemplates(): AllTemplates {
	const templates = useAgentTemplates();
	const { hasNextPage, isFetchingNextPage, fetchNextPage } = templates;
	useEffect(() => {
		if (hasNextPage && !isFetchingNextPage) fetchNextPage();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	const data = templates.data;
	const list = useMemo(() => (data ? loadedRows(data) : []), [data]);
	const byId = useMemo(() => new Map(list.map((t) => [t.id, t])), [list]);
	if (templates.status === "error")
		return {
			status: "error",
			error: templates.error,
			retry: () => void templates.refetch(),
			retrying: templates.isFetching,
		};
	if (templates.status === "pending" || hasNextPage)
		return { status: "pending" };
	return { status: "success", byId, list };
}

/**
 * A PresetAgent carries only its template's id, so the names come from the
 * whole catalog (useAllTemplates).
 */
export function useTemplateNames(): Names {
	const all = useAllTemplates();
	return all.status === "success"
		? { status: "success", byId: all.byId }
		: { status: all.status === "error" ? "error" : "pending" };
}
