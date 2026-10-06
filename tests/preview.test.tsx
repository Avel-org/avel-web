import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GateView, PREVIEW_USER } from "../src/shell/auth-gate";

const unreachable = {
	status: "unreachable",
	retry: () => {},
	retrying: false,
} as const;

const render = (onPreview?: () => void) =>
	renderToString(
		<GateView
			state={unreachable}
			onSignIn={async () => {}}
			onSignOut={async () => {}}
			onPreview={onPreview}
		>
			<p data-testid="protected">shell</p>
		</GateView>,
	);

describe("the development preview", () => {
	it("is offered on the unreachable screen when the gate passes it", () => {
		const html = render(() => {});
		expect(html).toContain('data-testid="auth-unreachable-preview"');
		expect(html).toContain("Preview without avel-server");
		expect(html).toContain("Development only.");
	});

	it("is absent when the gate does not pass it, as in production", () => {
		const html = render(undefined);
		expect(html).not.toContain("auth-unreachable-preview");
	});

	it("never shows the shell from the unreachable screen by itself", () => {
		expect(render(() => {})).not.toContain('data-testid="protected"');
	});
});

describe("the development preview on the sign-in screen", () => {
	const signedOut = (onPreview?: () => void, error?: string) =>
		renderToString(
			<GateView
				state={{ status: "signed-out" }}
				error={error}
				onSignIn={async () => {}}
				onSignOut={async () => {}}
				onPreview={onPreview}
			>
				<p data-testid="protected">shell</p>
			</GateView>,
		);

	it("is offered beside Continue with GitHub", () => {
		const html = signedOut(() => {});
		expect(html).toContain('data-testid="auth-sign-in-github"');
		expect(html).toContain('data-testid="auth-sign-in-preview"');
		expect(html).toContain("Preview without signing in");
	});

	it("is absent when the gate does not pass it, as in production", () => {
		expect(signedOut(undefined)).not.toContain("auth-sign-in-preview");
	});

	it("is never offered to a refused account", () => {
		const html = signedOut(() => {}, "unable_to_create_user");
		expect(html).not.toContain("auth-sign-in-preview");
		expect(html).not.toContain("auth-unreachable-preview");
	});
});

describe("the preview identity", () => {
	it("stands in for the owner, the only user, and says it is a preview", () => {
		expect(PREVIEW_USER.name).toBe("Javaris Tavel");
		expect(PREVIEW_USER.githubLogin).toBe("javaris500, preview");
	});
});
