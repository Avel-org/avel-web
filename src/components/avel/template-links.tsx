import { Link } from "@tanstack/react-router";
import type { Playbook, Template } from "avel-server/contract";
import { Skeleton } from "@/components/ui/skeleton";
import { loadedPlaybooks, usePlaybooks } from "@/lib/api/playbooks";
import { usePreset } from "@/lib/api/presets";
import { cn } from "@/lib/utils";

/*
 * What a template links to, shared by its card, its table row and its page:
 * the playbook keyed by its slug (a playbook's mission type is the
 * template's slug) and that playbook's default team.
 */

/** Why an unreadable template shows no manifest fields, in one sentence. */
export const UNREADABLE_COPY =
	"AVEL could not read this repository or its manifest, so its name, scope, starting state and commit are unknown.";

/**
 * What a template needs beside itself: the playbook keyed by its slug.
 * `ready` is false until the playbooks are read, so nothing says "No
 * playbook" early. A team's name is read by its id (TeamName).
 */
export type TemplateLinks = {
	ready: boolean;
	failed: boolean;
	playbookFor: (slug: string) => Playbook | undefined;
};

export function useTemplateLinks(): TemplateLinks {
	const playbooks = usePlaybooks();
	const bySlug = new Map(
		(playbooks.data ? loadedPlaybooks(playbooks.data) : []).map((p) => [
			p.missionType,
			p,
		]),
	);
	return {
		ready: playbooks.status === "success",
		failed: playbooks.status === "error",
		playbookFor: (slug) => bySlug.get(slug),
	};
}

/**
 * A team's name, read by its id (GET /api/presets/:id). "Default team"
 * while it loads, and when the team is gone or can't be read: the link
 * still opens it on Teams, which says so.
 */
export function TeamName({ id }: { id: string }) {
	const team = usePreset(id);
	return <>{team.data?.name ?? "Default team"}</>;
}

/** A link inside a card: above the card's stretched link, so it is its own. */
export const INNER_LINK =
	"relative z-10 rounded-xs text-foreground underline-offset-4 hover:underline";

/** "1 gate", "2 gates". */
export function gateCountLabel(n: number): string {
	return n === 1 ? "1 gate" : `${n} gates`;
}

/**
 * The playbook keyed by this slug, or that there is none. `full` names the
 * playbook and adds its version and gate count (the card); otherwise it is
 * "Playbook v4" (the table).
 */
export function PlaybookLink({
	slug,
	links,
	full = false,
}: {
	slug: string;
	links: TemplateLinks;
	full?: boolean;
}) {
	if (links.failed)
		return (
			<span
				data-testid={`template-playbook-${slug}`}
				className="text-text-subtle"
			>
				Playbooks could not be read
			</span>
		);
	if (!links.ready)
		return (
			<Skeleton
				data-testid={`template-playbook-${slug}-loading`}
				className="h-4 w-24"
			/>
		);
	const playbook = links.playbookFor(slug);
	if (!playbook)
		return (
			<span
				data-testid={`template-playbook-${slug}`}
				className="text-text-subtle"
			>
				No playbook
			</span>
		);
	const link = (
		<Link
			to="/playbooks/$missionType"
			params={{ missionType: slug }}
			data-testid={`template-playbook-${slug}`}
			className={cn(INNER_LINK, full && "min-w-0 truncate")}
		>
			{full ? playbook.name : `Playbook v${playbook.version}`}
		</Link>
	);
	if (!full) return link;
	return (
		<span className="flex min-w-0 items-baseline gap-2">
			{link}
			<span
				data-testid={`template-playbook-meta-${slug}`}
				className="shrink-0 type-mono-small text-text-subtle"
			>
				{`v${playbook.version} · ${gateCountLabel(playbook.gates.length)}`}
			</span>
		</span>
	);
}

/** The playbook's default team, linked to it on Teams; nothing without one. */
export function TeamLink({
	slug,
	template,
}: {
	slug: string;
	template: Pick<Template, "defaultPresetId">;
}) {
	const id = template.defaultPresetId;
	if (id === null) return null;
	return (
		<Link
			to="/presets"
			search={{ preset: id }}
			data-testid={`template-team-${slug}`}
			className={cn(INNER_LINK, "min-w-0 truncate")}
		>
			<TeamName id={id} />
		</Link>
	);
}
