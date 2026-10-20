/**
 * Try again for a write that failed: send the same variables again. For a
 * write that carries an attempt (an idempotency key and its body), the
 * variables are that attempt, so a retry replays instead of writing twice.
 * Spread into <ErrorState>; before anything was sent there is nothing to
 * retry, and ErrorState shows no Try again. Pass the same callbacks the first
 * send had: a retry that succeeds must clear what a send that succeeds clears
 * (the kept attempt above all), or a later send replays this one's key.
 */
export function retryOf<TVariables, TOptions>(
	mutation: {
		variables: TVariables | undefined;
		mutate: (variables: TVariables, options?: TOptions) => void;
		isPending: boolean;
	},
	options?: TOptions,
): { retry?: () => void; retrying: boolean } {
	const { variables } = mutation;
	return variables === undefined
		? { retrying: false }
		: {
				retry: () => mutation.mutate(variables, options),
				retrying: mutation.isPending,
			};
}
