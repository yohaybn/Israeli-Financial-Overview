/** Tailwind `sm` (640px): below this width, dashboard section cards default to collapsed. */
export function getInitialCollapsedOnMobile(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 639px)').matches;
}
