/**
 * Income vs Expense Analyzer
 * 
 * Provides a summary of income versus expenses
 */

export default {
    name: 'income_vs_expense',
    label: 'Income vs Expense',
    description: 'Summary comparing total income to total expenses',

    async run(data, options = {}) {
        let totalIncome = 0;
        let totalExpense = 0;
        const accountTotals = {};

        for (const transaction of data) {
            const amount = transaction.chargedAmount || transaction.amount || 0;
            const account = transaction.accountNumber || transaction.account || 'Unknown Account';

            // Initialize account bucket
            if (!accountTotals[account]) {
                accountTotals[account] = { income: 0, expense: 0, total: 0 };
            }

            if (amount > 0) {
                totalIncome += amount;
                accountTotals[account].income += amount;
            } else {
                totalExpense += Math.abs(amount);
                accountTotals[account].expense += Math.abs(amount);
            }
            accountTotals[account].total += amount;
        }

        const netBalance = totalIncome - totalExpense;
        const savingsRate = totalIncome > 0
            ? Math.round((netBalance / totalIncome) * 10000) / 100
            : 0;

        return {
            type: 'income_vs_expense',
            income: {
                total: Math.round(totalIncome * 100) / 100,
                count: incomeCount,
                average: incomeCount > 0 ? Math.round((totalIncome / incomeCount) * 100) / 100 : 0,
                ...(options.includeTransactions && { transactions: incomeTransactions })
            },
            expense: {
                total: Math.round(totalExpense * 100) / 100,
                count: expenseCount,
                average: expenseCount > 0 ? Math.round((totalExpense / expenseCount) * 100) / 100 : 0,
                ...(options.includeTransactions && { transactions: expenseTransactions })
            },
            netBalance: Math.round(netBalance * 100) / 100,
            savingsRate,
            status: netBalance >= 0 ? 'positive' : 'negative'
        };
    }
};
