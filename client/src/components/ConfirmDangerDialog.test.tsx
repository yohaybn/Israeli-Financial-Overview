import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDangerDialog } from './ConfirmDangerDialog';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

const baseProps = {
    open: true,
    title: 'Reset to Defaults',
    description: 'This permanently deletes all data.',
    confirmLabel: 'Reset everything',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
};

describe('ConfirmDangerDialog', () => {
    it('renders nothing when closed', () => {
        render(<ConfirmDangerDialog {...baseProps} open={false} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('states the consequence and names the action on the confirm button', () => {
        render(<ConfirmDangerDialog {...baseProps} />);
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveTextContent('Reset to Defaults');
        expect(dialog).toHaveTextContent('This permanently deletes all data.');
        expect(screen.getByRole('button', { name: 'Reset everything' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'common.cancel' })).toBeInTheDocument();
    });

    it('focuses Cancel first so keyboard activation never fires the destructive path by accident', () => {
        render(<ConfirmDangerDialog {...baseProps} />);
        expect(screen.getByRole('button', { name: 'common.cancel' })).toHaveFocus();
    });

    it('calls onConfirm from the confirm button and onCancel from cancel', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        render(<ConfirmDangerDialog {...baseProps} onConfirm={onConfirm} onCancel={onCancel} />);
        fireEvent.click(screen.getByRole('button', { name: 'Reset everything' }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('closes via Escape through the underlying modal', () => {
        const onCancel = vi.fn();
        render(<ConfirmDangerDialog {...baseProps} onCancel={onCancel} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('blocks buttons and Escape while the action is pending', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        render(<ConfirmDangerDialog {...baseProps} isPending onConfirm={onConfirm} onCancel={onCancel} />);
        expect(screen.getByRole('button', { name: 'common.loading' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'common.cancel' })).toBeDisabled();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onCancel).not.toHaveBeenCalled();
        expect(onConfirm).not.toHaveBeenCalled();
    });
});
