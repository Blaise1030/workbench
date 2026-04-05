"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PreviewService = void 0;
class PreviewService {
    urls = new Map();
    setUrl(threadId, url) {
        this.urls.set(threadId, url);
    }
    getUrl(threadId) {
        return this.urls.get(threadId) ?? null;
    }
    detectLocalhost(text) {
        const match = text.match(/https?:\/\/localhost:\d+[^\s]*/i);
        return match?.[0] ?? null;
    }
    /**
     * HEAD/GET the URL from the main process so we can detect 404 and connection errors
     * before embedding the dev server's default error HTML in the iframe.
     */
    async probeUrl(urlString) {
        const trimmed = urlString.trim();
        if (!trimmed) {
            return { ok: false, code: "invalid", message: "No URL provided" };
        }
        let parsed;
        try {
            parsed = new URL(trimmed);
        }
        catch {
            return { ok: false, code: "invalid", message: "Invalid URL" };
        }
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return { ok: false, code: "invalid", message: "Only http:// and https:// URLs are supported" };
        }
        const tryHead = async () => {
            const res = await fetch(trimmed, { method: "HEAD", redirect: "follow" });
            return res.status;
        };
        const tryGet = async () => {
            const res = await fetch(trimmed, { method: "GET", redirect: "follow" });
            await res.body?.cancel();
            return res.status;
        };
        try {
            let status = await tryHead();
            if (status === 405 || status === 501) {
                status = await tryGet();
            }
            return { ok: true, status };
        }
        catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            return { ok: false, code: "network", message };
        }
    }
}
exports.PreviewService = PreviewService;
