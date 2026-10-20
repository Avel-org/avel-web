import type { Intake } from "avel-server/contract";
import { ActorMark } from "./actor";
import { agentName } from "./preset-compare";
import { useTemplateNames } from "./preset-detail";
import { SectionPanel } from "./section-panel";

/*
 * The roster Canon recommends for this intake: each agent, the waves it
 * would work in, and why. It is real data, Canon's draft, and it is a
 * recommendation, not a team: nothing here applies it. The operator builds
 * the mission's roster themselves, from it or not.
 */

export function CanonRecommends({
	roster,
}: {
	roster: NonNullable<Intake["recommendedRoster"]>;
}) {
	const names = useTemplateNames();
	return (
		<SectionPanel
			title="Canon recommends"
			data-testid="canon-recommends"
			count={roster.agents.length}
			description="A recommendation from Canon's brief, not a team: nothing here is applied. Build the mission's roster from it, or not."
		>
			<ul className="flex flex-col divide-y divide-border">
				{roster.agents.map((agent, i) => {
					const name = agentName({ ...agent, territory: null }, names);
					return (
						<li
							// biome-ignore lint/suspicious/noArrayIndexKey: the same template may be recommended twice, once per territory; the brief's order is fixed
							key={`${agent.agentTemplateId}:${i}`}
							data-testid={`canon-recommends-${i}`}
							className="flex items-start gap-2.5 py-2.5"
						>
							<ActorMark kind="agent" name={name} size="md" />
							<div className="flex min-w-0 flex-1 flex-col gap-0.5">
								<p className="flex flex-wrap items-center gap-x-3 type-small">
									<span className="font-medium text-text">{name}</span>
									{agent.territory ? (
										<span className="min-w-0 break-words text-text-muted">
											{agent.territory}
										</span>
									) : null}
									<span
										data-testid={`canon-recommends-${i}-waves`}
										className="type-mono text-text-subtle"
									>
										{agent.waves.length === 0
											? "No waves"
											: `Waves ${agent.waves.join(" ")}`}
									</span>
								</p>
								<p className="flex items-start gap-1.5 type-caption text-text-muted">
									<ActorMark kind="canon" className="mt-px" />
									<span>{agent.reason}</span>
								</p>
							</div>
						</li>
					);
				})}
			</ul>
		</SectionPanel>
	);
}
