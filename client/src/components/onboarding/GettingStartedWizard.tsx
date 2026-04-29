import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ArrowLeft,
    ArrowRight,
    CheckCircle2,
    GripVertical,
    LayoutDashboard,
    Map,
    PlayCircle,
    ScrollText,
    Settings2,
    Sparkles,
    Landmark,
    TrendingUp,
    Upload,
    X,
} from 'lucide-react';
import { useGettingStarted } from '../../contexts/GettingStartedContext';
import type { AppUrlState } from '../../utils/appUrlState';
import { GETTING_STARTED_STEP_COUNT } from '../../hooks/useGettingStartedState';
import { GettingStartedInvestmentPanel } from './GettingStartedInvestmentPanel';

const PANEL_OFFSET_STORAGE_KEY = 'bank-scraper-getting-started-panel-offset-v1';
const PANEL_DRAG_MARGIN_PX = 8;

function readPanelOffset(): { dx: number; dy: number } {
    try {
        const raw = localStorage.getItem(PANEL_OFFSET_STORAGE_KEY);
        if (!raw) return { dx: 0, dy: 0 };
        const parsed = JSON.parse(raw) as { dx?: unknown; dy?: unknown };
        const dx = typeof parsed.dx === 'number' ? parsed.dx : 0;
        const dy = typeof parsed.dy === 'number' ? parsed.dy : 0;
        return { dx, dy };
    } catch {
        return { dx: 0, dy: 0 };
    }
}

function persistPanelOffset(offset: { dx: number; dy: number }) {
    try {
        localStorage.setItem(PANEL_OFFSET_STORAGE_KEY, JSON.stringify(offset));
    } catch {
        /* ignore quota */
    }
}

/** Temporarily applies transform and measures; restores previous inline transform. */
function clampPanelOffset(el: HTMLElement, dx: number, dy: number, margin: number): { dx: number; dy: number } {
    const prev = el.style.transform;
    el.style.transform = `translateY(-50%) translate(${dx}px, ${dy}px)`;
    const r = el.getBoundingClientRect();
    let fx = dx;
    let fy = dy;
    if (r.left < margin) fx += margin - r.left;
    if (r.right > window.innerWidth - margin) fx -= r.right - (window.innerWidth - margin);
    if (r.top < margin) fy += margin - r.top;
    if (r.bottom > window.innerHeight - margin) fy -= r.bottom - (window.innerHeight - margin);
    el.style.transform = prev;
    return { dx: fx, dy: fy };
}

const NAV_BY_STEP: (Partial<AppUrlState> | null)[] = [
    null,
    { view: 'scrape' },
    { view: 'scrape' },
    { view: 'scrape' },
    { view: 'dashboard' },
    { view: 'logs', logType: 'server', logEntryId: null },
    { view: 'configuration', configTab: 'scrape' },
    { view: 'configuration', configTab: 'investments' },
];

export interface GettingStartedWizardProps {
    onNavigate: (patch: Partial<AppUrlState>) => void;
}

export function GettingStartedWizard({ onNavigate }: GettingStartedWizardProps) {
    const { t } = useTranslation();
    const { step, nextStep, prevStep, complete, continueLater } = useGettingStarted();
    const cardRef = useRef<HTMLDivElement>(null);
    const [dragOffset, setDragOffset] = useState(() => readPanelOffset());
    const dragOffsetRef = useRef(dragOffset);
    dragOffsetRef.current = dragOffset;
    const dragSession = useRef<{
        pointerId: number;
        startX: number;
        startY: number;
        originDx: number;
        originDy: number;
    } | null>(null);

    const applyDragPointer = useCallback((clientX: number, clientY: number, persist: boolean) => {
        const s = dragSession.current;
        if (!s) return;
        const ndx = s.originDx + (clientX - s.startX);
        const ndy = s.originDy + (clientY - s.startY);
        const el = cardRef.current;
        const clamped = el
            ? clampPanelOffset(el, ndx, ndy, PANEL_DRAG_MARGIN_PX)
            : { dx: ndx, dy: ndy };
        setDragOffset(clamped);
        if (persist) persistPanelOffset(clamped);
    }, []);

    useEffect(() => {
        const patch = NAV_BY_STEP[step];
        if (patch) {
            onNavigate(patch);
        }
    }, [step, onNavigate]);

    const stepIcon = (s: number) => {
        const cls = 'w-6 h-6';
        switch (s) {
            case 0:
                return <Sparkles className={cls} />;
            case 1:
                return <Landmark className={cls} />;
            case 2:
                return <PlayCircle className={cls} />;
            case 3:
                return <Upload className={cls} />;
            case 4:
                return <LayoutDashboard className={cls} />;
            case 5:
                return <ScrollText className={cls} />;
            case 6:
                return <Settings2 className={cls} />;
            case 7:
                return <TrendingUp className={cls} />;
            default:
                return <Map className={cls} />;
        }
    };

    const totalSteps = GETTING_STARTED_STEP_COUNT;
    const progressLabel = `${Math.min(step + 1, totalSteps)} / ${totalSteps}`;

    const skipEntireTour = () => {
        complete();
    };

    return (
        <div
            className="fixed inset-0 z-[99] pointer-events-none"
            role="dialog"
            aria-modal="true"
            aria-labelledby="getting-started-title"
        >
            <div
                ref={cardRef}
                style={{
                    transform: `translateY(-50%) translate(${dragOffset.dx}px, ${dragOffset.dy}px)`,
                }}
                className="pointer-events-auto fixed right-4 top-1/2 z-[99] w-[calc(100%-2rem)] max-w-md sm:max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col ring-1 ring-slate-900/5"
            >
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
                    <div
                        aria-label={t('getting_started.drag_handle_label')}
                        className="flex items-center gap-2 min-w-0 flex-1 cursor-grab active:cursor-grabbing touch-none select-none py-1 -my-1 rounded-lg hover:bg-slate-50/80"
                        onPointerDown={(e) => {
                            if (e.button !== 0) return;
                            dragSession.current = {
                                pointerId: e.pointerId,
                                startX: e.clientX,
                                startY: e.clientY,
                                originDx: dragOffsetRef.current.dx,
                                originDy: dragOffsetRef.current.dy,
                            };
                            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                        }}
                        onPointerMove={(e) => {
                            if (!dragSession.current || e.pointerId !== dragSession.current.pointerId) return;
                            applyDragPointer(e.clientX, e.clientY, false);
                        }}
                        onPointerUp={(e) => {
                            if (!dragSession.current || e.pointerId !== dragSession.current.pointerId) return;
                            applyDragPointer(e.clientX, e.clientY, true);
                            dragSession.current = null;
                            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                        }}
                        onPointerCancel={(e) => {
                            if (!dragSession.current || e.pointerId !== dragSession.current.pointerId) return;
                            applyDragPointer(e.clientX, e.clientY, true);
                            dragSession.current = null;
                            try {
                                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                            } catch {
                                /* already released */
                            }
                        }}
                    >
                        <GripVertical className="w-4 h-4 text-slate-400 shrink-0" aria-hidden />
                        <span className="text-[10px] font-black uppercase tracking-widest text-teal-600 shrink-0">
                            {t('getting_started.badge')}
                        </span>
                        <span className="text-xs font-bold text-slate-500 truncate">{progressLabel}</span>
                    </div>
                    <button
                        type="button"
                        onClick={continueLater}
                        className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                        title={t('getting_started.continue_later')}
                        aria-label={t('getting_started.continue_later')}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    <div className="flex items-start gap-3">
                        <div className="p-2 rounded-xl bg-teal-50 text-teal-700 shrink-0">{stepIcon(step)}</div>
                        <div className="min-w-0 flex-1">
                            <h2 id="getting-started-title" className="text-xl font-black text-slate-900 leading-tight">
                                {t(`getting_started.step_${step}_title`)}
                            </h2>
                            <p className="text-sm text-slate-600 mt-2 leading-relaxed whitespace-pre-line">
                                {t(`getting_started.step_${step}_body`)}
                            </p>
                            {step === 7 && <GettingStartedInvestmentPanel />}
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 flex flex-wrap items-center gap-2 justify-between bg-slate-50/80 rounded-b-2xl shrink-0">
                    <div className="flex gap-2">
                        {step > 0 && (
                            <button
                                type="button"
                                onClick={prevStep}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-white"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                {t('getting_started.back')}
                            </button>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2 justify-end">
                        {step === 0 && (
                            <>
                                <button
                                    type="button"
                                    onClick={skipEntireTour}
                                    className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100"
                                >
                                    {t('getting_started.skip_all')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => nextStep()}
                                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-black hover:bg-teal-700"
                                >
                                    {t('getting_started.next')}
                                    <ArrowRight className="w-4 h-4" />
                                </button>
                            </>
                        )}
                        {step > 0 && step < totalSteps - 1 && (
                            <>
                                <button
                                    type="button"
                                    onClick={skipEntireTour}
                                    className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100"
                                >
                                    {t('getting_started.skip_all')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => nextStep()}
                                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-black hover:bg-teal-700"
                                >
                                    {t('getting_started.next')}
                                    <ArrowRight className="w-4 h-4" />
                                </button>
                            </>
                        )}
                        {step === totalSteps - 1 && (
                            <button
                                type="button"
                                onClick={() => complete()}
                                className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-black hover:bg-emerald-700"
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                {t('getting_started.finish')}
                            </button>
                        )}
                    </div>
                </div>

                <p className="px-6 pb-4 text-center text-[11px] text-slate-400">{t('getting_started.footer_hint')}</p>
            </div>
        </div>
    );
}
