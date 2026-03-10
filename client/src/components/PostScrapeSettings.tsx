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
      setError(t('post_scrape.errors.custom_query_required', 'Custom AI query is required when enabled'));
      return;
    }
    if (!Array.isArray(cfg.notificationChannels)) {
      setError(t('post_scrape.errors.invalid_notifications', 'Select at least one notification channel'));
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
      if (!data?.success) throw new Error(data?.error || 'Save failed');
      setCfg(data.data);
      setToast(t('post_scrape.saved', 'Post-scrape settings saved'));
      setTimeout(() => setToast(null), 3000);
      onClose?.();
    } catch (e) {
      // noop - simple UX
      console.error('Failed to save post-scrape config', e);
      setError(t('post_scrape.errors.save_failed', 'Failed to save settings'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-4 text-sm text-gray-500">Loading...</div>;
  if (!cfg) return <div className="p-4 text-sm text-red-500">Unable to load configuration</div>;

  return (
    <div className={`${isInline ? '' : 'bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col'} p-6`}>
      <h3 className="text-lg font-bold mb-4">{t('post_scrape.title', 'Post-scrape actions')}</h3>

      <div className="space-y-4">
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={cfg.runCategorization} onChange={(e) => update({ runCategorization: e.target.checked })} />
          <span className="text-sm">{t('post_scrape.run_categorization', 'Run AI categorization after every scrape')}</span>
        </label>

        <div className="p-3 border rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <input type="checkbox" checked={cfg.fraudDetection?.enabled} onChange={(e) => update({ fraudDetection: { ...cfg.fraudDetection, enabled: e.target.checked } })} />
              <span className="text-sm font-medium">{t('post_scrape.fraud_detection', 'Fraud / anomaly detection')}</span>
            </div>
            <label className="text-xs text-gray-500">{t('post_scrape.notify_on_issue', 'Notify on issue')}</label>
          </div>
          <div className="mt-3">
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" checked={cfg.fraudDetection?.notifyOnIssue} onChange={(e) => update({ fraudDetection: { ...cfg.fraudDetection, notifyOnIssue: e.target.checked } })} />
              <span>{t('post_scrape.fraud_notify_help', 'Send notification when potential fraud is detected')}</span>
            </label>
          </div>
        </div>

        <div className="p-3 border rounded-lg">
          <div className="flex items-center gap-3">
            <input type="checkbox" checked={cfg.customAI?.enabled} onChange={(e) => update({ customAI: { ...cfg.customAI, enabled: e.target.checked } })} />
            <span className="text-sm font-medium">{t('post_scrape.custom_ai', 'Custom AI query')}</span>
          </div>
          <div className="mt-3 space-y-2">
            <input className="w-full p-2 border rounded-md text-sm" placeholder={t('post_scrape.custom_ai_query', 'Enter a custom query')} value={cfg.customAI?.query || ''} onChange={(e) => update({ customAI: { ...cfg.customAI, query: e.target.value } })} />
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" checked={cfg.customAI?.notifyOnResult} onChange={(e) => update({ customAI: { ...cfg.customAI, notifyOnResult: e.target.checked } })} />
              <span>{t('post_scrape.notify_on_result', 'Notify when custom AI returns a result')}</span>
            </label>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">{t('post_scrape.notification_channels', 'Notification channels')}</label>
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
                    <span className="text-sm">{ch}{disabled ? ' (not configured)' : ''}</span>
                  </label>
                );
              });
            })()}
          </div>
          <p className="text-xs text-gray-400">{t('post_scrape.notification_help', 'Select one or more channels (e.g. telegram, console)')}</p>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 rounded-md border">{t('common.cancel', 'Cancel')}</button>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-md bg-indigo-600 text-white">{saving ? t('common.saving', 'Saving...') : t('common.save', 'Save')}</button>
      </div>
      {error && <div className="mt-3 text-sm text-red-600">{error}</div>}

      {toast && (
        <div className="fixed right-6 bottom-6 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg">{toast}</div>
      )}
    </div>
  );
}

export default PostScrapeSettings;
