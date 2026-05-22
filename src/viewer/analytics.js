// ── PostHog analytics ────────────────────────────────────────
// posthog is loaded by an inline script in the HTML and available on window.

export function trackEvent(name, props = {}) {
    if (typeof posthog !== 'undefined' && posthog.capture) {
        posthog.capture(name, { ...props, timestamp: Date.now() });
    }
}
