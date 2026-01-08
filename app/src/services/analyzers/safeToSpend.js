/**
 * Safe to Spend Analyzer (Cash Flow Forecasting)
 * 
 * Calculates how much money is truly "free" after accounting for:
 * - Current balance
 * - Recurring monthly expenses
 * - Upcoming committed payments
 */

export default {
    name: 'safe_to_spend',
    label: 'Safe to Spend',
    description: 'Shows available cash after accounting for committed expenses',

    async run(data, options = {}) {
        // Calculate current balance (sum of all transactions)
        let currentBalance = 0;
        let totalIncome = 0;
        let totalExpenses = 0;

        for (const transaction of data) {
            const amount = transaction.chargedAmount || transaction.amount || 0;
            currentBalance += amount;

            if (amount > 0) {
                totalIncome += amount;
            } else {
                totalExpenses += Math.abs(amount);
            }
        }

        // Estimate monthly recurring expenses
        // We'll use a simple heuristic: look for transactions that appear multiple times
        const monthlyExpenses = estimateMonthlyCommitments(data);

        // Calculate safe balance
        const safeBalance = currentBalance - monthlyExpenses;
        const committedPercentage = currentBalance > 0
            ? Math.round((monthlyExpenses / currentBalance) * 100)
            : 0;

        return {
            type: 'safe_to_spend',
            currentBalance: Math.round(currentBalance * 100) / 100,
            monthlyCommitments: Math.round(monthlyExpenses * 100) / 100,
            safeBalance: Math.round(safeBalance * 100) / 100,
            committedPercentage,
            totalIncome: Math.round(totalIncome * 100) / 100,
            totalExpenses: Math.round(totalExpenses * 100) / 100,
            insight: safeBalance > 0
                ? `After upcoming commitments, you have ${Math.round(safeBalance)} ILS available to spend`
                : `Warning: Your commitments exceed your current balance by ${Math.round(Math.abs(safeBalance))} ILS`
        };
    }
};

function estimateMonthlyCommitments(data) {
    // Group by description and find recurring patterns
    const groups = {};

    for (const transaction of data) {
        // Only expenses
        const amount = transaction.chargedAmount || transaction.amount || 0;
        if (amount > 0) continue;

        const desc = (transaction.description || transaction.memo || '').toLowerCase().substring(0, 30);
        if (!groups[desc]) {
            groups[desc] = [];
        }
        groups[desc].push(Math.abs(amount));
    }

    // Sum up expenses that appear 2+ times (likely recurring)
    let monthlyTotal = 0;
    for (const amounts of Object.values(groups)) {
        if (amounts.length >= 2) {
            const avg = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
            monthlyTotal += avg;
        }
    }

    return monthlyTotal;
}
