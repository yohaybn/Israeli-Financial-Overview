import { NextFunction, Request, Response } from 'express';
import { serverLogger } from '../utils/logger.js';

/**
 * Centralized API error handling.
 *
 * Before this, every route wrapped itself in try/catch and returned raw
 * `error.message` (leaking internals), and anything missed fell through to
 * Express's default handler, which answers with an HTML stack trace - a bad
 * answer for a JSON API, especially for body-parser failures on POSTs.
 *
 * Contract: 4xx errors (including body-parser and multer errors) expose their
 * message; 5xx always answer with a generic message while the real error is
 * logged server-side.
 */

export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
        public code?: string
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

type ErrorWithMeta = Error & {
    status?: number;
    statusCode?: number;
    code?: string;
    type?: string;
};

function resolveStatus(err: ErrorWithMeta): number {
    const raw = err.status ?? err.statusCode;
    return typeof raw === 'number' && raw >= 400 && raw < 600 ? raw : 500;
}

/** 404 for unmatched /api/* routes so they answer JSON like the rest of the API. */
export function apiNotFoundHandler(req: Request, res: Response): void {
    res.status(404).json({
        success: false,
        error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` }
    });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express requires the 4-arg signature
export function errorHandler(err: ErrorWithMeta, req: Request, res: Response, next: NextFunction): void {
    if (res.headersSent) {
        next(err);
        return;
    }

    const status = resolveStatus(err);
    const expose = status < 500;
    const code =
        typeof err.code === 'string' && err.code
            ? err.code
            : err instanceof ApiError && err.code
              ? err.code
              : expose
                ? 'bad_request'
                : 'internal_error';

    serverLogger.error('API error', {
        method: req.method,
        url: req.originalUrl,
        status,
        code,
        message: err?.message,
        stack: err?.stack
    });

    res.status(status).json({
        success: false,
        error: {
            code,
            message: expose ? err.message : 'Internal server error'
        }
    });
}
