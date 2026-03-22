import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppLockStatus, useUnlockApp, useLockApp, useSetupAppLock } from '../hooks/useAppLock';
import { AlertTriangle, Lock, ShieldCheck } from 'lucide-react';

export function AppLockBanner() {
    const { t } = useTranslation();
    const { data: status, isLoading } = useAppLockStatus();
    const { mutate: unlock, isPending: isUnlocking, error: unlockError } = useUnlockApp();
    const { mutate: lockApp, isPending: isLocking } = useLockApp();
    const { mutate: setupLock, isPending: isSettingUp, error: setupError } = useSetupAppLock();
    const [password, setPassword] = useState('');
    const [setupPassword, setSetupPassword] = useState('');
    const [setupConfirm, setSetupConfirm] = useState('');
    const [showSetup, setShowSetup] = useState(false);

    if (isLoading || !status) {
        return null;
    }

    const restricted = status.restricted;
    const lockConfigured = status.lockConfigured;

    const handleUnlock = (e: React.FormEvent) => {
        e.preventDefault();
        if (!password.trim()) return;
        unlock(password, {
            onSuccess: () => setPassword('')
        });
    };

    const handleSetup = (e: React.FormEvent) => {
        e.preventDefault();
        if (setupPassword.length < 8) return;
        if (setupPassword !== setupConfirm) return;
        setupLock(setupPassword, {
            onSuccess: () => {
                setSetupPassword('');
                setSetupConfirm('');
                setShowSetup(false);
            }
        });
    };

    return (
        <div className="shrink-0 border-b border-amber-200/80">
            {restricted && (
                <div
                    role="alert"
                    className="bg-gradient-to-r from-amber-500 via-amber-500 to-orange-500 text-white px-4 py-4 shadow-lg"
                >
                    <div className="container mx-auto max-w-[1600px] flex flex-col lg:flex-row lg:items-center gap-4">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                            <AlertTriangle className="w-10 h-10 shrink-0 mt-0.5 drop-shadow" strokeWidth={2.5} />
                            <div>
                                <p className="text-xl font-black tracking-tight leading-tight drop-shadow-sm">
                                    {t('app_lock.locked_title')}
                                </p>
                                <p className="text-sm font-semibold text-amber-50 mt-1 max-w-3xl">
                                    {t('app_lock.locked_body')}
                                </p>
                            </div>
                        </div>
                        <form onSubmit={handleUnlock} className="flex flex-wrap items-end gap-2 shrink-0">
                            <div>
                                <label className="sr-only" htmlFor="app-unlock-password">
                                    {t('app_lock.password')}
                                </label>
                                <input
                                    id="app-unlock-password"
                                    type="password"
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder={t('app_lock.password')}
                                    className="px-3 py-2.5 rounded-lg border-2 border-white/30 bg-white/15 text-white placeholder:text-amber-100/90 focus:outline-none focus:ring-2 focus:ring-white min-w-[200px]"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isUnlocking || !password.trim()}
                                className="px-6 py-2.5 rounded-lg bg-white text-amber-700 font-black text-sm shadow-md hover:bg-amber-50 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {isUnlocking ? t('common.loading') : t('app_lock.unlock')}
                            </button>
                            {unlockError && (
                                <span className="text-xs font-bold text-amber-100 w-full sm:w-auto">
                                    {(unlockError as any)?.response?.data?.error || t('app_lock.unlock_failed')}
                                </span>
                            )}
                        </form>
                    </div>
                </div>
            )}

            {!restricted && lockConfigured && (
                <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-2">
                    <div className="container mx-auto max-w-[1600px] flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-emerald-900 text-sm font-bold">
                            <ShieldCheck className="w-5 h-5" />
                            {t('app_lock.unlocked_hint')}
                        </div>
                        <button
                            type="button"
                            onClick={() => lockApp()}
                            disabled={isLocking}
                            className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wide px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                        >
                            <Lock className="w-3.5 h-3.5" />
                            {isLocking ? t('common.loading') : t('app_lock.lock_now')}
                        </button>
                    </div>
                </div>
            )}

            {!lockConfigured && (
                <div className="bg-slate-100 border-b border-slate-200 px-4 py-2">
                    <div className="container mx-auto max-w-[1600px] flex flex-wrap items-center gap-3">
                        <p className="text-xs text-slate-600 flex-1">{t('app_lock.not_configured_hint')}</p>
                        <button
                            type="button"
                            onClick={() => setShowSetup((s) => !s)}
                            className="text-xs font-bold text-blue-700 hover:underline"
                        >
                            {showSetup ? t('common.cancel') : t('app_lock.enable_lock')}
                        </button>
                    </div>
                    {showSetup && (
                        <form
                            onSubmit={handleSetup}
                            className="container mx-auto max-w-[1600px] pt-3 pb-2 flex flex-wrap gap-2 items-end"
                        >
                            <input
                                type="password"
                                value={setupPassword}
                                onChange={(e) => setSetupPassword(e.target.value)}
                                placeholder={t('app_lock.new_password')}
                                className="px-3 py-2 rounded-lg border border-slate-300 text-sm min-w-[180px]"
                                minLength={8}
                            />
                            <input
                                type="password"
                                value={setupConfirm}
                                onChange={(e) => setSetupConfirm(e.target.value)}
                                placeholder={t('app_lock.confirm_password')}
                                className="px-3 py-2 rounded-lg border border-slate-300 text-sm min-w-[180px]"
                                minLength={8}
                            />
                            <button
                                type="submit"
                                disabled={
                                    isSettingUp || setupPassword.length < 8 || setupPassword !== setupConfirm
                                }
                                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold disabled:opacity-50"
                            >
                                {isSettingUp ? t('common.loading') : t('app_lock.save_password')}
                            </button>
                            {setupError && (
                                <span className="text-xs text-red-600 w-full">
                                    {(setupError as any)?.response?.data?.error}
                                </span>
                            )}
                        </form>
                    )}
                </div>
            )}
        </div>
    );
}
