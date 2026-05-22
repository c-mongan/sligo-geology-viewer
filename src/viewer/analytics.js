// ── Optional analytics hook ───────────────────────────────────

export function trackEvent(name, props = {}) {
    const analytics = window.analytics;
    if (analytics?.capture) {
        analytics.capture(name, { ...props, timestamp: Date.now() });
    }
}
