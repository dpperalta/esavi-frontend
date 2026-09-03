import userEvent from '@testing-library/user-event';

type SetupOptions = Parameters<typeof userEvent.setup>[0];

// Always build the user-event instance through this helper instead of calling userEvent.setup()
// directly.
//
// user-event defaults to `delay: 0`, which yields to the event loop between every dispatched
// pointer/keyboard event. In this suite that yield intermittently stalled for ~22s: a single
// `user.click()` on a sidebar link cost either ~100ms or ~22000ms, with nothing in between, on an
// idle machine. Instrumenting MSW showed no network traffic and no unhandled request — the next
// query was simply not emitted for 22s, so the stall is in the yield itself, not in a response.
//
// That bimodal cost is what made the suite non-deterministic: the interaction-heavy tests blew
// their timeouts in a different combination on every run and passed when run alone. `delay: null`
// dispatches the events back to back without yielding, which removes the stall entirely.
export function setupUser(options?: SetupOptions) {
  return userEvent.setup({ delay: null, ...options });
}
