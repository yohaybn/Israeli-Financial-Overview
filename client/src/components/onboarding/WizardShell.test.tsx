import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WizardShell, wizardProgressLabel } from './WizardShell';

describe('WizardShell', () => {
    it('clamps and formats progress', () => {
        expect(wizardProgressLabel(-1, 4)).toBe('1 / 4');
        expect(wizardProgressLabel(9, 4)).toBe('4 / 4');
    });

    it('renders the shared accessible modal shell', () => {
        const close = vi.fn();
        render(
            <WizardShell titleId="wizard-title" badge="Setup" stepIndex={1} stepCount={4} onClose={close}
                closeLabel="Close" icon={<span>icon</span>} title="Connect" body="Body" footer={<button>Next</button>} />
        );
        expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby', 'wizard-title');
        expect(screen.getByText('2 / 4')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(close).toHaveBeenCalledOnce();
    });
});
