import { useState } from 'react';

/**
 * Tracks whether a banner has already been viewed (persisted in localStorage)
 * so it can render in its full form once and collapse to a slim strip on
 * later visits, while still allowing the user to re-expand it.
 */
export function useCollapsibleBanner(storageKey: string) {
    const [seenOnMount] = useState(() => {
        try {
            const seen = window.localStorage.getItem(storageKey) === '1';
            if (!seen) {
                window.localStorage.setItem(storageKey, '1');
            }
            return seen;
        } catch {
            return false;
        }
    });
    const [expanded, setExpanded] = useState(false);

    return {
        collapsed: seenOnMount && !expanded,
        expand: () => setExpanded(true),
        collapse: () => setExpanded(false),
    };
}
