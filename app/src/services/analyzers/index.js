/**
 * Analyzers Index
 * 
 * Auto-registers all analyzer modules with the analytics service
 */

import { registerAnalyzer } from '../analyticsService.js';

// Import all analyzers
import spendingByCategory from './spendingByCategory.js';
import monthlyTrend from './monthlyTrend.js';
import topMerchants from './topMerchants.js';
import incomeVsExpense from './incomeVsExpense.js';
import recurringPayments from './recurringPayments.js';
import safeToSpend from './safeToSpend.js';
import installmentAnalysis from './installmentAnalysis.js';

// Register all analyzers
const analyzers = [
    spendingByCategory,
    monthlyTrend,
    topMerchants,
    incomeVsExpense,
    recurringPayments,
    safeToSpend,
    installmentAnalysis
];

export function initializeAnalyzers() {
    for (const analyzer of analyzers) {
        registerAnalyzer(analyzer.name, analyzer);
    }
    console.log(`[Analytics] Initialized ${analyzers.length} analyzers`);
}

export default analyzers;
