import { Link } from "@tanstack/react-router";
import { type Playbook, WAVES } from "avel-server/contract";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { isNotFound } from "@/lib/api/catalog";
import type { ApiError } from "@/lib/api/errors";
import { usePlaybook } from "@/lib/api/playbooks";
import { cn } from "@/lib/utils";
import { DELIVERABLE_LABEL, POLICY_LABEL } from "./playbook-list";
import { SectionPanel } from "./section-panel";
import { ErrorState, type ErrorStateProps, Surface } from "./surface";

/*
 * One playbook, /playbooks/:missionType, read live from
 * playbooks.getForType. Read-only, and each value is shown as stored: what a
 * gate's policy means at ship time is the gate's business (module 9), and
 * what the first wave resolves to is coherence's, so neither is restated
 * here.
 */

export function PlaybookDetail({ missionType }: { missionType: string }) {
	const playbook = usePlaybook(missionType);
	return (
		<Surface
			data-testid="playbook-detail"
			query={playbook}
			loading={<PlaybookDetailSkeleton />}
			// A playbook is never "empty": it exists, or the type has none.
			empty={null}
			isEmpty={() => false}
			error={PlaybookDetailError}
		>
			{(detail) => <PlaybookContent playbook={detail} />}
		</Surface>
	);
}

/** The error map's copy, and a way back for a type with no live playbook. */
function PlaybookDetailError(props: ErrorStateProps<ApiError>) {
	return (
		<div className="flex flex-col gap-3">
			<ErrorState {...props} />
			{isNotFound(props.error) ? (
				<Button asChild variant="outline" size="sm" className="self-start">
					<Link to="/playbooks" data-testid="playbook-detail-back">
						<ArrowLeft aria-hidden="true" />
						Back to playbooks
					</Link>
				</Button>
			) : null}
		</div>
	);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-0.5">
			<dt className="type-caption text-text-subtle">{label}</dt>
			<dd className="min-w-0 break-words type-small text-foreground">
				{children}
			</dd>
		</div>
	);
}

function PlaybookContent({ playbook }: { playbook: Playbook }) {
	const applicable = new Set<string>(playbook.wavesApplicable);
	return (
		<div
			data-testid="playbook-detail-content"
			className="flex flex-col gap-4 pb-6"
		>
			<header
				data-testid="playbook-detail-header"
				className="surface-steel flex flex-col gap-3 rounded-md border border-border bg-card p-4"
			>
				<p className="type-h2 text-foreground">{playbook.name}</p>
				<dl className="flex flex-wrap gap-x-6 gap-y-2">
					<Field label="Mission type">
						<span className="type-mono-small">{playbook.missionType}</span>
					</Field>
					<Field label="Deliverable">
						{DELIVERABLE_LABEL[playbook.deliverable]}
					</Field>
					<Field label="Version">
						<span className="type-mono-small">{`v${playbook.version}`}</span>
					</Field>
					<Field label="Updated">
						<time dateTime={playbook.updatedAt} className="type-mono-small">
							{playbook.updatedAt.slice(0, 10)}
						</time>
					</Field>
				</dl>
			</header>
			<div className="grid gap-4 md:grid-cols-2">
				<SectionPanel
					title="Waves"
					description="The waves this kind of mission runs, in order."
					data-testid="playbook-section-waves"
				>
					<ol aria-label="Waves" className="flex gap-2">
						{WAVES.map((wave) => {
							const on = applicable.has(wave);
							return (
								<li
									key={wave}
									data-testid={`playbook-wave-${wave}`}
									data-applicable={on}
									className={cn(
										"flex size-9 items-center justify-center rounded-sm border type-mono",
										on
											? "border-accent text-foreground"
											: "border-dashed border-border text-text-subtle",
									)}
								>
									{wave}
									<span className="sr-only">
										{on ? ", runs" : ", does not run"}
									</span>
								</li>
							);
						})}
					</ol>
				</SectionPanel>
				<SectionPanel
					title="Gates"
					description="Each gate this playbook declares, with its policy as stored."
					data-testid="playbook-section-gates"
				>
					{playbook.gates.length === 0 ? (
						<p className="type-small text-text-subtle">No gates declared.</p>
					) : (
						<ul className="flex flex-col divide-y divide-border">
							{playbook.gates.map(({ gate, policy }) => (
								<li
									key={gate}
									data-testid={`playbook-gate-${gate}`}
									data-policy={policy}
									className="flex items-center justify-between gap-3 py-2"
								>
									<span className="type-mono-small text-foreground">
										{gate}
									</span>
									<Badge variant="outline">{POLICY_LABEL[policy]}</Badge>
								</li>
							))}
						</ul>
					)}
				</SectionPanel>
				<SectionPanel
					title="Required fields"
					description="What a mission of this type must fill in."
					data-testid="playbook-section-fields"
				>
					{playbook.requiredFields.length === 0 ? (
						<p className="type-small text-text-subtle">None required.</p>
					) : (
						<ul className="flex flex-wrap gap-1.5">
							{playbook.requiredFields.map((field) => (
								<li key={field}>
									<Badge variant="tag">{field}</Badge>
								</li>
							))}
						</ul>
					)}
				</SectionPanel>
				<SectionPanel
					title="Default preset"
					description="The squad a mission of this type starts from. The playbook names a preset and never lists agents."
					data-testid="playbook-section-preset"
				>
					<div className="flex flex-wrap items-center gap-3">
						<span
							className="type-mono-small text-text-muted"
							title={playbook.defaultPresetId}
						>
							{playbook.defaultPresetId.slice(0, 8)}
						</span>
						<Button asChild variant="outline" size="sm">
							<Link
								to="/presets"
								search={{ preset: playbook.defaultPresetId }}
								data-testid="playbook-preset-link"
							>
								Open preset
								<ArrowUpRight aria-hidden="true" />
							</Link>
						</Button>
					</div>
				</SectionPanel>
			</div>
		</div>
	);
}

function PlaybookDetailSkeleton() {
	return (
		<div data-testid="playbook-detail-skeleton" className="flex flex-col gap-4">
			<div className="flex flex-col gap-3 rounded-md border border-border p-4">
				<Skeleton className="h-6 w-48" />
				<Skeleton className="h-4 w-72" />
			</div>
			<div className="grid gap-4 md:grid-cols-2">
				<Skeleton className="h-28" />
				<Skeleton className="h-28" />
			</div>
		</div>
	);
}
