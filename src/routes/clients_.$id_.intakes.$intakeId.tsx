import { createFileRoute } from "@tanstack/react-router";
import { IntakePage } from "@/components/avel/intake-page";
import { useIntake } from "@/lib/api/intakes";
import { Page } from "../shell/page";

// Beside the client page, not inside it (the trailing underscores): the
// client page has no outlet. Breadcrumbs lead Clients → the client → here.
export const Route = createFileRoute("/clients_/$id_/intakes/$intakeId")({
	// Reading a brief and approving it is approval work, fine on a phone.
	staticData: { device: "approve", crumb: "Intake" },
	head: () => ({ meta: [{ title: "Intake · Client · Clients · AVEL" }] }),
	component: IntakeRoute,
});

function IntakeRoute() {
	const { id, intakeId } = Route.useParams();
	// The page reads the same intake, so the title names it once it is in.
	const intake = useIntake(intakeId);
	return (
		<Page
			title={intake.data ? `Intake, ${intake.data.status}` : "Intake"}
			definition="The brief a client mission starts from: drafted, proposed, then approved into the mission."
		>
			<IntakePage clientId={id} intakeId={intakeId} />
		</Page>
	);
}
