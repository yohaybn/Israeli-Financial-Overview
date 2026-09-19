import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DangerButton, DangerZone } from './DangerZone';

describe('DangerZone', () => {
    it('renders title, description and actions inside one labelled region', () => {
        render(
            <DangerZone title="Danger" description="Irreversible things live here">
                <button>do it</button>
            </DangerZone>
        );
        expect(screen.getByText('Danger')).toBeInTheDocument();
        expect(screen.getByText('Irreversible things live here')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'do it' })).toBeInTheDocument();
    });

    it('renders without a heading row when the surrounding card already titles the section', () => {
        const { container } = render(
            <DangerZone>
                <button>do it</button>
            </DangerZone>
        );
        expect(container.querySelector('svg')).not.toBeInTheDocument();
    });
});

describe('DangerButton', () => {
    it('is disabled and shows a spinner while pending', () => {
        render(<DangerButton isPending>Delete</DangerButton>);
        const button = screen.getByRole('button', { name: 'Delete' });
        expect(button).toBeDisabled();
        expect(button.querySelector('svg.animate-spin')).toBeInTheDocument();
    });

    it('stays clickable when not pending', () => {
        const onClick = vi.fn();
        render(<DangerButton onClick={onClick}>Delete</DangerButton>);
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        expect(onClick).toHaveBeenCalledTimes(1);
    });
});
