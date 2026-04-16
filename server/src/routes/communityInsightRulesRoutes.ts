import { Router } from 'express';
import { parseCommunityInsightRuleSubmission } from '@app/shared';
import {
    resolveCommunityInsightRulesGasUrl,
    resolveCommunityInsightRulesSecret,
} from '../config/communityInsightRulesProxyDefaults.js';
import { communityInsightSubmitRateLimit } from './communityInsightRulesRateLimit.js';

export const communityInsightRulesRoutes = Router();

communityInsightRulesRoutes.get('/config', (_req, res) => {
    const secret = resolveCommunityInsightRulesSecret();
    res.json({
        success: true,
        data: {
            /** True when the server can forward submits to GAS (secret set in env or runtime-settings). */
            submitViaProxy: !!secret,
        },
    });
});

communityInsightRulesRoutes.post('/submit', communityInsightSubmitRateLimit, async (req, res) => {
    const url = resolveCommunityInsightRulesGasUrl();
    const secret = resolveCommunityInsightRulesSecret();
    if (!secret) {
        return res.status(503).json({
            success: false,
            error:
                'Community submit is not configured: set COMMUNITY_INSIGHT_RULES_SECRET in OS env or data/config/runtime-settings.json (same value as GAS AUTH_SECRET).',
        });
    }

    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const idempotencyKey =
        typeof body.idempotencyKey === 'string' ? body.idempotencyKey : undefined;
    const rest = { ...body };
    delete rest.idempotencyKey;

    const parsed = parseCommunityInsightRuleSubmission(rest);
    if (!parsed.ok) {
        return res.status(400).json({ success: false, error: parsed.error });
    }

    // GAS Web App deployments often omit `Authorization` from `e.postData.headers`; `authSecret`
    // in the JSON body is the reliable path (see gas/community-insight-rules/Code.gs).
    const payload = {
        authSecret: secret,
        version: parsed.value.version,
        author: parsed.value.author,
        description: parsed.value.description,
        rule: parsed.value.rule,
        ...(idempotencyKey ? { idempotencyKey } : {}),
    };

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
    };
    const idemHeader = req.get('Idempotency-Key');
    if (idemHeader) {
        headers['Idempotency-Key'] = idemHeader;
    }

    let gasResponse: globalThis.Response;
    try {
        gasResponse = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return res.status(502).json({ success: false, error: msg });
    }

    const text = await gasResponse.text();
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        return res.status(502).json({ success: false, error: 'Invalid response from community endpoint' });
    }

    if (!gasResponse.ok) {
        const status = gasResponse.status >= 400 && gasResponse.status < 600 ? gasResponse.status : 502;
        return res.status(status).json({ success: false, data: json });
    }

    // Apps Script ContentService usually returns HTTP 200 even when the script responds with
    // JSON like { ok: false, error: "unauthorized" } — treat that as failure for the API client.
    if (
        json &&
        typeof json === 'object' &&
        'ok' in json &&
        (json as { ok?: unknown }).ok === false
    ) {
        const errField = (json as unknown as { error?: unknown }).error;
        const err =
            typeof errField === 'string' ? errField : 'Community endpoint returned an error';
        const status = err === 'unauthorized' ? 401 : 502;
        return res.status(status).json({ success: false, error: err, data: json });
    }

    res.json({ success: true, data: json });
});
