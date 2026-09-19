import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

function Dialog({ onClose, label = 'Test dialog' }: { onClose?: () => void; label?: string }) {
    return (
        <Modal onClose={onClose} label={label} overlayClassName="bg-black/40">
            <h2 id="inner-heading">Heading</h2>
            <button>first</button>
            <button>second</button>
            <button>third</button>
        </Modal>
    );
}

describe('Modal', () => {
    it('renders a labelled dialog with aria-modal', () => {
        render(<Modal labelledBy="the-title" overlayClassName="x"><h2 id="the-title">My title</h2><button>ok</button></Modal>);
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(dialog).toHaveAttribute('aria-labelledby', 'the-title');
    });

    it('closes on Escape', () => {
        const onClose = vi.fn();
        render(<Dialog onClose={onClose} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not close on Escape when onClose is omitted (blocking dialog)', () => {
        render(<Dialog />);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('moves focus into the dialog on mount and traps Tab', () => {
        render(<Dialog onClose={() => {}} />);
        const dialog = screen.getByRole('dialog');
        const buttons = screen.getAllByRole('button');
        expect(buttons[0]).toHaveFocus();
        buttons[2].focus();
        fireEvent.keyDown(document, { key: 'Tab' });
        expect(buttons[0]).toHaveFocus();
        buttons[0].focus();
        fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
        expect(buttons[2]).toHaveFocus();
        (document.body as HTMLElement).focus();
        fireEvent.keyDown(document, { key: 'Tab' });
        expect(dialog.contains(document.activeElement)).toBe(true);
    });

    it('restores focus to the previously focused element on unmount', () => {
        function Host() {
            const [open, setOpen] = useState(false);
            return (
                <>
                    <button onClick={() => setOpen(true)}>trigger</button>
                    {open && <Dialog onClose={() => setOpen(false)} />}
                </>
            );
        }
        render(<Host />);
        const trigger = screen.getByText('trigger');
        trigger.focus();
        fireEvent.click(trigger);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
        expect(document.body.style.overflow).toBe('');
    });

    it('locks body scroll while open', () => {
        render(<Dialog onClose={() => {}} />);
        expect(document.body.style.overflow).toBe('hidden');
    });

    it('closes on backdrop click but not on panel click', () => {
        const onClose = vi.fn();
        const { container } = render(<Dialog onClose={onClose} />);
        fireEvent.click(screen.getByRole('dialog'));
        expect(onClose).not.toHaveBeenCalled();
        const overlay = container.firstElementChild as HTMLElement;
        fireEvent.click(overlay);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('only the topmost dialog reacts to Escape', () => {
        const outer = vi.fn();
        const inner = vi.fn();
        render(
            <Modal onClose={outer} label="outer">
                <button>outer btn</button>
                <Modal onClose={inner} label="inner">
                    <button>inner btn</button>
                </Modal>
            </Modal>,
        );
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(inner).toHaveBeenCalledTimes(1);
        expect(outer).not.toHaveBeenCalled();
    });
});
