declare global {
    interface Window {
        _paq?: unknown[][];
    }
}

const MATOMO_URL = 'https://psedev.matomo.cloud/';
const MATOMO_SITE_ID = '16';

export function initMatomo() {
    const _paq = (window._paq = window._paq || []);
    _paq.push(['disableCookies']);
    _paq.push(['trackPageView']);
    _paq.push(['enableLinkTracking']);
    _paq.push(['setTrackerUrl', MATOMO_URL + 'matomo.php']);
    _paq.push(['setSiteId', MATOMO_SITE_ID]);

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://cdn.matomo.cloud/psedev.matomo.cloud/matomo.js`;
    document.head.appendChild(script);
}

function track(category: string, action: string, name?: string, value?: number) {
    const args: unknown[] = ['trackEvent', category, action];
    if (name !== undefined) args.push(name);
    if (value !== undefined) args.push(value);
    (window._paq = window._paq || []).push(args);
}

// System checks
export function trackBrowserCheck(compatible: boolean) {
    track('system_check', compatible ? 'browser_compatible' : 'browser_incompatible');
}

export function trackExtensionCheck(installed: boolean) {
    track('system_check', installed ? 'extension_installed' : 'extension_missing');
}

export function trackVerifierCheck(running: boolean) {
    track('system_check', running ? 'verifier_ok' : 'verifier_down');
}

export function trackAllChecksPass(pass: boolean) {
    track('system_check', pass ? 'all_checks_pass' : 'checks_incomplete');
}

export function trackRecheck() {
    track('system_check', 'recheck_clicked');
}

// Plugin events
export function trackPluginStarted(pluginName: string) {
    track('plugin', 'run_started', pluginName);
}

export function trackPluginSuccess(pluginName: string, durationMs: number) {
    track('plugin', 'run_success', pluginName, Math.round(durationMs));
}

export function trackPluginError(pluginName: string, errorMessage: string) {
    track('plugin', 'run_error', pluginName + ': ' + errorMessage);
}

// Engagement
export function trackViewSource(pluginName: string) {
    track('engagement', 'view_source_clicked', pluginName);
}

// Outbound links
export function trackOutboundClick(label: string) {
    track('outbound', 'link_clicked', label);
}
