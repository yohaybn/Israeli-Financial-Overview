import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfigSetupWizard } from './ConfigSetupWizard';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key === 'getting_started.step_6_body' ? 'Includes **Investments**.' : key }) }));

describe('ConfigSetupWizard', () => {
    it('starts compact and renders markdown only after details opens', () => {
        render(<ConfigSetupWizard activeTab="ai" onNavigate={() => {}} />);
        expect(screen.queryByText('Investments')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /common.details/ }));
        expect(screen.getByText('Investments').tagName).toBe('STRONG');
    });
});
