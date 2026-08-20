import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import { useAppLockStatus, useUnlockApp } from '../hooks/useAppLock';

export function AppBlockerGate({ children }: { children: React.ReactNode }) {
    const { t } = useTranslation();
    const { data: status } = useAppLockStatus();
    const [sessionExpired, setSessionExpired] = useState(false);
    const { mutate: unlock, isPending } = useUnlockApp();
    const [password, setPassword] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        const onExpired = () => {
            setSessionExpired(true);
            setErrorMsg(t('app_lock.session_expired', 'Session expired. Please log in again.'));
        };
        window.addEventListener('app-session-expired', onExpired);
        return () => window.removeEventListener('app-session-expired', onExpired);
    }, [t]);

    useEffect(() => {
        if (status?.fullBlockerEnabled && !localStorage.getItem('app_session_token')) {
            setSessionExpired(true);
        }
    }, [status?.fullBlockerEnabled]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!password) return;
        setErrorMsg('');
        unlock(password, {
            onSuccess: () => {
                setSessionExpired(false);
                setPassword('');
            },
            onError: (err: any) => {
                if (err.response?.status === 429) {
                    setErrorMsg(err.response.data.message || t('app_lock.locked_out', 'Too many attempts.'));
                } else {
                    setErrorMsg(t('app_lock.invalid_password', 'Invalid password'));
                }
            }
        });
    };

    if (status?.fullBlockerEnabled && sessionExpired) {
        return (
            <div className="fixed inset-0 bg-slate-900 z-[9999] flex flex-col items-center justify-center p-4">
                <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
                    <div className="bg-slate-800 px-6 py-8 text-center border-b border-slate-700">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-700/50 mb-4 ring-4 ring-slate-700/30">
                            <Lock className="w-8 h-8 text-blue-400" />
                        </div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">
                            {t('app_lock.app_locked', 'App Locked')}
                        </h1>
                        <p className="text-slate-400 mt-2 text-sm">
                            {t('app_lock.enter_password_to_continue', 'Please enter your password to access the dashboard.')}
                        </p>
                    </div>
                    
                    <form onSubmit={handleSubmit} className="p-6">
                        {errorMsg && (
                            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm text-center">
                                {errorMsg}
                            </div>
                        )}
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5" htmlFor="password">
                                    {t('common.password', 'Password')}
                                </label>
                                <input
                                    id="password"
                                    type="password"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoFocus
                                    disabled={isPending}
                                />
                            </div>
                            
                            <button
                                type="submit"
                                disabled={isPending || !password}
                                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-blue-600/20"
                            >
                                {isPending ? t('common.loading', 'Loading...') : t('app_lock.unlock', 'Unlock')}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
