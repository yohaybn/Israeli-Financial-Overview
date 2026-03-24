import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

type DragTarget = 'medium' | 'high' | null;

export interface SeverityThresholdBarProps {
  mediumMin: number;
  highMin: number;
  onChange: (next: { severityMediumMinScore: number; severityHighMinScore: number }) => void;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Two-thumb bar 0–100: green (low), yellow (medium), orange→red (high).
 * Drag handles to set where medium and high severity start.
 */
export function SeverityThresholdBar({ mediumMin, highMin, onChange }: SeverityThresholdBarProps) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<DragTarget>(null);

  let med = clamp(Math.round(mediumMin), 1, 98);
  let high = clamp(Math.round(highMin), 2, 100);
  if (high <= med) high = med + 1;
  if (high > 100) {
    high = 100;
    med = 99;
  }

  const setFromPointer = useCallback(
    (clientX: number, target: 'medium' | 'high') => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = ((clientX - rect.left) / rect.width) * 100;
      const score = clamp(Math.round(pct), 0, 100);

      if (target === 'medium') {
        const nextMed = clamp(score, 1, high - 1);
        onChange({ severityMediumMinScore: nextMed, severityHighMinScore: high });
      } else {
        const nextHigh = clamp(score, med + 1, 100);
        onChange({ severityMediumMinScore: med, severityHighMinScore: nextHigh });
      }
    },
    [high, med, onChange]
  );

  const onTrackPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const el = trackRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    const score = clamp(Math.round(pct), 0, 100);
    const distMed = Math.abs(score - med);
    const distHigh = Math.abs(score - high);
    if (distMed <= distHigh) {
      setDragging('medium');
      setFromPointer(e.clientX, 'medium');
    } else {
      setDragging('high');
      setFromPointer(e.clientX, 'high');
    }
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      setFromPointer(e.clientX, dragging);
    };
    const onUp = () => setDragging(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, setFromPointer]);

  return (
    <div className="space-y-2 select-none" dir="ltr">
      <p className="text-[10px] text-gray-500 leading-relaxed">{t('fraud_settings.severity_bar_help')}</p>
      <div
        ref={trackRef}
        className="relative h-11 w-full rounded-xl border border-gray-200 bg-gray-100/50 shadow-inner overflow-visible touch-none"
        onPointerDown={onTrackPointerDown}
        role="group"
        aria-label={t('fraud_settings.severity_bar_track_aria')}
      >
        {/* Green: scores below medium threshold → low severity */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 rounded-l-[10px] bg-gradient-to-b from-emerald-400 to-emerald-600"
          style={{ width: `${med}%` }}
        />
        {/* Yellow: medium */}
        <div
          className="pointer-events-none absolute inset-y-0 bg-gradient-to-b from-amber-300 to-amber-500"
          style={{ left: `${med}%`, width: `${high - med}%` }}
        />
        {/* Orange → red: high */}
        <div
          className="pointer-events-none absolute inset-y-0 rounded-r-[10px] bg-gradient-to-r from-orange-500 to-red-600"
          style={{ left: `${high}%`, width: `${100 - high}%` }}
        />

        {/* Medium handle */}
        <button
          type="button"
          tabIndex={0}
          aria-label={t('fraud_settings.severity_bar_handle_medium')}
          aria-valuemin={1}
          aria-valuemax={high - 1}
          aria-valuenow={med}
          className="absolute top-1/2 z-20 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border-2 border-white bg-amber-600 shadow-md ring-2 ring-amber-200/80 active:cursor-grabbing"
          style={{ left: `${med}%` }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setDragging('medium');
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
        >
          <span className="text-[9px] font-black text-white">M</span>
        </button>

        {/* High handle */}
        <button
          type="button"
          tabIndex={0}
          aria-label={t('fraud_settings.severity_bar_handle_high')}
          aria-valuemin={med + 1}
          aria-valuemax={100}
          aria-valuenow={high}
          className="absolute top-1/2 z-20 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border-2 border-white bg-red-600 shadow-md ring-2 ring-red-200/80 active:cursor-grabbing"
          style={{ left: `${high}%` }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setDragging('high');
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
        >
          <span className="text-[9px] font-black text-white">H</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-gray-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" />
          {t('fraud_settings.severity_legend_low')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-amber-400" />
          {t('fraud_settings.severity_legend_medium')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-orange-500" />
          {t('fraud_settings.severity_legend_high')}
        </span>
      </div>
      <p className="text-[10px] font-mono text-gray-700">
        {t('fraud_settings.severity_bar_values', { medium: med, high })}
      </p>
    </div>
  );
}
