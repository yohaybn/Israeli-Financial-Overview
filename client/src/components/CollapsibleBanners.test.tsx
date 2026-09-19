import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DemoBanner, DEMO_BANNER_STORAGE_KEY } from './DemoBanner';
import { AppLockBanner } from './AppLockBanner';

const mockStatus = { data: { restricted: false, lockConfigured: false }, isLoading: false };

vi.mock('../hooks/useAppLock', () => ({
    useAppLockStatus: () => mockStatus,
    useUnlockApp: () => ({ mutate: vi.fn(), isPending: false, error: null }),
    useLockApp: () => ({ mutate: vi.fn(), isPending: false }),
    useSetupAppLock: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

describe('DemoBanner', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('shows the full banner on first view and a slim strip on later visits', () => {
        const first = render(<DemoBanner />);
        expect(screen.getByText('common.demo_banner')).toBeInTheDocument();
        first.unmount();

        render(<DemoBanner />);
        expect(screen.queryByText('common.demo_banner')).not.toBeInTheDocument();
        expect(screen.getByText('common.demo_banner_short')).toBeInTheDocument();
    });

    it('lets the user re-expand the slim strip and collapse it again', () => {
        window.localStorage.setItem(DEMO_BANNER_STORAGE_KEY, '1');
        render(<DemoBanner />);

        fireEvent.click(screen.getByLabelText('common.expand_section'));
        expect(screen.getByText('common.demo_banner')).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('common.collapse_section'));
        expect(screen.getByText('common.demo_banner_short')).toBeInTheDocument();
    });
});

describe('AppLockBanner setup hint', () => {
    beforeEach(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
    });

    it('shows the full setup hint on first view and a slim strip on later visits', () => {
        const first = render(<AppLockBanner />);
        expect(screen.getByText('app_lock.not_configured_hint')).toBeInTheDocument();
        first.unmount();

        render(<AppLockBanner />);
        expect(screen.queryByText('app_lock.not_configured_hint')).not.toBeInTheDocument();
        expect(screen.getByText('app_lock.not_configured_hint_short')).toBeInTheDocument();
    });

    it('expands back to the full hint with the set-password action', () => {
        window.localStorage.setItem('app-lock-setup-hint-seen', '1');
        render(<AppLockBanner />);

        fireEvent.click(screen.getByLabelText('common.expand_section'));
        expect(screen.getByText('app_lock.not_configured_hint')).toBeInTheDocument();
        expect(screen.getByText('app_lock.enable_lock')).toBeInTheDocument();
    });
});
