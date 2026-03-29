import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserPersonaCardEntry, UserPersonaContext, UserPersonaIncomeEntry } from '@app/shared';
import {
    newPersonaCardEntry,
    newPersonaIncomeEntry,
    PERSONA_COMMUNICATION_OPTIONS,
    PERSONA_CREDIT_CARD_TYPE_OPTIONS,
    PERSONA_HOUSEHOLD_OPTIONS,
    PERSONA_MONTH_DAY_OPTIONS,
    PERSONA_PRIMARY_OBJECTIVE_OPTIONS,
    PERSONA_PRIORITY_OPTIONS,
    PERSONA_REPORTING_DEPTH_OPTIONS,
    PERSONA_RESIDENCE_OPTIONS,
    PERSONA_TECHNICAL_OPTIONS
} from '@app/shared';

export interface PersonaAlignmentFormProps {
    value: UserPersonaContext;
    onChange: (next: UserPersonaContext) => void;
    disabled?: boolean;
    /** Slightly tighter spacing for onboarding modal */
    compact?: boolean;
}

export function PersonaAlignmentForm({ value, onChange, disabled, compact }: PersonaAlignmentFormProps) {
    const { t } = useTranslation();
    const profile = value.profile ?? {};
    const fg = value.financialGoals ?? {};
    const ap = value.aiPreferences ?? {};
    const priorities = fg.topPriorities ?? [];
    const cards = profile.cards ?? [];
    const incomes = fg.incomes ?? [];

    const [savingsStr, setSavingsStr] = useState('');
    const [savingsFocused, setSavingsFocused] = useState(false);
    useEffect(() => {
        if (savingsFocused) return;
        if (fg.monthlySavingsTarget === undefined || fg.monthlySavingsTarget === null) {
            setSavingsStr('');
        } else {
            setSavingsStr(String(fg.monthlySavingsTarget));
        }
    }, [fg.monthlySavingsTarget, savingsFocused]);

    const setProfile = (patch: Partial<NonNullable<UserPersonaContext['profile']>>) =>
        onChange({ ...value, profile: { ...profile, ...patch } });
    const setFg = (patch: Partial<NonNullable<UserPersonaContext['financialGoals']>>) =>
        onChange({ ...value, financialGoals: { ...fg, ...patch } });
    const setAp = (patch: Partial<NonNullable<UserPersonaContext['aiPreferences']>>) =>
        onChange({ ...value, aiPreferences: { ...ap, ...patch } });

    const togglePriority = (key: string) => {
        const set = new Set(priorities);
        if (set.has(key)) set.delete(key);
        else set.add(key);
        setFg({ topPriorities: [...set] });
    };

    const updateCard = (id: string, patch: Partial<UserPersonaCardEntry>) => {
        setProfile({
            cards: cards.map((c) => (c.id === id ? { ...c, ...patch } : c))
        });
    };

    const onCardTypeChange = (id: string, raw: string) => {
        if (!raw) {
            updateCard(id, { cardType: 'none', chargePaymentDay: undefined });
            return;
        }
        if (raw === 'debit' || raw === 'none') {
            updateCard(id, { cardType: raw as UserPersonaCardEntry['cardType'], chargePaymentDay: undefined });
        } else {
            updateCard(id, { cardType: raw as UserPersonaCardEntry['cardType'] });
        }
    };

    const removeCard = (id: string) => {
        setProfile({ cards: cards.filter((c) => c.id !== id) });
    };

    const addCard = () => {
        setProfile({ cards: [...cards, newPersonaCardEntry()] });
    };

    const updateIncome = (id: string, patch: Partial<UserPersonaIncomeEntry>) => {
        setFg({
            incomes: incomes.map((i) => (i.id === id ? { ...i, ...patch } : i))
        });
    };

    const toggleIncomeDay = (incomeId: string, day: number) => {
        const inc = incomes.find((i) => i.id === incomeId);
        if (!inc) return;
        const cur = [...(inc.paymentDays ?? [])];
        const ix = cur.indexOf(day);
        if (ix >= 0) cur.splice(ix, 1);
        else cur.push(day);
        cur.sort((a, b) => a - b);
        updateIncome(incomeId, { paymentDays: cur.length ? cur : undefined });
    };

    const removeIncome = (id: string) => {
        setFg({ incomes: incomes.filter((i) => i.id !== id) });
    };

    const addIncome = () => {
        setFg({ incomes: [...incomes, newPersonaIncomeEntry()] });
    };

    const gap = compact ? 'space-y-3' : 'space-y-5';
    const label = 'text-xs font-bold text-slate-600 block mb-1';
    const select =
        'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white disabled:opacity-50';

    const opt = (prefix: string, keys: readonly string[]) =>
        keys.map((k) => (
            <option key={k} value={k}>
                {t(`${prefix}.${k}`)}
            </option>
        ));

    const cardRowClass = 'rounded-xl border border-slate-200 bg-white p-4 space-y-3';

    return (
        <div className={gap}>
            <div>
                <h3 className="text-sm font-black text-slate-800 mb-2">{t('ai_settings.persona.section_profile')}</h3>
                <div className="space-y-3">
                    <div>
                        <label className={label}>{t('ai_settings.persona.narrative_notes')}</label>
                        <textarea
                            disabled={disabled}
                            rows={3}
                            className={`${select} min-h-[4.5rem] resize-y`}
                            value={profile.narrativeNotes ?? ''}
                            onChange={(e) => {
                                const v = e.target.value;
                                setProfile({ narrativeNotes: v === '' ? undefined : v });
                            }}
                            placeholder={t('ai_settings.persona.narrative_notes_placeholder')}
                        />
                        <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">{t('ai_settings.persona.narrative_notes_help')}</p>
                    </div>
                    <div>
                        <label className={label}>{t('ai_settings.persona.household_status')}</label>
                        <select
                            disabled={disabled}
                            className={select}
                            value={profile.householdStatus ?? ''}
                            onChange={(e) => setProfile({ householdStatus: e.target.value || undefined })}
                        >
                            <option value="">{t('ai_settings.persona.placeholder_select')}</option>
                            {opt('ai_settings.persona.options.household', PERSONA_HOUSEHOLD_OPTIONS)}
                        </select>
                    </div>
                    <div>
                        <label className={label}>{t('ai_settings.persona.residence_type')}</label>
                        <select
                            disabled={disabled}
                            className={select}
                            value={profile.residenceType ?? ''}
                            onChange={(e) => setProfile({ residenceType: e.target.value || undefined })}
                        >
                            <option value="">{t('ai_settings.persona.placeholder_select')}</option>
                            {opt('ai_settings.persona.options.residence', PERSONA_RESIDENCE_OPTIONS)}
                        </select>
                    </div>
                    <div>
                        <label className={label}>{t('ai_settings.persona.technical_skill')}</label>
                        <select
                            disabled={disabled}
                            className={select}
                            value={profile.technicalSkill ?? ''}
                            onChange={(e) => setProfile({ technicalSkill: e.target.value || undefined })}
                        >
                            <option value="">{t('ai_settings.persona.placeholder_select')}</option>
                            {opt('ai_settings.persona.options.technical', PERSONA_TECHNICAL_OPTIONS)}
                        </select>
                    </div>
                </div>
            </div>

            <div>
                <h3 className="text-sm font-black text-slate-800 mb-1">{t('ai_settings.persona.section_cards_income')}</h3>
                <p className="text-xs text-slate-500 mb-3 leading-snug">{t('ai_settings.persona.section_cards_income_help')}</p>

                <div className="space-y-4">
                    <div>
                        <span className={`${label} mb-2`}>{t('ai_settings.persona.cards_heading')}</span>
                        {cards.length === 0 && (
                            <p className="text-xs text-slate-400 mb-2">{t('ai_settings.persona.cards_empty_hint')}</p>
                        )}
                        <div className="space-y-3">
                            {cards.map((card) => {
                                const showCharge =
                                    card.cardType === 'charge_card' || card.cardType === 'both';
                                return (
                                    <div key={card.id} className={cardRowClass}>
                                        <div className="flex justify-between gap-2 items-start">
                                            <input
                                                type="text"
                                                disabled={disabled}
                                                className={select}
                                                value={card.label ?? ''}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    updateCard(card.id, { label: v === '' ? undefined : v });
                                                }}
                                                placeholder={t('ai_settings.persona.card_label_placeholder')}
                                            />
                                            <button
                                                type="button"
                                                disabled={disabled}
                                                onClick={() => removeCard(card.id)}
                                                className="shrink-0 text-xs font-bold text-red-600 hover:text-red-800 px-2 py-1.5 rounded-lg hover:bg-red-50"
                                            >
                                                {t('ai_settings.persona.remove_row')}
                                            </button>
                                        </div>
                                        <div>
                                            <label className={label}>{t('ai_settings.persona.credit_card_type')}</label>
                                            <select
                                                disabled={disabled}
                                                className={select}
                                                value={card.cardType ?? 'none'}
                                                onChange={(e) => onCardTypeChange(card.id, e.target.value)}
                                            >
                                                {opt('ai_settings.persona.options.credit_card', PERSONA_CREDIT_CARD_TYPE_OPTIONS)}
                                            </select>
                                        </div>
                                        {showCharge && (
                                            <div>
                                                <label className={label}>{t('ai_settings.persona.charge_card_payment_day')}</label>
                                                <select
                                                    disabled={disabled}
                                                    className={select}
                                                    value={card.chargePaymentDay === undefined ? '' : String(card.chargePaymentDay)}
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        if (v === '') {
                                                            updateCard(card.id, { chargePaymentDay: undefined });
                                                            return;
                                                        }
                                                        const n = parseInt(v, 10);
                                                        if (!Number.isFinite(n)) return;
                                                        updateCard(card.id, {
                                                            chargePaymentDay: Math.min(31, Math.max(1, n))
                                                        });
                                                    }}
                                                >
                                                    <option value="">{t('ai_settings.persona.placeholder_select')}</option>
                                                    {PERSONA_MONTH_DAY_OPTIONS.map((d) => (
                                                        <option key={d} value={d}>
                                                            {d}
                                                        </option>
                                                    ))}
                                                </select>
                                                <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">
                                                    {t('ai_settings.persona.charge_card_payment_day_help')}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <button
                            type="button"
                            disabled={disabled}
                            onClick={addCard}
                            className="mt-2 text-sm font-bold text-indigo-600 hover:text-indigo-800"
                        >
                            + {t('ai_settings.persona.add_card')}
                        </button>
                    </div>

                    <div>
                        <span className={`${label} mb-2`}>{t('ai_settings.persona.incomes_heading')}</span>
                        {incomes.length === 0 && (
                            <p className="text-xs text-slate-400 mb-2">{t('ai_settings.persona.incomes_empty_hint')}</p>
                        )}
                        <div className="space-y-3">
                            {incomes.map((inc) => (
                                <div key={inc.id} className={cardRowClass}>
                                    <div className="flex justify-between gap-2 items-start">
                                        <input
                                            type="text"
                                            disabled={disabled}
                                            className={select}
                                            value={inc.label ?? ''}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                updateIncome(inc.id, { label: v === '' ? undefined : v });
                                            }}
                                            placeholder={t('ai_settings.persona.income_label_placeholder')}
                                        />
                                        <button
                                            type="button"
                                            disabled={disabled}
                                            onClick={() => removeIncome(inc.id)}
                                            className="shrink-0 text-xs font-bold text-red-600 hover:text-red-800 px-2 py-1.5 rounded-lg hover:bg-red-50"
                                        >
                                            {t('ai_settings.persona.remove_row')}
                                        </button>
                                    </div>
                                    <div>
                                        <p className="text-[11px] text-slate-500 mb-2 leading-snug">
                                            {t('ai_settings.persona.income_payment_days_help')}
                                        </p>
                                        <div className="flex flex-wrap gap-1.5 max-w-full">
                                            {PERSONA_MONTH_DAY_OPTIONS.map((d) => (
                                                <button
                                                    key={d}
                                                    type="button"
                                                    disabled={disabled}
                                                    onClick={() => toggleIncomeDay(inc.id, d)}
                                                    className={`min-w-[2.25rem] px-2 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                                                        (inc.paymentDays ?? []).includes(d)
                                                            ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                                                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                                    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                >
                                                    {d}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className={label}>{t('ai_settings.persona.income_row_notes')}</label>
                                        <textarea
                                            disabled={disabled}
                                            rows={2}
                                            className={`${select} min-h-[3rem] resize-y`}
                                            value={inc.notes ?? ''}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                updateIncome(inc.id, { notes: v === '' ? undefined : v });
                                            }}
                                            placeholder={t('ai_settings.persona.income_dates_notes_placeholder')}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button
                            type="button"
                            disabled={disabled}
                            onClick={addIncome}
                            className="mt-2 text-sm font-bold text-indigo-600 hover:text-indigo-800"
                        >
                            + {t('ai_settings.persona.add_income')}
                        </button>
                    </div>
                </div>
            </div>

            <div>
                <h3 className="text-sm font-black text-slate-800 mb-2">{t('ai_settings.persona.section_goals')}</h3>
                <div className="space-y-3">
                    <div>
                        <label className={label}>{t('ai_settings.persona.primary_objective')}</label>
                        <select
                            disabled={disabled}
                            className={select}
                            value={fg.primaryObjective ?? ''}
                            onChange={(e) => setFg({ primaryObjective: e.target.value || undefined })}
                        >
                            <option value="">{t('ai_settings.persona.placeholder_select')}</option>
                            {opt('ai_settings.persona.options.objective', PERSONA_PRIMARY_OBJECTIVE_OPTIONS)}
                        </select>
                    </div>
                    <div>
                        <span className={label}>{t('ai_settings.persona.top_priorities')}</span>
                        <div className="flex flex-wrap gap-2 mt-1">
                            {PERSONA_PRIORITY_OPTIONS.map((k) => (
                                <label
                                    key={k}
                                    className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border cursor-pointer ${
                                        priorities.includes(k)
                                            ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                                            : 'border-slate-200 bg-slate-50 text-slate-700'
                                    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-300"
                                        checked={priorities.includes(k)}
                                        disabled={disabled}
                                        onChange={() => togglePriority(k)}
                                    />
                                    {t(`ai_settings.persona.options.priority.${k}`)}
                                </label>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className={label}>{t('ai_settings.persona.monthly_savings_target')}</label>
                        <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            disabled={disabled}
                            className={select}
                            value={savingsStr}
                            onFocus={() => setSavingsFocused(true)}
                            onBlur={(e) => {
                                setSavingsFocused(false);
                                const cleaned = e.currentTarget.value.replace(/[^\d.,]/g, '').replace(',', '.');
                                if (cleaned === '' || cleaned === '.') {
                                    setFg({ monthlySavingsTarget: undefined });
                                    setSavingsStr('');
                                    return;
                                }
                                const n = parseFloat(cleaned);
                                if (Number.isFinite(n)) {
                                    setFg({ monthlySavingsTarget: n });
                                    setSavingsStr(String(n));
                                }
                            }}
                            onChange={(e) => {
                                const raw = e.target.value;
                                const cleaned = raw.replace(/[^\d.,]/g, '').replace(',', '.');
                                setSavingsStr(cleaned);
                                if (cleaned === '' || cleaned === '.') {
                                    setFg({ monthlySavingsTarget: undefined });
                                    return;
                                }
                                const n = parseFloat(cleaned);
                                if (Number.isFinite(n)) {
                                    setFg({ monthlySavingsTarget: n });
                                }
                            }}
                            placeholder={t('ai_settings.persona.savings_placeholder')}
                        />
                    </div>
                </div>
            </div>

            <div>
                <h3 className="text-sm font-black text-slate-800 mb-2">{t('ai_settings.persona.section_ai')}</h3>
                <div className="space-y-3">
                    <div>
                        <label className={label}>{t('ai_settings.persona.communication_style')}</label>
                        <select
                            disabled={disabled}
                            className={select}
                            value={ap.communicationStyle ?? ''}
                            onChange={(e) => setAp({ communicationStyle: e.target.value || undefined })}
                        >
                            <option value="">{t('ai_settings.persona.placeholder_select')}</option>
                            {opt('ai_settings.persona.options.communication', PERSONA_COMMUNICATION_OPTIONS)}
                        </select>
                    </div>
                    <div>
                        <label className={label}>{t('ai_settings.persona.reporting_depth')}</label>
                        <select
                            disabled={disabled}
                            className={select}
                            value={ap.reportingDepth ?? ''}
                            onChange={(e) => setAp({ reportingDepth: e.target.value || undefined })}
                        >
                            <option value="">{t('ai_settings.persona.placeholder_select')}</option>
                            {opt('ai_settings.persona.options.depth', PERSONA_REPORTING_DEPTH_OPTIONS)}
                        </select>
                    </div>
                </div>
            </div>
        </div>
    );
}
