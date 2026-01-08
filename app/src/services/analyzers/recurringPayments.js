/**
 * Recurring Payments Analyzer (Subscription Scanner)
 * 
 * Detects fixed monthly costs by identifying transactions that:
 * - Repeat with similar amounts
 * - Occur at ~30-day intervals
 * - Have consistent merchant/description
 */

export default {
    name: 'recurring_payments',
    label: 'Subscription Scanner',
    description: 'Identifies recurring monthly subscriptions and fixed costs',

    async run(data, options = {}) {
        // Group transactions by normalized description
        const groups = {};

        for (const transaction of data) {
            const amount = Math.abs(transaction.chargedAmount || transaction.amount || 0);

            // Only analyze expenses
            if ((transaction.chargedAmount || transaction.amount) > 0) continue;

            const description = normalizeDescription(transaction.description || transaction.memo || 'Unknown');

            if (!groups[description]) {
                groups[description] = [];
            }

            groups[description].push({
                ...transaction,
                normalizedAmount: amount,
                date: new Date(transaction.date || transaction.processedDate)
            });
        }

        // Analyze each group for recurring patterns
        const subscriptions = [];

        for (const [description, transactions] of Object.entries(groups)) {
            // Need at least 3 occurrences to confirm pattern
            if (transactions.length < 3) continue;

            // Sort by date
            transactions.sort((a, b) => a.date - b.date);

            // Check if amounts are consistent (within 5% tolerance)
            const amounts = transactions.map(t => t.normalizedAmount);
            const avgAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
            const isConsistentAmount = amounts.every(a =>
                Math.abs(a - avgAmount) / avgAmount < 0.05
            );

            if (!isConsistentAmount) continue;

            // Check if intervals are monthly (25-35 days)
            const intervals = [];
            for (let i = 1; i < transactions.length; i++) {
                const days = (transactions[i].date - transactions[i - 1].date) / (1000 * 60 * 60 * 24);
                intervals.push(days);
            }

            const avgInterval = intervals.reduce((sum, d) => sum + d, 0) / intervals.length;
            const isMonthlyInterval = avgInterval >= 25 && avgInterval <= 35;

            if (!isMonthlyInterval) continue;

            // This appears to be a subscription!
            subscriptions.push({
                merchant: description,
                amount: Math.round(avgAmount * 100) / 100,
                frequency: Math.round(avgInterval),
                occurrences: transactions.length,
                firstSeen: transactions[0].date,
                lastSeen: transactions[transactions.length - 1].date,
                transactions: options.includeTransactions ? transactions : undefined
            });
        }

        // Sort by amount (highest first)
        subscriptions.sort((a, b) => b.amount - a.amount);

        const totalMonthly = subscriptions.reduce((sum, s) => sum + s.amount, 0);

        return {
            type: 'recurring_payments',
            subscriptions,
            count: subscriptions.length,
            totalMonthly: Math.round(totalMonthly * 100) / 100,
            insight: subscriptions.length > 0
                ? `You have ${subscriptions.length} recurring subscriptions totaling ${Math.round(totalMonthly)} ILS/month`
                : 'No recurring subscriptions detected'
        };
    }
};

function normalizeDescription(desc) {
    return desc
        .toLowerCase()
        .replace(/\d+/g, '') // Remove numbers
        .replace(/[^\w\s]/g, '') // Remove special chars
        .trim()
        .substring(0, 50); // Limit length
}
