import { Request, Response, NextFunction } from 'express';
import { appBlockerService } from '../services/appBlockerService.js';

// ---------------------------------------------------------------------------
// Routes that NEVER require a blocker token (even when the blocker is ON).
// ---------------------------------------------------------------------------

const WHITELISTED_EXACT: ReadonlySet<string> = new Set([
    '/api/health',
    '/api/app-lock/status',
    '/api/app-lock/unlock',
    '/api/app-lock/setup',
    '/api/app-lock/token/validate',
]);

/**
 * Check whether the request path + method is whitelisted.
 *
 * - Static files (anything NOT starting with `/api/`) are always allowed so
 *   the React SPA can load.
 * - Exact path matches from the whitelist set.
 * - `GET /api/app-lock/blocker-config` is allowed (reading config), but
 *   `POST` (changing config) requires a valid token.
 */
function isWhitelisted(url: string, method: string): boolean {
    const pathOnly = url.split('?')[0];

    // Static assets / SPA HTML — never gated
    if (!pathOnly.startsWith('/api/') && !pathOnly.startsWith('/api')) {
        return true;
    }

    if (WHITELISTED_EXACT.has(pathOnly)) {
        return true;
    }

    // GET on blocker-config is allowed; POST requires a token
    if (pathOnly === '/api/app-lock/blocker-config' && method.toUpperCase() === 'GET') {
        return true;
    }

    return false;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Express middleware that gates ALL `/api/*` routes behind a valid session
 * token when the Full App Blocker feature flag is ON.
 *
 * **When the blocker is OFF** the first line short-circuits (`return next()`)
 * with effectively zero performance overhead (single boolean read).
 */
export function blockerAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    // -----------------------------------------------------------------------
    // 1. Fast path — blocker disabled → classic mode, no token required
    // -----------------------------------------------------------------------
    if (!appBlockerService.isBlockerEnabled()) {
        return next();
    }

    // -----------------------------------------------------------------------
    // 2. Whitelisted routes always pass (login page, health check, etc.)
    // -----------------------------------------------------------------------
    if (isWhitelisted(req.url, req.method)) {
        return next();
    }

    // -----------------------------------------------------------------------
    // 3. Extract token from Authorization header
    // -----------------------------------------------------------------------
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : null;

    // -----------------------------------------------------------------------
    // 4. Validate
    // -----------------------------------------------------------------------
    const result = appBlockerService.validateToken(token);
    if (!result.valid) {
        const statusCode = result.reason === 'session_expired' ? 401 : 401;
        res.status(statusCode).json({
            success: false,
            error: result.reason || 'invalid_token',
            message:
                result.reason === 'session_expired'
                    ? 'Session expired. Please unlock again.'
                    : result.reason === 'missing_token'
                      ? 'Full app blocker is enabled. Provide a session token via Authorization header.'
                      : 'Invalid session token.',
        });
        return;
    }

    // -----------------------------------------------------------------------
    // 5. Token valid — continue to route handler
    // -----------------------------------------------------------------------
    next();
}
