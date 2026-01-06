export function checkBrowserCompatibility(): boolean {
    const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
    const isEdge = /Edg/.test(navigator.userAgent);
    const isBrave = navigator.brave && typeof navigator.brave.isBrave === 'function';
    const isChromium = /Chromium/.test(navigator.userAgent);

    return isChrome || isEdge || isBrave || isChromium;
}

export async function checkExtension(): Promise<boolean> {
    // Wait a bit for tlsn to load if page just loaded
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return typeof window.tlsn !== 'undefined';
}

export async function checkVerifier(): Promise<boolean> {
    try {
        const response = await fetch('http://localhost:7047/health');
        if (response.ok && (await response.text()) === 'ok') {
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

export function formatTimestamp(): string {
    return new Date().toLocaleTimeString();
}
