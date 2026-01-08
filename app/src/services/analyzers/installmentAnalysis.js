/**
 * Installment Analysis Analyzer
 * 
 * Detects and tracks Israeli credit card installments ("Tashlumim")
 * by parsing patterns like "1/12", "1 of 12", "תשלום 1 מתוך 12"
 */

export default {
    name: 'installment_analysis',
    label: 'Installment Tracker',
    description: 'Analyzes credit card installment payments and future commitments',

    async run(data, options = {}) {
        const installments = [];
        const installmentGroups = {};

        for (const transaction of data) {
            const amount = Math.abs(transaction.chargedAmount || transaction.amount || 0);
            const memo = transaction.memo || '';
            const description = transaction.description || '';
            const text = `${description} ${memo}`;

            // Parse installment patterns
            const pattern = parseInstallmentPattern(text);

            if (pattern) {
                const key = normalizeKey(description);

                if (!installmentGroups[key]) {
                    installmentGroups[key] = {
                        description: description.substring(0, 50),
                        installments: []
                    };
                }

                installmentGroups[key].installments.push({
                    current: pattern.current,
                    total: pattern.total,
                    amount,
                    date: new Date(transaction.date || transaction.processedDate),
                    ...transaction
                });
            }
        }

        // Analyze each installment group
        const activeInstallments = [];
        let totalMonthlyBurden = 0;

        for (const [key, group] of Object.entries(installmentGroups)) {
            // Sort by date
            group.installments.sort((a, b) => a.date - b.date);

            const latest = group.installments[group.installments.length - 1];
            const remaining = latest.total - latest.current;

            if (remaining > 0) {
                const monthlyPayment = latest.amount;
                const totalRemaining = monthlyPayment * remaining;

                activeInstallments.push({
                    description: group.description,
                    monthlyPayment: Math.round(monthlyPayment * 100) / 100,
                    paymentsMade: latest.current,
                    paymentsRemaining: remaining,
                    totalPayments: latest.total,
                    totalRemaining: Math.round(totalRemaining * 100) / 100,
                    estimatedCompletion: estimateCompletion(latest.date, remaining),
                    history: options.includeTransactions ? group.installments : undefined
                });

                totalMonthlyBurden += monthlyPayment;
            }
        }

        // Sort by monthly payment (highest first)
        activeInstallments.sort((a, b) => b.monthlyPayment - a.monthlyPayment);

        // Create a timeline showing how burden decreases over time
        const timeline = createTimeline(activeInstallments);

        return {
            type: 'installment_analysis',
            activeInstallments,
            count: activeInstallments.length,
            totalMonthlyBurden: Math.round(totalMonthlyBurden * 100) / 100,
            timeline,
            insight: activeInstallments.length > 0
                ? `You are committed to ${Math.round(totalMonthlyBurden)} ILS/month across ${activeInstallments.length} installment plans`
                : 'No active installment payments detected'
        };
    }
};

function parseInstallmentPattern(text) {
    // Pattern 1: "5/12", "5 / 12"
    let match = text.match(/(\d+)\s*\/\s*(\d+)/);
    if (match) {
        return { current: parseInt(match[1]), total: parseInt(match[2]) };
    }

    // Pattern 2: "5 of 12", "5 out of 12"
    match = text.match(/(\d+)\s+(?:of|out of)\s+(\d+)/i);
    if (match) {
        return { current: parseInt(match[1]), total: parseInt(match[2]) };
    }

    // Pattern 3: Hebrew "תשלום 5 מתוך 12"
    match = text.match(/תשלום\s+(\d+)\s+מתוך\s+(\d+)/);
    if (match) {
        return { current: parseInt(match[1]), total: parseInt(match[2]) };
    }

    return null;
}

function normalizeKey(desc) {
    return desc
        .toLowerCase()
        .replace(/\d+/g, '')
        .replace(/[^\w\s]/g, '')
        .trim()
        .substring(0, 30);
}

function estimateCompletion(lastPaymentDate, remainingPayments) {
    const completion = new Date(lastPaymentDate);
    completion.setMonth(completion.getMonth() + remainingPayments);
    return completion;
}

function createTimeline(installments) {
    // Create a month-by-month projection of total burden
    const timeline = [];
    const maxMonths = Math.max(...installments.map(i => i.paymentsRemaining), 0);

    for (let month = 0; month < Math.min(maxMonths, 24); month++) {
        let burden = 0;
        for (const inst of installments) {
            if (month < inst.paymentsRemaining) {
                burden += inst.monthlyPayment;
            }
        }
        timeline.push({
            month: month + 1,
            burden: Math.round(burden * 100) / 100
        });
    }

    return timeline;
}
