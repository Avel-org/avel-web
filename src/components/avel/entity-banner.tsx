import { Link, type LinkProps } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/*
 * The entity banner (ruling 38): the deep band at the head of one entity's
 * page. Back to its list, its tile, its name and state, one line of facts,
 * its numbers, its actions, and the tabs that split the page below. It stays
 * dark in both themes, so everything inside it uses the banner's own tokens
 * (bg-banner, text-banner-*), never the theme's: a theme colour would follow
 * .light and fall below contrast on the band.
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
			className="overflow-hidden rounded-md border border-banner-line bg-banner text-banner-text shadow-e1"
		>
			<div className="flex flex-col gap-4 px-4 pt-4 md:px-6 md:pt-5">
				<Link
					to={back.to}
					search={back.search}
					data-testid={`${testId}-back`}
					className="inline-flex w-fit items-center gap-1.5 rounded-xs type-caption text-banner-muted transition-colors duration-(--duration-micro) ease-avel hover:text-banner-text"
				>
					<ArrowLeft aria-hidden="true" className="size-3.5" />
					{back.label}
				</Link>
				<div className="flex flex-wrap items-center gap-x-8 gap-y-4">
					<div className="flex min-w-0 flex-1 basis-80 items-center gap-4">
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
							className="flex flex-wrap items-start gap-x-6 gap-y-3"
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
					className="no-scrollbar -mx-1 max-w-full justify-start overflow-x-auto pb-2"
				>
					{tabs.map((tab) => (
						<TabsTrigger
							key={tab.id}
							value={tab.id}
							data-testid={`${testId}-tab-${tab.id}`}
							className="flex-none text-banner-muted hover:text-banner-text data-[state=active]:bg-banner-raised data-[state=active]:text-banner-text"
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
		<div data-testid={testId} className="flex flex-col-reverse">
			<dt className="type-caption text-banner-muted">{label}</dt>
			<dd className="type-h2 text-banner-text tabular-nums">{value}</dd>
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
			className="inline-flex size-14 shrink-0 items-center justify-center rounded-md bg-accent type-h2 font-semibold text-accent-ink"
		>
			{initials}
		</span>
	);
}
