import { Link, type LinkProps } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/*
 * The entity banner (ruling 38): the deep band at the head of one entity's
 * page. Back to its list, its tile, its name and state, one line of facts,
 * its numbers, its actions, and the tabs that split the page below. Its face
 * is banner-surface (app.css): the band lit by an accent glow behind the
 * tile, under a fading grid. Everything inside it uses the banner's own
 * tokens (bg-banner, text-banner-*), which are deep on dark and light on
 * .light (ruling 41).
 *
 * The top bar keeps the page's h1 and its crumbs. The banner repeats the
 * name large, as the screen's heading people see, and hides it from screen
 * readers so the name is announced once.
 */

export type BannerTab = {
	id: string;
	label: string;
	/** A count, only when a route supplies it. A tab with no data has none. */
	count?: number;
};

export function EntityBanner({
	back,
	tile,
	name,
	status,
	facts,
	stats,
	actions,
	tabs,
	tabsLabel,
	"data-testid": testId,
}: {
	back: { label: string } & Pick<LinkProps, "to" | "search">;
	tile: ReactNode;
	name: string;
	/** A BannerStatus, when the entity has a state to show. */
	status?: ReactNode;
	/** One line under the name: "Schema agent · since March 2026 · v3". */
	facts: ReactNode;
	/** BannerStat items. */
	stats?: ReactNode;
	actions?: ReactNode;
	tabs: readonly BannerTab[];
	tabsLabel: string;
	"data-testid": string;
}) {
	return (
		<section
			data-testid={testId}
			aria-label={name}
			className="relative isolate overflow-hidden rounded-lg border border-banner-line banner-surface text-banner-text"
		>
			<span
				aria-hidden="true"
				data-testid={`${testId}-grid`}
				className="pointer-events-none absolute inset-0 -z-10 banner-grid"
			/>
			<div className="flex flex-col gap-5 px-4 pt-4 md:px-8 md:pt-6">
				<Link
					to={back.to}
					search={back.search}
					data-testid={`${testId}-back`}
					className="inline-flex w-fit items-center gap-1.5 rounded-xs type-caption text-banner-muted transition-colors duration-(--duration-micro) ease-avel hover:text-banner-text"
				>
					<ArrowLeft aria-hidden="true" className="size-3.5" />
					{back.label}
				</Link>
				<div className="flex flex-wrap items-center gap-x-10 gap-y-5">
					<div className="flex min-w-0 flex-1 basis-80 items-center gap-5">
						{tile}
						<div className="flex min-w-0 flex-col gap-1">
							<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
								<p
									aria-hidden="true"
									data-testid={`${testId}-name`}
									className="type-h1 truncate text-banner-text"
								>
									{name}
								</p>
								{status}
							</div>
							<p
								data-testid={`${testId}-facts`}
								className="type-small text-banner-muted"
							>
								{facts}
							</p>
						</div>
					</div>
					{stats ? (
						<dl
							data-testid={`${testId}-stats`}
							className="flex flex-wrap items-stretch gap-y-3"
						>
							{stats}
						</dl>
					) : null}
					{actions ? (
						<div
							data-testid={`${testId}-actions`}
							className="flex shrink-0 items-center gap-2"
						>
							{actions}
						</div>
					) : null}
				</div>
				<TabsList
					aria-label={tabsLabel}
					className="no-scrollbar -mx-4 h-11! w-auto max-w-none justify-start gap-1 overflow-x-auto rounded-none border-t border-banner-line px-3 md:-mx-8 md:px-7"
				>
					{tabs.map((tab) => (
						<TabsTrigger
							key={tab.id}
							value={tab.id}
							data-testid={`${testId}-tab-${tab.id}`}
							className="h-full flex-none rounded-none px-3 text-banner-muted after:bottom-0! hover:text-banner-text data-[state=active]:text-banner-text"
						>
							{tab.label}
							{tab.count === undefined ? null : (
								<span
									data-testid={`${testId}-tab-${tab.id}-count`}
									className="rounded-full bg-banner-raised px-1.5 type-mono-small text-banner-muted tabular-nums"
								>
									{tab.count}
								</span>
							)}
						</TabsTrigger>
					))}
				</TabsList>
			</div>
		</section>
	);
}

/** A state on the banner: a dot and a word, the dot lit only when live. */
export function BannerStatus({
	label,
	live,
	"data-testid": testId,
}: {
	label: string;
	live: boolean;
	"data-testid": string;
}) {
	return (
		<span
			data-testid={testId}
			data-live={live || undefined}
			className="inline-flex h-6 items-center gap-1.5 rounded-full border border-banner-line bg-banner-raised px-2 type-caption font-medium text-banner-text"
		>
			<span
				aria-hidden="true"
				className={cn(
					"size-1.5 rounded-full",
					live ? "bg-banner-live" : "bg-banner-muted",
				)}
			/>
			{label}
		</span>
	);
}

/** One number on the banner, over its label. */
export function BannerStat({
	value,
	label,
	"data-testid": testId,
}: {
	value: string;
	label: string;
	"data-testid": string;
}) {
	return (
		<div
			data-testid={testId}
			className="flex flex-col-reverse gap-0.5 border-l border-banner-line px-5 first:border-l-0 first:pl-0"
		>
			<dt className="type-caption text-banner-muted">{label}</dt>
			<dd className="type-h1 text-banner-text tabular-nums">{value}</dd>
		</div>
	);
}

/**
 * A button on the banner: the outline pill in the banner's colours. Disabled
 * buttons still state their reason (ruling 11), through the shared Button.
 */
export const BANNER_BUTTON =
	"border border-banner-line bg-banner-raised text-banner-text hover:bg-banner-line hover:text-banner-text";

/**
 * The entity's tile on the banner: the accent fill, which reads the same on
 * the deep band in both themes, where a theme-toned tile would not.
 */
export function BannerTile({
	initials,
	"data-testid": testId,
}: {
	initials: string;
	"data-testid": string;
}) {
	return (
		<span
			aria-hidden="true"
			data-testid={testId}
			className="inline-flex size-16 shrink-0 items-center justify-center rounded-lg bg-accent type-h1 font-semibold text-accent-ink shadow-[0_0_0_1px_var(--color-banner-line),0_8px_24px_-6px_var(--color-accent)]"
		>
			{initials}
		</span>
	);
}
