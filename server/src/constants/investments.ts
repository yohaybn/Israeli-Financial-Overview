/** Single-workspace default until multi-user auth is wired to investments. */
export const DEFAULT_INVESTMENT_USER_ID = 'local';

/** All portfolio totals and history snapshots are stored in ILS. */
export const PORTFOLIO_DISPLAY_CURRENCY = 'ILS' as const;

export const ALLOWED_INVESTMENT_CURRENCIES = ['USD', 'ILS'] as const;
export type InvestmentCurrency = (typeof ALLOWED_INVESTMENT_CURRENCIES)[number];
