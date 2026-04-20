/**
 * Redacts sensitive keys in an object recursively.
 */
export function maskSensitiveData(data: any): any {
    if (!data || typeof data !== 'object') {
        return data;
    }

    if (Array.isArray(data)) {
        return data.map(maskSensitiveData);
    }

    const sensitiveKeys = [
        'password',
        'credentials',
        'apiKey',
        'key',
        'secret',
        'token',
        'auth',
        'ENCRYPTION_KEY',
        'GEMINI_API_KEY',
        'api_key'
    ];

    const masked: any = {};
    for (const [key, value] of Object.entries(data)) {
        const lower = key.toLowerCase();
        const isOtpField = lower === 'otpcode' || lower.includes('otp') || lower.includes('twofactor');
        if (
            isOtpField ||
            sensitiveKeys.some((sk) => lower.includes(sk.toLowerCase()))
        ) {
            masked[key] = '[REDACTED]';
        } else if (typeof value === 'object') {
            masked[key] = maskSensitiveData(value);
        } else {
            masked[key] = value;
        }
    }

    return masked;
}
