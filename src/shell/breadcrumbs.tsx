import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { Fragment } from "react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
 * linked to a page that does not exist.
 */
export type Crumb = { label: string; to: string };

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
): Crumb[] {
	const crumbs: Crumb[] = [];
	for (const path of ancestorPaths(pathname)) {
		const label = labelFor(path);
		if (label) crumbs.push({ label, to: path });
	}
	return crumbs;
}

/** The label for one ancestor path, or undefined to leave it out. */
export function crumbLabel(
	router: Pick<ReturnType<typeof useRouter>, "matchRoutes">,
	path: string,
): string | undefined {
	const navLink = ALL_LINKS.find((link) => link.to === path);
	if (navLink) return navLink.label;

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
	const crumb = match.staticData?.crumb;
	return typeof crumb === "function" ? crumb(match.params) : crumb;
}

export function useBreadcrumbs(): Crumb[] {
	const router = useRouter();
	const { pathname } = useLocation();
	return buildCrumbs(pathname, (path) => crumbLabel(router, path));
}

export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
	if (crumbs.length === 0) return null;
	return (
		<Breadcrumb data-testid="breadcrumbs">
			<BreadcrumbList className="text-xs sm:gap-1.5">
				{crumbs.map((crumb, i) => (
					<Fragment key={crumb.to}>
						{i > 0 ? <BreadcrumbSeparator /> : null}
						<BreadcrumbItem>
							<BreadcrumbLink asChild>
								<Link to={crumb.to}>{crumb.label}</Link>
							</BreadcrumbLink>
						</BreadcrumbItem>
					</Fragment>
				))}
			</BreadcrumbList>
		</Breadcrumb>
	);
}
