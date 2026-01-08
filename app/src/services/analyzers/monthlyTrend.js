/**
 * Monthly Trend Analyzer
 * 
 * Analyzes spending trends over time by month
 */

export default {
    name: 'monthly_trend',
    label: 'Monthly Spending Trend',
    description: 'Shows spending patterns over time grouped by month',

    async run(data, options = {}) {
        const monthlyData = {};

        for (const transaction of data) {
            const date = new Date(transaction.date || transaction.processedDate);
            if (isNaN(date.getTime())) continue;

            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const amount = Math.abs(transaction.chargedAmount || transaction.amount || 0);
            const isExpense = (transaction.chargedAmount || transaction.amount) < 0;

            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = {
                    month: monthKey,
                    year: date.getFullYear(),
                    monthNum: date.getMonth() + 1,
                    spending: 0,
                    income: 0,
                    transactionCount: 0
                };
            }

            if (isExpense) {
                monthlyData[monthKey].spending += amount;
            } else {
                monthlyData[monthKey].income += amount;
            }
            monthlyData[monthKey].transactionCount += 1;
        }

        // Sort by month
        const months = Object.values(monthlyData)
            .sort((a, b) => a.month.localeCompare(b.month))
            .map(m => ({
                ...m,
                spending: Math.round(m.spending * 100) / 100,
                income: Math.round(m.income * 100) / 100,
                net: Math.round((m.income - m.spending) * 100) / 100
            }));

        // Calculate averages
        const totalSpending = months.reduce((sum, m) => sum + m.spending, 0);
        const totalIncome = months.reduce((sum, m) => sum + m.income, 0);
        const avgSpending = months.length > 0 ? totalSpending / months.length : 0;
        const avgIncome = months.length > 0 ? totalIncome / months.length : 0;

        return {
            type: 'monthly_trend',
            monthCount: months.length,
            totalSpending: Math.round(totalSpending * 100) / 100,
            totalIncome: Math.round(totalIncome * 100) / 100,
            averageMonthlySpending: Math.round(avgSpending * 100) / 100,
            averageMonthlyIncome: Math.round(avgIncome * 100) / 100,
            months
        };
    }
};
