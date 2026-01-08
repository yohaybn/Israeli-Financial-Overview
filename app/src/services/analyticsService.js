/**
 * Analytics Service - Core service with extensible analyzer framework
 * 
 * Analyzers are registered as plugins and can be run individually or in batch.
 * Each analyzer receives transaction data and returns structured insights.
 */

// Analyzer registry
const analyzers = new Map();

/**
 * Register an analyzer plugin
 * @param {string} name - Unique identifier for the analyzer
 * @param {Object} config - Analyzer configuration
 * @param {string} config.label - Display name for UI
 * @param {string} config.description - Description of what the analyzer does
 * @param {Function} config.run - Async function(data, options) => result
 */
export function registerAnalyzer(name, config) {
    if (!config.label || !config.run) {
        throw new Error(`Analyzer '${name}' must have 'label' and 'run' properties`);
    }
    analyzers.set(name, config);
    console.log(`[Analytics] Registered analyzer: ${name}`);
}

/**
 * Get list of available analyzers for UI display
 * @returns {Array<{name: string, label: string, description: string}>}
 */
export function getAvailableAnalyzers() {
    return Array.from(analyzers.entries()).map(([name, cfg]) => ({
        name,
        label: cfg.label,
        description: cfg.description || ''
    }));
}

/**
 * Run a single analyzer
 * @param {string} name - Analyzer name
 * @param {Array} data - Transaction data array
 * @param {Object} options - Optional parameters for the analyzer
 * @returns {Promise<Object>} - Analyzer result
 */
export async function runAnalyzer(name, data, options = {}) {
    const analyzer = analyzers.get(name);
    if (!analyzer) {
        throw new Error(`Analyzer '${name}' not found`);
    }

    try {
        const result = await analyzer.run(data, options);
        return {
            success: true,
            analyzer: name,
            label: analyzer.label,
            result
        };
    } catch (error) {
        return {
            success: false,
            analyzer: name,
            label: analyzer.label,
            error: error.message
        };
    }
}

/**
 * Run multiple analyzers in parallel
 * @param {Array<string>} names - Array of analyzer names to run
 * @param {Array} data - Transaction data array
 * @param {Object} options - Optional parameters
 * @returns {Promise<Array<Object>>} - Array of analyzer results
 */
export async function runAnalyzers(names, data, options = {}) {
    const results = await Promise.all(
        names.map(name => runAnalyzer(name, data, options))
    );
    return results;
}

/**
 * Run all registered analyzers
 * @param {Array} data - Transaction data array
 * @param {Object} options - Optional parameters
 * @returns {Promise<Array<Object>>} - Array of all analyzer results
 */
export async function runAllAnalyzers(data, options = {}) {
    const allNames = Array.from(analyzers.keys());
    return runAnalyzers(allNames, data, options);
}
