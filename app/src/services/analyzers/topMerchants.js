/**
 * Top Merchants Analyzer
 * 
 * Identifies the merchants/vendors with most spending
 */

export default {
    name: 'top_merchants',
    label: 'Top Merchants',
    description: 'Shows merchants where you spend the most',

    async run(data, options = {}) {
        const limit = options.limit || 10;
        const merchantData = {};

        for (const transaction of data) {
            const amount = Math.abs(transaction.chargedAmount || transaction.amount || 0);
            const merchant = transaction.description || transaction.memo || 'Unknown';

            // Only count expenses
            if ((transaction.chargedAmount || transaction.amount) > 0) {
                continue;
            }

            if (!merchantData[merchant]) {
                merchantData[merchant] = {
                    merchant,
                    total: 0,
                    count: 0,
                    category: transaction.category || 'Uncategorized'
                };
            }

            merchantData[merchant].total += amount;
            merchantData[merchant].count += 1;
        }

        // Sort by total amount
        const topByAmount = Object.values(merchantData)
            .sort((a, b) => b.total - a.total)
            .slice(0, limit)
            .map((m, index) => ({
                rank: index + 1,
                merchant: m.merchant,
                total: Math.round(m.total * 100) / 100,
                count: m.count,
                averageTransaction: Math.round((m.total / m.count) * 100) / 100,
                category: m.category
            }));

        // Sort by transaction count
        const topByCount = Object.values(merchantData)
            .sort((a, b) => b.count - a.count)
            .slice(0, limit)
            .map((m, index) => ({
                rank: index + 1,
                merchant: m.merchant,
                total: Math.round(m.total * 100) / 100,
                count: m.count,
                averageTransaction: Math.round((m.total / m.count) * 100) / 100,
                category: m.category
            }));

        const totalFromTop = topByAmount.reduce((sum, m) => sum + m.total, 0);

        return {
            type: 'top_merchants',
            limit,
            totalMerchants: Object.keys(merchantData).length,
            topMerchants: topByAmount, // Keep for backward compat
            topByAmount,
            topByCount,
            topMerchantsTotal: Math.round(totalFromTop * 100) / 100
        };
    }
};
