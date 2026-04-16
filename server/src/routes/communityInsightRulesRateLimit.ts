import type { NextFunction, Request, Response } from 'express';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function clientIp(req: Request): string {
    const xf = req.get('x-forwarded-for');
    if (xf) {
        const first = xf.split(',')[0]?.trim();
        if (first) return first.slice(0, 128);
    }
    return (req.socket.remoteAddress || 'unknown').slice(0, 128);
}

/**
 * In-memory per-IP limit for POST /community/insight-rules/submit.
 * Tune with COMMUNITY_SUBMIT_RATE_MAX (default 60) and COMMUNITY_SUBMIT_RATE_WINDOW_MS (default 1h).
 * Behind Docker/nginx, set X-Forwarded-For on the proxy for accurate client IPs.
 */
export function communityInsightSubmitRateLimit(req: Request, res: Response, next: NextFunction): void {
    const max = Math.max(1, Math.min(500, parseInt(process.env.COMMUNITY_SUBMIT_RATE_MAX || '60', 10) || 60));
    const windowMs = Math.max(
        60_000,
        Math.min(86_400_000, parseInt(process.env.COMMUNITY_SUBMIT_RATE_WINDOW_MS || String(3_600_000), 10) || 3_600_000)
    );
    const now = Date.now();
    const ip = clientIp(req);
    let b = buckets.get(ip);
    if (!b || now >= b.resetAt) {
        b = { count: 0, resetAt: now + windowMs };
        buckets.set(ip, b);
    }
    if (b.count >= max) {
        const retrySec = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
        res.setHeader('Retry-After', String(retrySec));
        res.status(429).json({ success: false, error: 'Too many community submissions from this client; try again later.' });
        return;
    }
    b.count += 1;

    if (buckets.size > 20_000) {
        for (const [k, v] of buckets) {
            if (now >= v.resetAt) buckets.delete(k);
        }
    }
    next();
}
