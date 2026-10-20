import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { Fragment } from "react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import type { CrumbNameHook } from "./device";
import { ALL_LINKS } from "./nav";

/**
 * Breadcrumbs: the trail of a page's ancestors, shown above its title in the
 * top bar. Per AVEL-DESIGN.md section 6 they appear only when the parent
 * differs from the title, which in practice means nested routes such as
 * /missions/$id. A top-level page shows none.
 *
 * Each ancestor path is labelled by, in order:
 *   1. its sidebar link (/missions is "Missions"),
 *   2. the matching route's `staticData.crumb`, a string or a function of the
 *      route params, for paths with no sidebar link.
 * An ancestor with no label, or no route at all, is left out rather than
 * linked to a page that does not exist. A route with `useCrumbName` names
 * its crumb from data once it is read (a mission's client, type and sprint);
 * `label` shows until then.
 */
export type Crumb = {
	label: string;
	to: string;
	name?: { useName: CrumbNameHook; params: Record<string, string> };
};

/** "/missions/m1/roster" → ["/missions", "/missions/m1"]. Home is never an ancestor. */
export function ancestorPaths(pathname: string): string[] {
	const segments = pathname.split("/").filter(Boolean);
	return segments
		.slice(0, -1)
		.map((_, i) => `/${segments.slice(0, i + 1).join("/")}`);
}

export function buildCrumbs(
	pathname: string,
	labelFor: (path: string) => string | undefined,
	nameFor: (path: string) => Crumb["name"] = () => undefined,
): Crumb[] {
	const crumbs: Crumb[] = [];
	for (const path of ancestorPaths(pathname)) {
		const label = labelFor(path);
		if (!label) continue;
		const name = nameFor(path);
		crumbs.push(name ? { label, to: path, name } : { label, to: path });
	}
	return crumbs;
}

type MatchRouter = Pick<ReturnType<typeof useRouter>, "matchRoutes">;

/** The route covering exactly this path, never a fuzzy match. */
function exactMatch(router: MatchRouter, path: string) {
	// The router matches fuzzily: /missions/abc with no $id route resolves to
	// /missions. Only a route covering the whole path may label it.
	const match = router.matchRoutes(path, {}).at(-1);
	if (
		!match ||
		match.routeId === "__root__" ||
		match.pathname.replace(/\/$/, "") !== path
	) {
		return undefined;
	}
	return match;
}

/** The label for one ancestor path, or undefined to leave it out. */
export function crumbLabel(
	router: MatchRouter,
	path: string,
): string | undefined {
	const navLink = ALL_LINKS.find((link) => link.to === path);
	if (navLink) return navLink.label;
	const match = exactMatch(router, path);
	const crumb = match?.staticData?.crumb;
	return typeof crumb === "function" ? crumb(match?.params ?? {}) : crumb;
}

/** How one ancestor path names itself from data, when its route says. */
export function crumbName(router: MatchRouter, path: string): Crumb["name"] {
	if (ALL_LINKS.some((link) => link.to === path)) return undefined;
	const match = exactMatch(router, path);
	const useName = match?.staticData?.useCrumbName;
	return match && useName ? { useName, params: match.params } : undefined;
}

export function useBreadcrumbs(): Crumb[] {
	const router = useRouter();
	const { pathname } = useLocation();
	return buildCrumbs(
		pathname,
		(path) => crumbLabel(router, path),
		(path) => crumbName(router, path),
	);
}

/** A crumb named from data: its route's hook, its label until that reads. */
function NamedCrumb({
	name,
	label,
}: {
	name: NonNullable<Crumb["name"]>;
	label: string;
}) {
	const { useName, params } = name;
	return <>{useName(params) ?? label}</>;
}

export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
	if (crumbs.length === 0) return null;
	return (
		<Breadcrumb data-testid="breadcrumbs">
			<BreadcrumbList className="sm:gap-1.5">
				{crumbs.map((crumb, i) => (
					<Fragment key={crumb.to}>
						{i > 0 ? <BreadcrumbSeparator /> : null}
						<BreadcrumbItem>
							<BreadcrumbLink asChild>
								<Link to={crumb.to}>
									{crumb.name ? (
										<NamedCrumb name={crumb.name} label={crumb.label} />
									) : (
										crumb.label
									)}
								</Link>
							</BreadcrumbLink>
						</BreadcrumbItem>
					</Fragment>
				))}
			</BreadcrumbList>
		</Breadcrumb>
	);
}
