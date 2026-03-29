import type { UserPersonaCardEntry, UserPersonaContext, UserPersonaIncomeEntry } from './types.js';

function randomEntryId(): string {
    if (typeof globalThis !== 'undefined' && globalThis.crypto && 'randomUUID' in globalThis.crypto) {
        return globalThis.crypto.randomUUID();
    }
    return `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Deep-merge persona updates from API (partial payloads). */
export function mergeUserPersonaContext(
    a: UserPersonaContext | undefined,
    b: Partial<UserPersonaContext> | undefined
): UserPersonaContext {
    if (!b) return a || {};
    return {
        profile: {
            ...a?.profile,
            ...b.profile,
            cards: b.profile?.cards !== undefined ? b.profile.cards : a?.profile?.cards
        },
        financialGoals: {
            ...a?.financialGoals,
            ...b.financialGoals,
            topPriorities:
                b.financialGoals?.topPriorities !== undefined
                    ? b.financialGoals.topPriorities
                    : a?.financialGoals?.topPriorities,
            incomePaymentDays:
                b.financialGoals?.incomePaymentDays !== undefined
                    ? b.financialGoals.incomePaymentDays
                    : a?.financialGoals?.incomePaymentDays,
            incomes: b.financialGoals?.incomes !== undefined ? b.financialGoals.incomes : a?.financialGoals?.incomes
        },
        aiPreferences: { ...a?.aiPreferences, ...b.aiPreferences }
    };
}

export function newPersonaCardEntry(overrides?: Partial<UserPersonaCardEntry>): UserPersonaCardEntry {
    return {
        id: overrides?.id ?? randomEntryId(),
        label: overrides?.label,
        cardType: overrides?.cardType ?? 'none',
        chargePaymentDay: overrides?.chargePaymentDay
    };
}

export function newPersonaIncomeEntry(overrides?: Partial<UserPersonaIncomeEntry>): UserPersonaIncomeEntry {
    return {
        id: overrides?.id ?? randomEntryId(),
        label: overrides?.label,
        paymentDays: overrides?.paymentDays,
        notes: overrides?.notes
    };
}

/** True if saved JSON uses legacy single-card / flat income fields but not the new arrays. */
export function personaNeedsLegacyMigration(ctx: UserPersonaContext | undefined): boolean {
    if (!ctx) return false;
    const p = ctx.profile;
    const fg = ctx.financialGoals;
    const legacyCard =
        !!(p?.creditCardType && String(p.creditCardType).trim()) ||
        (p?.chargeCardPaymentDay !== undefined && p?.chargeCardPaymentDay !== null);
    const hasCards = (p?.cards && p.cards.length > 0) ?? false;
    const legacyIncome =
        !!(fg?.incomePaymentDays && fg.incomePaymentDays.length > 0) ||
        !!(fg?.incomeDatesNotes && fg.incomeDatesNotes.trim());
    const hasIncomes = (fg?.incomes && fg.incomes.length > 0) ?? false;
    return (legacyCard && !hasCards) || (legacyIncome && !hasIncomes);
}

/** Copy legacy fields into `cards` / `incomes` once (caller should persist). */
const CARD_TYPES: readonly UserPersonaCardEntry['cardType'][] = ['debit', 'charge_card', 'both', 'none'];

export function migrateLegacyPersonaFields(ctx: UserPersonaContext): UserPersonaContext {
    const out: UserPersonaContext = JSON.parse(JSON.stringify(ctx));
    if (!out.profile) out.profile = {};
    if (!out.financialGoals) out.financialGoals = {};
    const p = out.profile;
    const fg = out.financialGoals;

    if ((!p.cards || p.cards.length === 0) && (p.creditCardType || p.chargeCardPaymentDay != null)) {
        const raw = p.creditCardType;
        const cardType: UserPersonaCardEntry['cardType'] =
            raw && CARD_TYPES.includes(raw as UserPersonaCardEntry['cardType'])
                ? (raw as UserPersonaCardEntry['cardType'])
                : 'none';
        p.cards = [
            newPersonaCardEntry({
                cardType,
                chargePaymentDay: p.chargeCardPaymentDay
            })
        ];
    }
    if (
        (!fg.incomes || fg.incomes.length === 0) &&
        ((fg.incomePaymentDays && fg.incomePaymentDays.length > 0) || (fg.incomeDatesNotes && fg.incomeDatesNotes.trim()))
    ) {
        fg.incomes = [
            newPersonaIncomeEntry({
                paymentDays: fg.incomePaymentDays?.length ? [...fg.incomePaymentDays] : undefined,
                notes: fg.incomeDatesNotes?.trim() || undefined
            })
        ];
    }
    return out;
}

/** After migration to arrays, omit deprecated keys so the stored JSON stays clean. */
export function stripLegacyPersonaFieldsIfSuperseded(ctx: UserPersonaContext): UserPersonaContext {
    const out: UserPersonaContext = JSON.parse(JSON.stringify(ctx));
    if (out.profile?.cards?.length) {
        delete out.profile.creditCardType;
        delete out.profile.chargeCardPaymentDay;
    }
    if (out.financialGoals?.incomes?.length) {
        delete out.financialGoals.incomePaymentDays;
        delete out.financialGoals.incomeDatesNotes;
    }
    return out;
}

export const PERSONA_HOUSEHOLD_OPTIONS = [
    'single',
    'couple_no_children',
    'family_with_children',
    'other'
] as const;

export const PERSONA_RESIDENCE_OPTIONS = ['rent', 'owned_no_mortgage', 'owned_mortgage', 'other'] as const;

export const PERSONA_TECHNICAL_OPTIONS = ['beginner', 'intermediate', 'advanced', 'expert'] as const;

export const PERSONA_PRIMARY_OBJECTIVE_OPTIONS = [
    'reduce_debt',
    'identify_wasteful_spending',
    'track_subscriptions',
    'save_for_goal',
    'general_visibility',
    'other'
] as const;

export const PERSONA_PRIORITY_OPTIONS = [
    'saving_for_vacation',
    'reducing_commissions',
    'building_emergency_fund',
    'investing',
    'lowering_fixed_costs',
    'other'
] as const;

export const PERSONA_COMMUNICATION_OPTIONS = [
    'supportive_coach',
    'neutral_analyst',
    'critical_realist',
    'brief_bullets'
] as const;

/** Shallow → deep (dropdown order). */
export const PERSONA_REPORTING_DEPTH_OPTIONS = ['low', 'high_level', 'standard', 'detailed_analysis'] as const;

/** Debit (charged from account) vs charge card (monthly statement). */
export const PERSONA_CREDIT_CARD_TYPE_OPTIONS = ['debit', 'charge_card', 'both', 'none'] as const;

/** Days 1–31 for income / payment pickers. */
export const PERSONA_MONTH_DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1) as readonly number[];

function cardEntryHasData(c: UserPersonaCardEntry): boolean {
    return (
        !!(c.label && c.label.trim()) ||
        (c.cardType && c.cardType !== 'none') ||
        (c.chargePaymentDay !== undefined && c.chargePaymentDay !== null && !Number.isNaN(Number(c.chargePaymentDay)))
    );
}

function incomeEntryHasData(i: UserPersonaIncomeEntry): boolean {
    return (
        !!(i.label && i.label.trim()) ||
        !!(i.paymentDays && i.paymentDays.length > 0) ||
        !!(i.notes && i.notes.trim())
    );
}

export function isUserPersonaEmpty(p: UserPersonaContext | undefined | null): boolean {
    if (!p) return true;
    const pr = p.profile;
    const fg = p.financialGoals;
    const ap = p.aiPreferences;

    const hasCardsList = pr?.cards?.some(cardEntryHasData);
    const hasLegacyCard =
        !!(pr?.creditCardType && pr.creditCardType.trim()) ||
        (pr?.chargeCardPaymentDay !== undefined &&
            pr.chargeCardPaymentDay !== null &&
            !Number.isNaN(Number(pr.chargeCardPaymentDay)));

    const hasIncomesList = fg?.incomes?.some(incomeEntryHasData);
    const hasLegacyIncome =
        !!(fg?.incomePaymentDays && fg.incomePaymentDays.length > 0) || !!(fg?.incomeDatesNotes && fg.incomeDatesNotes.trim());

    const hasProfile =
        !!(pr?.narrativeNotes && pr.narrativeNotes.trim()) ||
        (pr?.householdStatus && pr.householdStatus.trim()) ||
        (pr?.residenceType && pr.residenceType.trim()) ||
        (pr?.technicalSkill && pr.technicalSkill.trim()) ||
        hasCardsList ||
        hasLegacyCard;
    const hasGoals =
        (fg?.primaryObjective && fg.primaryObjective.trim()) ||
        (fg?.topPriorities && fg.topPriorities.length > 0) ||
        (fg?.monthlySavingsTarget !== undefined &&
            fg.monthlySavingsTarget !== null &&
            !Number.isNaN(Number(fg.monthlySavingsTarget))) ||
        hasIncomesList ||
        hasLegacyIncome;
    const hasPrefs =
        (ap?.communicationStyle && ap.communicationStyle.trim()) || (ap?.reportingDepth && ap.reportingDepth.trim());
    return !hasProfile && !hasGoals && !hasPrefs;
}

export interface PersonaExtractFromNarrativeResult {
    persona: UserPersonaContext;
    /** Short bullets the UI can show after extraction */
    facts: string[];
}

function pickEnum<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
    if (typeof v !== 'string') return undefined;
    return (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

function clampDay(n: number): number {
    return Math.min(31, Math.max(1, Math.round(n)));
}

/** Normalize Gemini JSON into a safe UserPersonaContext (ids on card/income rows, valid enums). */
export function normalizePersonaExtractFromAi(raw: unknown): PersonaExtractFromNarrativeResult {
    const facts: string[] = [];
    if (!raw || typeof raw !== 'object') {
        return { persona: {}, facts };
    }
    const root = raw as Record<string, unknown>;
    const fa = root.facts;
    if (Array.isArray(fa)) {
        for (const x of fa) {
            if (typeof x === 'string') {
                const t = x.trim();
                if (t) facts.push(t);
            }
        }
    }

    const inner = root.persona;
    if (!inner || typeof inner !== 'object') {
        return { persona: {}, facts };
    }
    const p = inner as Record<string, unknown>;

    const out: UserPersonaContext = {};

    const prof = p.profile;
    if (prof && typeof prof === 'object') {
        const pr = prof as Record<string, unknown>;
        const profile: NonNullable<UserPersonaContext['profile']> = {};
        if (typeof pr.narrativeNotes === 'string' && pr.narrativeNotes.trim()) {
            profile.narrativeNotes = pr.narrativeNotes.trim();
        }
        const hs = pickEnum(pr.householdStatus, PERSONA_HOUSEHOLD_OPTIONS);
        if (hs) profile.householdStatus = hs;
        const rt = pickEnum(pr.residenceType, PERSONA_RESIDENCE_OPTIONS);
        if (rt) profile.residenceType = rt;
        const ts = pickEnum(pr.technicalSkill, PERSONA_TECHNICAL_OPTIONS);
        if (ts) profile.technicalSkill = ts;
        const cardsRaw = pr.cards;
        if (Array.isArray(cardsRaw) && cardsRaw.length > 0) {
            const cards: UserPersonaCardEntry[] = [];
            for (const c of cardsRaw) {
                if (!c || typeof c !== 'object') continue;
                const o = c as Record<string, unknown>;
                const cardType = pickEnum(o.cardType, PERSONA_CREDIT_CARD_TYPE_OPTIONS) ?? 'none';
                let chargePaymentDay: number | undefined;
                if (typeof o.chargePaymentDay === 'number' && Number.isFinite(o.chargePaymentDay)) {
                    chargePaymentDay = clampDay(o.chargePaymentDay);
                }
                const label = typeof o.label === 'string' ? o.label.trim() || undefined : undefined;
                if (cardType === 'debit' || cardType === 'none') {
                    cards.push(newPersonaCardEntry({ label, cardType, chargePaymentDay: undefined }));
                } else {
                    cards.push(newPersonaCardEntry({ label, cardType, chargePaymentDay }));
                }
            }
            if (cards.length) profile.cards = cards;
        }
        if (Object.keys(profile).length) out.profile = profile;
    }

    const fgIn = p.financialGoals;
    if (fgIn && typeof fgIn === 'object') {
        const fg = fgIn as Record<string, unknown>;
        const financialGoals: NonNullable<UserPersonaContext['financialGoals']> = {};
        const po = pickEnum(fg.primaryObjective, PERSONA_PRIMARY_OBJECTIVE_OPTIONS);
        if (po) financialGoals.primaryObjective = po;
        const tp = fg.topPriorities;
        if (Array.isArray(tp)) {
            const set = new Set<string>();
            for (const x of tp) {
                if (typeof x === 'string' && PERSONA_PRIORITY_OPTIONS.includes(x as (typeof PERSONA_PRIORITY_OPTIONS)[number])) {
                    set.add(x);
                }
            }
            if (set.size) financialGoals.topPriorities = [...set];
        }
        if (typeof fg.monthlySavingsTarget === 'number' && Number.isFinite(fg.monthlySavingsTarget) && fg.monthlySavingsTarget >= 0) {
            financialGoals.monthlySavingsTarget = fg.monthlySavingsTarget;
        }
        const incomesRaw = fg.incomes;
        if (Array.isArray(incomesRaw) && incomesRaw.length > 0) {
            const incomes: UserPersonaIncomeEntry[] = [];
            for (const row of incomesRaw) {
                if (!row || typeof row !== 'object') continue;
                const o = row as Record<string, unknown>;
                const label = typeof o.label === 'string' ? o.label.trim() || undefined : undefined;
                const notes = typeof o.notes === 'string' ? o.notes.trim() || undefined : undefined;
                let paymentDays: number[] | undefined;
                const pd = o.paymentDays;
                if (Array.isArray(pd)) {
                    const days = new Set<number>();
                    for (const d of pd) {
                        if (typeof d === 'number' && Number.isFinite(d)) {
                            days.add(clampDay(d));
                        }
                    }
                    if (days.size) {
                        paymentDays = [...days].sort((a, b) => a - b);
                    }
                }
                incomes.push(newPersonaIncomeEntry({ label, notes, paymentDays }));
            }
            if (incomes.length) financialGoals.incomes = incomes;
        }
        if (Object.keys(financialGoals).length) out.financialGoals = financialGoals;
    }

    const apIn = p.aiPreferences;
    if (apIn && typeof apIn === 'object') {
        const ap = apIn as Record<string, unknown>;
        const aiPreferences: NonNullable<UserPersonaContext['aiPreferences']> = {};
        const cs = pickEnum(ap.communicationStyle, PERSONA_COMMUNICATION_OPTIONS);
        if (cs) aiPreferences.communicationStyle = cs;
        const rd = pickEnum(ap.reportingDepth, PERSONA_REPORTING_DEPTH_OPTIONS);
        if (rd) aiPreferences.reportingDepth = rd;
        if (Object.keys(aiPreferences).length) out.aiPreferences = aiPreferences;
    }

    return { persona: out, facts };
}
