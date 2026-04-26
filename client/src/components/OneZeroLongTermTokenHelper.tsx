import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOneZeroOtpTrigger, useOneZeroOtpComplete } from '../hooks/useScraper';

export interface OneZeroLongTermTokenHelperProps {
    phoneNumber: string;
    /** When set, SMS + verify are bound to this profile; token is stored on the server and not returned. */
    profileId?: string;
    onTokenGenerated: (token: string) => void;
    /** Called when the server saved the token for {@link profileId} (no token in memory). */
    onTokenSavedToProfile?: () => void;
    /** App lock or form-disabled */
    disabled?: boolean;
}

export function OneZeroLongTermTokenHelper({
    phoneNumber,
    profileId,
    onTokenGenerated,
    onTokenSavedToProfile,
    disabled,
}: OneZeroLongTermTokenHelperProps) {
    const { t } = useTranslation();
    const { mutateAsync: triggerOtp, isPending: isTriggering } = useOneZeroOtpTrigger();
    const { mutateAsync: completeOtp, isPending: isCompleting } = useOneZeroOtpComplete();

    const [sessionId, setSessionId] = useState<string | null>(null);
    const [otpCode, setOtpCode] = useState('');
    const [localError, setLocalError] = useState<string | null>(null);
    const [successFlash, setSuccessFlash] = useState(false);

    const phoneOk = phoneNumber.trim().startsWith('+');
    const busy = isTriggering || isCompleting;
    const showOtpBlock =
        !disabled && (Boolean(sessionId) || Boolean(profileId)) && (Boolean(sessionId) || (Boolean(profileId) && phoneOk));

    const handleSendSms = async () => {
        setLocalError(null);
        setSuccessFlash(false);
        try {
            const sid = await triggerOtp(
                profileId
                    ? { phoneNumber: phoneNumber.trim(), profileId }
                    : phoneNumber.trim()
            );
            setSessionId(sid);
            setOtpCode('');
        } catch (e: unknown) {
            setSessionId(null);
            setLocalError(e instanceof Error ? e.message : String(e));
        }
    };

    const handleVerify = async () => {
        const sid = sessionId?.trim();
        if (!otpCode.trim()) return;
        if (!sid && !profileId) return;
        setLocalError(null);
        setSuccessFlash(false);
        try {
            const result = await completeOtp({
                sessionId: sid || undefined,
                otpCode: otpCode.trim(),
                profileId,
            });
            if (result.savedToProfile) {
                onTokenSavedToProfile?.();
                setSessionId(null);
                setOtpCode('');
                setSuccessFlash(true);
            } else {
                onTokenGenerated(result.otpLongTermToken);
                setSessionId(null);
                setOtpCode('');
                setSuccessFlash(true);
            }
        } catch (e: unknown) {
            setLocalError(e instanceof Error ? e.message : String(e));
        }
    };

    return (
        <div className="sm:col-span-2 rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 space-y-3">
            <div>
                <p className="text-sm font-medium text-gray-800">{t('onezero.otp.section_title')}</p>
                <p className="text-xs text-gray-600 mt-0.5">{t('onezero.otp.section_hint')}</p>
            </div>

            {disabled && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
                    {t('onezero.otp.locked')}
                </p>
            )}

            {!phoneOk && !disabled && (
                <p className="text-xs text-gray-600">{t('onezero.otp.phone_hint')}</p>
            )}

            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
                <button
                    type="button"
                    onClick={handleSendSms}
                    disabled={disabled || busy || !phoneOk}
                    className="px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                    {isTriggering ? t('common.loading') : t('onezero.otp.send_sms')}
                </button>
            </div>

            {showOtpBlock && (
                <div className="space-y-2">
                    <label className="block text-xs font-medium text-gray-700">{t('onezero.otp.otp_label')}</label>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value)}
                            disabled={busy}
                            className="flex-1 rounded-md border border-gray-300 shadow-sm text-sm p-2"
                        />
                        <button
                            type="button"
                            onClick={handleVerify}
                            disabled={busy || !otpCode.trim()}
                            className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-300"
                        >
                            {isCompleting ? t('common.loading') : t('onezero.otp.verify')}
                        </button>
                    </div>
                </div>
            )}

            {!sessionId && phoneOk && !disabled && !profileId && (
                <p className="text-xs text-gray-500">{t('onezero.otp.idle_hint')}</p>
            )}

            {localError && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1.5">{localError}</p>
            )}
            {successFlash && (
                <p className="text-xs text-emerald-800 bg-emerald-100/80 border border-emerald-200 rounded px-2 py-1.5">
                    {t('onezero.otp.token_filled')}
                </p>
            )}
        </div>
    );
}
