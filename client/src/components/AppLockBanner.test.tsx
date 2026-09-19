import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppLockBanner } from './AppLockBanner';

const mockStatus = { data: { restricted: true, lockConfigured: true }, isLoading: false };

vi.mock('../hooks/useAppLock', () => ({
    useAppLockStatus: () => mockStatus,
    useUnlockApp: () => ({ mutate: vi.fn(), isPending: false, error: null }),
    useLockApp: () => ({ mutate: vi.fn(), isPending: false }),
    useSetupAppLock: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) =>
            ({
                'app_lock.locked_title': 'locked title',
                'app_lock.locked_body': 'locked body',
                'app_lock.password': 'password',
                'app_lock.unlock': 'unlock',
                'app_lock.later': 'later',
                'app_lock.snoozed_title': 'snoozed strip',
                'common.loading': 'loading',
            })[key] ?? key,
    }),
}));

describe('AppLockBanner snooze', () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    it('shows the full locked banner by default', () => {
        render(<AppLockBanner />);
        expect(screen.getByText('locked title')).toBeInTheDocument();
        expect(screen.queryByText('snoozed strip')).not.toBeInTheDocument();
    });

    it('collapses to a slim strip on "later" and persists for the session', () => {
        render(<AppLockBanner />);
        fireEvent.click(screen.getByText('later'));
        expect(screen.queryByText('locked title')).not.toBeInTheDocument();
        expect(screen.getByText('snoozed strip')).toBeInTheDocument();
        expect(sessionStorage.getItem('app-lock-banner-snoozed')).toBe('1');
    });

    it('restores the full banner from the slim strip', () => {
        sessionStorage.setItem('app-lock-banner-snoozed', '1');
        render(<AppLockBanner />);
        expect(screen.getByText('snoozed strip')).toBeInTheDocument();
        fireEvent.click(screen.getByText('unlock'));
        expect(screen.getByText('locked title')).toBeInTheDocument();
        expect(sessionStorage.getItem('app-lock-banner-snoozed')).toBeNull();
    });

    it('starts snoozed when sessionStorage is set', () => {
        sessionStorage.setItem('app-lock-banner-snoozed', '1');
        render(<AppLockBanner />);
        expect(screen.queryByText('locked title')).not.toBeInTheDocument();
    });
});
