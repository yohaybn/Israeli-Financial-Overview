import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function PostScrapeSettings({ isInline = true, onClose }: { isInline?: boolean; onClose?: () => void }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<any>(null);
  const [availableChannels, setAvailableChannels] = useState<string[]>([]);
  const [telegramStatus, setTelegramStatus] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/post-scrape/config')
      .then(r => r.json())
      .then((data) => {
        if (data?.success) setCfg(data.data);
      })
      .catch(() => { })
      .finally(() => setLoading(false));
    // Fetch available notification channels
    fetch('/api/notifications/channels')
      .then(r => r.json())
      .then((data) => { if (data?.success) setAvailableChannels(data.data || []); })
      .catch(() => { setAvailableChannels(['console']); });

    // Fetch telegram status to know whether to enable the telegram checkbox
    fetch('/api/telegram/status')
      .then(r => r.json())
      .then((data) => { if (data?.success) setTelegramStatus(data.data); })
      .catch(() => setTelegramStatus(null));
  }, []);

  const update = (patch: any) => setCfg({ ...cfg, ...patch });

  const handleSave = async () => {
    // simple validation
    if (cfg?.customAI?.enabled && (!cfg.customAI.query || cfg.customAI.query.trim() === '')) {
      setError(t('post_scrape.errors.custom_query_required'));
      return;
    }
    if (!Array.isArray(cfg.notificationChannels)) {
      setError(t('post_scrape.errors.invalid_notifications'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/post-scrape/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || t('common.save_failed'));
      setCfg(data.data);
      setToast(t('post_scrape.saved'));
      setTimeout(() => setToast(null), 3000);
      onClose?.();
    } catch (e) {
      // noop - simple UX
      console.error('Failed to save post-scrape config', e);
      setError(t('post_scrape.errors.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-4 text-sm text-gray-500">{t('common.loading')}</div>;
  if (!cfg) return <div className="p-4 text-sm text-red-500">{t('post_scrape.errors.unavailable')}</div>;

  return (
    <div className={`${isInline ? '' : 'bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col'} p-6`}>
      <h3 className="text-lg font-bold mb-4">{t('post_scrape.title')}</h3>

      <div className="space-y-4">
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={cfg.runCategorization} onChange={(e) => update({ runCategorization: e.target.checked })} />
          <span className="text-sm">{t('post_scrape.run_categorization')}</span>
        </label>

        <div className="p-3 border rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <input type="checkbox" checked={cfg.fraudDetection?.enabled} onChange={(e) => update({ fraudDetection: { ...cfg.fraudDetection, enabled: e.target.checked } })} />
              <span className="text-sm font-medium">{t('post_scrape.fraud_detection')}</span>
            </div>
            <label className="text-xs text-gray-500">{t('post_scrape.notify_on_issue')}</label>
          </div>
          <div className="mt-3">
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" checked={cfg.fraudDetection?.notifyOnIssue} onChange={(e) => update({ fraudDetection: { ...cfg.fraudDetection, notifyOnIssue: e.target.checked } })} />
              <span>{t('post_scrape.fraud_notify_help')}</span>
            </label>
          </div>
          <div className="mt-3 pt-3 border-t">
            <div className="text-xs text-gray-500 mb-2">{t('post_scrape.transaction_scope')}</div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="fraud_scope" checked={cfg.fraudDetection?.scope !== 'all'} onChange={() => update({ fraudDetection: { ...cfg.fraudDetection, scope: 'current' } })} />
                <span className="text-xs">{t('post_scrape.current_scrape')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="fraud_scope" checked={cfg.fraudDetection?.scope === 'all'} onChange={() => update({ fraudDetection: { ...cfg.fraudDetection, scope: 'all' } })} />
                <span className="text-xs">{t('post_scrape.all_transactions')}</span>
              </label>
            </div>
          </div>
        </div>

        <div className="p-3 border rounded-lg">
          <div className="flex items-center gap-3">
            <input type="checkbox" checked={cfg.customAI?.enabled} onChange={(e) => update({ customAI: { ...cfg.customAI, enabled: e.target.checked } })} />
          <span className="text-sm font-medium">{t('post_scrape.custom_ai')}</span>
          </div>
          <div className="mt-3 space-y-2">
            <input className="w-full p-2 border rounded-md text-sm" placeholder={t('post_scrape.custom_ai_query')} value={cfg.customAI?.query || ''} onChange={(e) => update({ customAI: { ...cfg.customAI, query: e.target.value } })} />
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" checked={cfg.customAI?.notifyOnResult} onChange={(e) => update({ customAI: { ...cfg.customAI, notifyOnResult: e.target.checked } })} />
              <span>{t('post_scrape.notify_on_result')}</span>
            </label>
          </div>
          <div className="mt-3 pt-3 border-t">
            <div className="text-xs text-gray-500 mb-2">{t('post_scrape.transaction_scope')}</div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="ai_scope" checked={cfg.customAI?.scope !== 'all'} onChange={() => update({ customAI: { ...cfg.customAI, scope: 'current' } })} />
                <span className="text-xs">{t('post_scrape.current_scrape')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="ai_scope" checked={cfg.customAI?.scope === 'all'} onChange={() => update({ customAI: { ...cfg.customAI, scope: 'all' } })} />
                <span className="text-xs">{t('post_scrape.all_transactions')}</span>
              </label>
            </div>
          </div>
        </div>

        <div className="p-3 border rounded-lg space-y-2">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={cfg.aggregateTelegramNotifications !== false}
              onChange={(e) => update({ aggregateTelegramNotifications: e.target.checked })}
            />
            <span>
              <span className="text-sm font-medium block">{t('post_scrape.telegram_aggregate')}</span>
              <span className="text-xs text-gray-500">{t('post_scrape.telegram_aggregate_desc')}</span>
            </span>
          </label>
          <p className="text-xs text-gray-500 pl-7">{t('post_scrape.whale_where')}</p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">{t('post_scrape.notification_channels')}</label>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {(() => {
              // Always include 'telegram' option visually; it will be disabled/grayed out unless active
              const channels = new Set([...(availableChannels || []), 'telegram']);
              return Array.from(channels).map((ch) => {
                const isTelegram = ch === 'telegram';
                const isActive = isTelegram ? !!telegramStatus?.isActive : (availableChannels || []).includes(ch);
                const disabled = isTelegram && !isActive;
                return (
                  <label key={ch} className={`flex items-center gap-2 p-2 border rounded-md ${disabled ? 'opacity-50' : ''}`}>
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={(cfg.notificationChannels || []).includes(ch)}
                      onChange={(e) => {
                        const current = Array.isArray(cfg.notificationChannels) ? [...cfg.notificationChannels] : [];
                        if (e.target.checked) {
                          if (!current.includes(ch)) current.push(ch);
                        } else {
                          const idx = current.indexOf(ch);
                          if (idx >= 0) current.splice(idx, 1);
                        }
                        update({ notificationChannels: current });
                      }}
                    />
                    <span className="text-sm">{ch}{disabled ? ` ${t('common.not_configured_suffix')}` : ''}</span>
                  </label>
                );
              });
            })()}
          </div>
          <p className="text-xs text-gray-400">{t('post_scrape.notification_help')}</p>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 rounded-md border">{t('common.cancel')}</button>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-md bg-indigo-600 text-white">{saving ? t('common.saving') : t('common.save')}</button>
      </div>
      {error && <div className="mt-3 text-sm text-red-600">{error}</div>}

      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur-sm text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300 z-[110]">
          <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-bold">{toast}</span>
        </div>
      )}
    </div>
  );
}

export default PostScrapeSettings;
