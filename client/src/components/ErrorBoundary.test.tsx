import type React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Bomb({ shouldThrow }: { shouldThrow: boolean }): React.ReactElement {
    if (shouldThrow) {
        throw new Error('boom');
    }
    return <div>healthy</div>;
}

describe('ErrorBoundary', () => {
    beforeEach(() => {
        // The boundary logs caught errors; keep test output clean.
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('renders children when nothing throws', () => {
        render(
            <ErrorBoundary>
                <Bomb shouldThrow={false} />
            </ErrorBoundary>
        );
        expect(screen.getByText('healthy')).toBeInTheDocument();
    });

    it('shows the error screen with role=alert when a child throws', () => {
        render(
            <ErrorBoundary>
                <Bomb shouldThrow />
            </ErrorBoundary>
        );
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.queryByText('healthy')).not.toBeInTheDocument();
    });

    it('recovers when retry is clicked and the child no longer throws', () => {
        const { rerender } = render(
            <ErrorBoundary>
                <Bomb shouldThrow />
            </ErrorBoundary>
        );
        expect(screen.getByRole('alert')).toBeInTheDocument();

        // Swap the tree to a healthy child, then retry.
        rerender(
            <ErrorBoundary>
                <Bomb shouldThrow={false} />
            </ErrorBoundary>
        );
        fireEvent.click(screen.getByRole('button', { name: /ניסוי חוזר|try again/i }));
        expect(screen.getByText('healthy')).toBeInTheDocument();
    });

    it('renders a custom fallback when provided', () => {
        render(
            <ErrorBoundary fallback={<div>custom fallback</div>}>
                <Bomb shouldThrow />
            </ErrorBoundary>
        );
        expect(screen.getByText('custom fallback')).toBeInTheDocument();
    });
});
