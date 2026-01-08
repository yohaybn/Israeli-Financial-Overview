/**
 * Spending by Category Analyzer
 * 
 * Calculates total spending breakdown by category
 */

export default {
    name: 'spending_by_category',
    label: 'Spending by Category',
    description: 'Shows breakdown of spending by category with totals and percentages',

    async run(data, options = {}) {
        const categoryTotals = {};
        let totalSpending = 0;

        for (const transaction of data) {
            // Only count expenses (negative amounts or positive chargedAmount)
            const amount = Math.abs(transaction.chargedAmount || transaction.amount || 0);
            const category = transaction.category || 'Uncategorized';

            // Skip income transactions
            if ((transaction.chargedAmount || transaction.amount) > 0 &&
                !['income', 'salary', 'transfer in'].includes(category.toLowerCase())) {
                continue;
            }

            if (!categoryTotals[category]) {
                categoryTotals[category] = {
                    total: 0,
                    count: 0,
                    transactions: []
                };
            }

            categoryTotals[category].total += amount;
            categoryTotals[category].count += 1;
            totalSpending += amount;

            if (options.includeTransactions) {
                categoryTotals[category].transactions.push(transaction);
            }
        }

        // Calculate percentages and format results
        const categories = Object.entries(categoryTotals)
            .map(([name, data]) => ({
                category: name,
                total: Math.round(data.total * 100) / 100,
                count: data.count,
                percentage: totalSpending > 0
                    ? Math.round((data.total / totalSpending) * 10000) / 100
                    : 0,
                ...(options.includeTransactions && { transactions: data.transactions })
            }))
            .sort((a, b) => b.total - a.total);

        return {
            type: 'category_breakdown',
            totalSpending: Math.round(totalSpending * 100) / 100,
            categoryCount: categories.length,
            categories
        };
    }
};
