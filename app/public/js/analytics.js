import {
    getAnalyzers,
    getAnalyticsSources,
    getLocalFiles,
    loadAnalyticsData,
    runAnalysis,
    queryAI,
    getSettings
} from './api.js';
import * as ui from './ui.js';
let currentData = null;
let currentSource = null; // Keeps track of primary source metadata (optional)
let activeSources = []; // List of sources to load
let availableAnalyzers = [];
let customUploadFiles = []; // Staging for custom files

export async function initAnalytics() {
    console.log('Initializing Analytics...');

    // Init Modal
    initTransactionModal();

    // Load Models
    await loadAnalyticsModels();

    // Load initial data
    await loadAnalyzers();
    await loadSources();

    // Event Listeners
    // Event Listeners
    document.getElementById('analytics-source-select').addEventListener('change', handleSourceChange);
    document.getElementById('load-data-btn').addEventListener('click', handleLoadData);

    // Inject "Add Source" button and "Active Sources" list if not present
    const paramsContainer = document.getElementById('source-params');
    if (paramsContainer && !document.getElementById('add-source-btn')) {
        const btnContainer = document.createElement('div');
        btnContainer.style.marginTop = '10px';
        btnContainer.innerHTML = `
            <button id="add-source-btn" class="secondary-btn" style="margin-right: 10px;">+ Add to List</button>
            <div id="active-sources-list" style="margin-top: 15px; border-top: 1px solid #eee; padding-top: 10px;"></div>
         `;
        paramsContainer.parentNode.insertBefore(btnContainer, paramsContainer.nextSibling);

        document.getElementById('add-source-btn').addEventListener('click', addCurrentSource);
    }
    document.getElementById('run-analysis-btn').addEventListener('click', handleRunAnalysis);
    document.getElementById('ask-ai-btn').addEventListener('click', handleAskAI);

    // AI Input enter key
    document.getElementById('ai-question').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAskAI();
    });
}

async function loadAnalyticsModels() {
    try {
        const response = await fetch('/config/models');
        const models = await response.json();
        const select = document.getElementById('analytics-ai-model');
        if (select) {
            select.innerHTML = ''; // Clear existing options
            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.value;
                option.textContent = model.label;
                select.appendChild(option);
            });
        }
    } catch (e) {
        console.error('Failed to load models for analytics', e);
    }
}



async function handleAskAI() {
    if (!currentSource) {
        alert('Please load data first');
        return;
    }

    const questionInput = document.getElementById('ai-question');
    const question = questionInput.value.trim();
    if (!question) return;

    const modelSelect = document.getElementById('analytics-ai-model');
    const selectedModel = modelSelect ? modelSelect.value : null;

    const chatContainer = document.getElementById('ai-chat-output');

    // Append User Message
    appendChatMessage('user', question);
    questionInput.value = '';

    // Show typing
    const typingId = appendTypingIndicator();

    try {
        const requestData = currentSource.type === 'memory' ? currentSource.options.data : null;

        const options = { ...currentSource.options };
        if (selectedModel) {
            options.model = selectedModel;
        }

        const res = await queryAI(question, currentSource.type, options, requestData);

        removeTypingIndicator(typingId);

        if (res.success) {
            appendChatMessage('ai', res.answer);
        } else {
            appendChatMessage('error', `Error: ${res.error}`);
        }
    } catch (e) {
        removeTypingIndicator(typingId);
        appendChatMessage('error', `Request failed: ${e.message}`);
    }
}

async function loadAnalyzers() {
    try {
        const res = await getAnalyzers();
        if (res.success) {
            availableAnalyzers = res.analyzers;
            renderAnalyzerOptions(res.analyzers);
        }
    } catch (e) {
        console.error('Failed to load analyzers', e);
    }
}

/**
 * Render Analyzer Options with Drag and Drop
 */
function renderAnalyzerOptions(analyzers) {
    const container = document.getElementById('analyzer-options');

    // Load saved order
    let savedOrder;
    try {
        savedOrder = JSON.parse(localStorage.getItem('analyzer-order') || '[]');
    } catch (e) { savedOrder = []; }

    // Sort analyzers based on saved order
    if (savedOrder.length > 0) {
        analyzers.sort((a, b) => {
            const idxA = savedOrder.indexOf(a.name);
            const idxB = savedOrder.indexOf(b.name);
            if (idxA === -1 && idxB === -1) return 0;
            if (idxA === -1) return 1;
            if (idxB === -1) return -1;
            return idxA - idxB;
        });
    }

    container.innerHTML = analyzers.map((a, index) => `
        <div class="analyzer-option" draggable="true" data-name="${a.name}" id="analyzer-box-${a.name}">
            <div class="drag-handle" style="cursor: grab; margin-right: 10px; color: #cbd5e1;">⋮⋮</div>
            <input type="checkbox" id="analyzer-${a.name}" value="${a.name}" checked>
            <label for="analyzer-${a.name}" title="${a.description}" style="user-select: none; cursor: pointer; flex: 1;">
                <strong>${a.label}</strong>
                <br>
                <small>${a.description}</small>
            </label>
        </div>
    `).join('');

    // Add drag and drop listeners
    const draggables = container.querySelectorAll('.analyzer-option');
    draggables.forEach(draggable => {
        draggable.addEventListener('dragstart', () => {
            draggable.classList.add('dragging');
        });

        draggable.addEventListener('dragend', () => {
            draggable.classList.remove('dragging');

            // Save new order
            const newOrder = Array.from(container.querySelectorAll('.analyzer-option'))
                .map(el => el.getAttribute('data-name'));
            localStorage.setItem('analyzer-order', JSON.stringify(newOrder));
        });
    });

    container.addEventListener('dragover', e => {
        e.preventDefault();
        const afterElement = getDragAfterElement(container, e.clientY);
        const draggable = document.querySelector('.dragging');
        if (afterElement == null) {
            container.appendChild(draggable);
        } else {
            container.insertBefore(draggable, afterElement);
        }
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.analyzer-option:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function loadSources() {
    try {
        const res = await getAnalyticsSources();
        if (res.success) {
            const select = document.getElementById('analytics-source-select');
            select.innerHTML = res.sources.map(s => `
                <option value="${s.type}" ${!s.available ? 'disabled' : ''}>
                    ${s.label} (${s.description})
                </option>
            `).join('') + `<option value="custom-upload" data-i18n="source_upload">Upload JSON Files (Device)</option>`;

            // Trigger change to load params if needed
            handleSourceChange();
        }
    } catch (e) {
        console.error('Failed to load sources', e);
    }
}

// File Upload State (Managed in handleSourceChange and activeSources)

async function handleSourceChange() {
    const type = document.getElementById('analytics-source-select').value;
    const paramsContainer = document.getElementById('source-params');
    paramsContainer.innerHTML = ''; // Clear previous

    if (type === 'local') {
        const res = await getLocalFiles();
        if (res.success && res.files.length > 0) {
            paramsContainer.innerHTML = `
                <div class="file-list-container" style="max-height: 150px; overflow-y: auto; border: 1px solid #ccc; padding: 5px; border-radius: 4px; background: #fff;">
                    ${res.files.map(f => `
                        <div style="margin-bottom: 4px;">
                            <label style="font-weight: normal; font-size: 0.9em; display:flex; align-items:center; gap:6px; cursor:pointer;">
                                <input type="checkbox" name="local-files" value="${f.filename}">
                                <span>${f.filename} <span style="color:#666; font-size:0.85em;">(${new Date(f.modified).toLocaleDateString()})</span></span>
                            </label>
                        </div>
                    `).join('')}
                </div>
                <small class="text-muted">Select files to add</small>
            `;
        } else {
            paramsContainer.innerHTML = '<p class="text-muted">No local files found.</p>';
        }
    } else if (type === 'sheets') {
        paramsContainer.innerHTML = `
            <input type="text" id="sheet-id-input" class="form-control" placeholder="Google Sheet ID" required>
            <input type="text" id="sheet-range-input" class="form-control" placeholder="Range (e.g. Sheet1!A:Z)" value="Sheet1!A:Z">
            <input type="text" id="sheet-alias-input" class="form-control" placeholder="Name / Alias (Optional)">
        `;
    } else if (type === 'custom-upload') {
        paramsContainer.innerHTML = `
            <div style="margin-bottom: 10px;">
                <input type="file" id="custom-file-input" multiple accept=".json,.csv,.xlsx,.xls" style="display:none">
                <button class="secondary-btn" style="width:auto; padding: 4px 10px; font-size: 0.9em;" onclick="document.getElementById('custom-file-input').click()">Select JSON Files</button>
            </div>
            <div id="custom-file-list" class="file-list-container" style="max-height: 100px; overflow-y: auto; border: 1px solid #eee; padding: 5px;"></div>
        `;

        document.getElementById('custom-file-input').addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            if (files.length > 0) {
                customUploadFiles = [...customUploadFiles, ...files];
                renderCustomFileList();
            }
            e.target.value = '';
        });
        renderCustomFileList();
    }
}

function renderCustomFileList() {
    const container = document.getElementById('custom-file-list');
    if (!container) return;

    if (customUploadFiles.length === 0) {
        container.innerHTML = '<span class="text-muted" style="font-size:0.9em;">No files staged.</span>';
        return;
    }

    container.innerHTML = customUploadFiles.map((f, i) => `
        <div style="display: flex; justify-content: space-between; font-size: 0.85em; padding: 2px 0;">
            <span>${f.name}</span>
            <span style="color:red; cursor:pointer;" onclick="removeCustomFile(${i})">&times;</span>
        </div>
    `).join('');
}

window.removeCustomFile = (index) => {
    customUploadFiles.splice(index, 1);
    renderCustomFileList();
}

async function addCurrentSource() {
    const type = document.getElementById('analytics-source-select').value;
    const sourceEntry = { type, id: Date.now() };

    if (type === 'local') {
        const checkboxes = document.querySelectorAll('input[name="local-files"]:checked');
        if (checkboxes.length === 0) {
            alert('Please select at least one file.');
            return;
        }
        const filenames = Array.from(checkboxes).map(cb => cb.value);
        sourceEntry.label = `Local Files: ${filenames.join(', ')}`;
        sourceEntry.options = { filename: filenames };

        // Uncheck boxes
        checkboxes.forEach(cb => cb.checked = false);

    } else if (type === 'sheets') {
        const sheetId = document.getElementById('sheet-id-input').value;
        const range = document.getElementById('sheet-range-input').value || 'Sheet1!A:Z';
        const alias = document.getElementById('sheet-alias-input').value;

        if (!sheetId) {
            alert('Please enter a Sheet ID.');
            return;
        }

        sourceEntry.label = alias ? `${alias} (${range})` : `Sheet: ${sheetId} (${range})`;
        sourceEntry.options = { sheetId, range };

        // Clear inputs
        document.getElementById('sheet-id-input').value = '';
        document.getElementById('sheet-alias-input').value = '';

    } else if (type === 'custom-upload') {
        if (customUploadFiles.length === 0) {
            alert('Please select files first.');
            return;
        }

        // We need to read files NOW because we can't easily keep File objects viable long term reliably across some boundaries,
        // but here it's fine. However, let's parse them now to store data in memory source.
        try {
            const allData = [];
            for (const file of customUploadFiles) {
                if (file.name.endsWith('.json')) {
                    const text = await file.text();
                    const json = JSON.parse(text);
                    if (json.accounts) {
                        allData.push(...json.accounts.flatMap(acc => acc.txns.map(t => ({ ...t, account: acc.accountNumber }))));
                    } else if (Array.isArray(json)) {
                        allData.push(...json);
                    }
                } else if (file.name.endsWith('.csv')) {
                    const text = await file.text();
                    const result = await new Promise(resolve => {
                        Papa.parse(text, {
                            header: true,
                            skipEmptyLines: true,
                            complete: resolve
                        });
                    });
                    const normalized = normalizeCsvData(result.data);
                    allData.push(...normalized);
                } else if (file.name.match(/\.xlsx?$/)) {
                    const arrayBuffer = await file.arrayBuffer();
                    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const json = XLSX.utils.sheet_to_json(firstSheet, { raw: false });
                    const normalized = normalizeCsvData(json);
                    allData.push(...normalized);
                }
            }
            if (allData.length === 0) throw new Error('No transactions found');

            sourceEntry.label = `Upload: ${customUploadFiles.length} files (${allData.length} txns)`;
            sourceEntry.type = 'memory'; // Convert to memory source with data
            sourceEntry.options = { data: allData };

            // Clear staging
            customUploadFiles = [];
            renderCustomFileList();

        } catch (e) {
            ui.showToast('Failed to parse uploaded files: ' + e.message, 'error');
            return;
        }
    } else if (type === 'memory') {
        // Handle "Current Results"
        if (window.lastScrapeResult && window.lastScrapeResult.data && window.lastScrapeResult.data.length > 0) {
            sourceEntry.label = `Current Scrape (${window.lastScrapeResult.data.length} txns)`;
            sourceEntry.options = { data: window.lastScrapeResult.data };
        } else {
            alert('No active scrape results found. Run a scrape first.');
            return;
        }
    }

    activeSources.push(sourceEntry);
    renderActiveSources();
}

/**
 * Detects and marks internal transfers (e.g. Bank -> Credit Card)
 * to prevent double counting of expenses.
 */
function markInternalTransfers(data) {
    const keywords = [
        'isracard', 'visa', 'mastercard', 'transfer to card',
        'מסטרקרד', 'ישראכרט', 'ויזה', 'מקס איט', 'כרטיסי אשראי',
        'העברה לכרטיס'
    ];

    let count = 0;
    for (const t of data) {
        const desc = (t.description || t.memo || '').toLowerCase();
        // Check if description contains any keyword
        const isTransfer = keywords.some(k => desc.includes(k.toLowerCase()));

        if (isTransfer) {
            t.category = 'Internal Transfer';
            t.isInternalTransfer = true;
            count++;
        }
    }
    console.log(`[Analytics] Marked ${count} transactions as Internal Transfers.`);
    return data;
}

function renderActiveSources() {
    const container = document.getElementById('active-sources-list');
    if (!container) return;

    if (activeSources.length === 0) {
        container.innerHTML = '<div class="text-muted" style="font-size:0.9em; padding:5px;">No sources added yet.</div>';
        return;
    }

    container.innerHTML = `
        <h4 style="font-size:0.9em; margin-bottom:5px;">Sources to Load:</h4>
        ${activeSources.map((s, i) => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:#f1f5f9; padding:6px; margin-bottom:4px; border-radius:4px; font-size:0.9em;">
                <span>${s.label}</span>
                <button class="text-btn" style="color:#ef4444;" onclick="removeActiveSource(${i})">Remove</button>
            </div>
        `).join('')}
    `;
}

window.removeActiveSource = (index) => {
    activeSources.splice(index, 1);
    renderActiveSources();
}

async function handleLoadData() {
    if (activeSources.length === 0) {
        alert('Please add at least one source first.');
        return;
    }

    const statusEl = document.getElementById('data-load-status');
    statusEl.innerHTML = '<span class="status-loading">Loading all sources...</span>';

    // Disable button
    const btn = document.getElementById('load-data-btn');
    btn.disabled = true;

    try {
        let aggregatedData = [];
        let successCount = 0;

        for (const source of activeSources) {
            try {
                // If it's already memory/upload data
                if (source.type === 'memory') {
                    if (source.options.data) {
                        aggregatedData.push(...source.options.data);
                        successCount++;
                    }
                    continue;
                }

                // Fetch from server
                // IMPORTANT: Pass preview: false to get all data, not just first 100 rows
                const res = await loadAnalyticsData(source.type, { ...source.options, preview: false });
                if (res.success) {
                    aggregatedData.push(...res.data);
                    successCount++;
                } else {
                    console.error('Failed to load source:', source.label, res.error);
                    // Decide: abort or continue? Let's warn but continue.
                    statusEl.innerHTML += `<br><span class="danger-text">Failed: ${source.label}</span>`;
                }
            } catch (e) {
                console.error('Source error:', source.label, e);
            }
        }

        if (aggregatedData.length > 0) {
            currentData = aggregatedData;

            // Mark internal transfers to handle double counting
            markInternalTransfers(currentData);

            // Create a composite source object for "Current Connection" context if needed
            currentSource = { type: 'mixed', options: { description: `${successCount} sources` }, data: aggregatedData };

            // For AI questions, we might want to pass all data if it fits, or let the server handle it?
            // The format expects { type, options }. If type='memory', options.data is sent.
            // So we can set currentSource as a large memory source of the aggregated data.
            currentSource = {
                type: 'memory',
                options: {
                    data: aggregatedData
                }
            };

            statusEl.innerHTML = `<span class="status-success">Successfully loaded ${aggregatedData.length} transactions from ${successCount} sources.</span>`;
            document.getElementById('analytics-actions').style.display = 'block';
        } else {
            statusEl.innerHTML = '<span class="status-error">Failed to load any data.</span>';
        }

    } catch (e) {
        statusEl.innerHTML = `<span class="status-error">Global Error: ${e.message}</span>`;
    } finally {
        btn.disabled = false;
    }
}

async function handleRunAnalysis() {
    if (!currentSource) {
        alert('Please load data first');
        return;
    }

    // Get selected analyzers
    const selected = Array.from(document.querySelectorAll('#analyzer-options input:checked'))
        .map(cb => cb.value);

    if (selected.length === 0) {
        alert('Please select at least one analyzer');
        return;
    }

    const container = document.getElementById('analysis-results');
    container.innerHTML = '<div class="loading-spinner">Running analysis...</div>';

    // Filter out internal transfers from analysis to prevent double counting
    const analysisData = currentSource.options.data.filter(t => !t.isInternalTransfer);
    const ignoredCount = currentSource.options.data.length - analysisData.length;

    if (ignoredCount > 0) {
        console.log(`[Analytics] Ignoring ${ignoredCount} internal transfer transactions to prevent double counting.`);
    }

    try {
        // We pass source config so server can reload/use data
        // If source is memory (client-side data), we pass it.
        const requestData = currentSource.type === 'memory' ? analysisData : null;

        // Force includeTransactions for drill-down support
        const options = { ...currentSource.options, includeTransactions: true };

        const res = await runAnalysis(selected, currentSource.type, options, requestData);

        if (res.success) {
            renderResults(res.results);
        } else {
            throw new Error(res.error);
        }
    } catch (e) {
        container.innerHTML = `<div class="error-message">Analysis failed: ${e.message}</div>`;
    }
}

function renderResults(results) {
    const container = document.getElementById('analysis-results');
    container.innerHTML = '';

    results.forEach(result => {
        const card = document.createElement('div');
        card.className = 'result-card';

        if (!result.success) {
            card.innerHTML = `<h3>${result.label}</h3><div class="error">Error: ${result.error}</div>`;
        } else {
            card.innerHTML = `<h3>${result.label}</h3>`;
            const content = document.createElement('div');
            content.className = 'result-content';

            // Render specific result types
            if (result.result.type === 'category_breakdown') {
                renderCategoryChart(content, result.result);
            } else if (result.result.type === 'monthly_trend') {
                renderTrendChart(content, result.result);
            } else if (result.result.type === 'top_merchants') {
                renderMerchantsTable(content, result.result);
            } else if (result.result.type === 'income_vs_expense') {
                renderIncomeVsExpense(content, result.result);
            } else if (result.result.type === 'recurring_payments') {
                renderRecurringPayments(content, result.result);
            } else if (result.result.type === 'safe_to_spend') {
                renderSafeToSpend(content, result.result);
            } else if (result.result.type === 'installment_analysis') {
                renderInstallmentAnalysis(content, result.result);
            } else {
                content.innerHTML = `<pre>${JSON.stringify(result.result, null, 2)}</pre>`;
            }

            card.appendChild(content);
        }

        container.appendChild(card);
    });
}

// --- Render Helpers ---

function renderCategoryChart(container, data) {
    // Store data for drill-down
    currentCategoryResults = data;

    // Simple bar chart using HTML/CSS
    const html = `
        <div class="summary-stat">Total Spending: ${formatCurrency(data.totalSpending)}</div>
        <div class="chart-container">
            ${data.categories.map(c => `
                <div class="chart-bar-row clickable-row" onclick="showCategoryDetails('${c.category.replace(/'/g, "\\'")}')">
                    <div class="bar-label" title="${c.category}">${c.category}</div>
                    <div class="bar-area">
                        <div class="bar-fill" style="width: ${c.percentage}%"></div>
                    </div>
                    <div class="bar-value">${formatCurrency(c.total)} (${c.percentage}%)</div>
                </div>
            `).join('')}
        </div>
        <div style="margin-top:10px; font-size:0.8em; color:#64748b; text-align:center;">
            (Click on a category row to view transactions)
        </div>
    `;
    container.innerHTML = html;
}

function renderTrendChart(container, data) {
    // Simple HTML table for trends
    const html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Month</th>
                    <th>Income</th>
                    <th>Spending</th>
                    <th>Net</th>
                </tr>
            </thead>
            <tbody>
                ${data.months.map(m => `
                    <tr>
                        <td>${m.month}</td>
                        <td class="success-text">${formatCurrency(m.income)}</td>
                        <td class="danger-text">${formatCurrency(m.spending)}</td>
                        <td class="${m.net >= 0 ? 'success-text' : 'danger-text'}">${formatCurrency(m.net)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    container.innerHTML = html;
}

function renderIncomeVsExpense(container, data) {
    const html = `
        <div class="summary-stat">${data.insight}</div>
        
        <div style="display: flex; gap: 20px; margin: 20px 0; justify-content: space-around;">
            <div style="text-align: center; padding: 15px; background: #ecfdf5; border-radius: 8px; width: 30%;">
                <div style="font-size: 0.9em; color: #047857; margin-bottom: 5px;">Total Income</div>
                <div class="success-text" style="font-size: 1.4em; font-weight: bold;">${formatCurrency(data.totalIncome)}</div>
            </div>
            <div style="text-align: center; padding: 15px; background: #fef2f2; border-radius: 8px; width: 30%;">
                <div style="font-size: 0.9em; color: #b91c1c; margin-bottom: 5px;">Total Expense</div>
                <div class="danger-text" style="font-size: 1.4em; font-weight: bold;">${formatCurrency(data.totalExpense)}</div>
            </div>
            <div style="text-align: center; padding: 15px; background: #f8fafc; border-radius: 8px; width: 30%;">
                <div style="font-size: 0.9em; color: #334155; margin-bottom: 5px;">Net</div>
                <div class="${data.net >= 0 ? 'success-text' : 'danger-text'}" style="font-size: 1.4em; font-weight: bold;">${formatCurrency(data.net)}</div>
            </div>
        </div>

        ${Object.keys(data.accountBreakdown).length > 0 ? `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Account</th>
                        <th>Income</th>
                        <th>Expense</th>
                        <th>Net</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.entries(data.accountBreakdown).map(([account, totals]) => `
                        <tr>
                            <td>${account}</td>
                            <td class="success-text">${formatCurrency(totals.income)}</td>
                            <td class="danger-text">${formatCurrency(totals.expense)}</td>
                            <td class="${totals.total >= 0 ? 'success-text' : 'danger-text'}">
                                ${formatCurrency(totals.total)}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        ` : ''}
    `;
    container.innerHTML = html;
}

function renderMerchantsTable(container, data) {
    const html = `
        <div class="tab-controls" style="display:flex; gap:10px; margin-bottom:15px; border-bottom:1px solid #eee;">
            <button onclick="switchMerchantTab(this, 'amount')" class="tab-btn active" style="background:none; border:none; border-bottom:2px solid var(--primary-color); padding:8px 15px; font-weight:600; cursor:pointer;">By Spending</button>
            <button onclick="switchMerchantTab(this, 'count')" class="tab-btn" style="background:none; border:none; padding:8px 15px; color:#64748b; cursor:pointer;">By Frequency</button>
        </div>

        <div id="merchants-amount" class="merchant-tab-content">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Merchant</th>
                        <th>Total</th>
                        <th>Count</th>
                        <th>Avg</th>
                    </tr>
                </thead>
                <tbody>
                    ${(data.topByAmount || data.topMerchants).map(m => `
                        <tr>
                            <td>${m.rank}</td>
                            <td>${m.merchant}</td>
                            <td>${formatCurrency(m.total)}</td>
                            <td>${m.count}</td>
                            <td>${formatCurrency(m.averageTransaction)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div id="merchants-count" class="merchant-tab-content" style="display:none;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Merchant</th>
                        <th>Count</th>
                        <th>Total</th>
                        <th>Avg</th>
                    </tr>
                </thead>
                <tbody>
                    ${(data.topByCount || []).map(m => `
                        <tr>
                            <td>${m.rank}</td>
                            <td>${m.merchant}</td>
                            <td>${m.count}</td>
                            <td>${formatCurrency(m.total)}</td>
                            <td>${formatCurrency(m.averageTransaction)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    container.innerHTML = html;

    // Add tab switching logic locally to avoid polluting global scope excessively if not needed, 
    // but onclick needs global access. Lets add helper to window.
    if (!window.switchMerchantTab) {
        window.switchMerchantTab = function (btn, type) {
            const parent = btn.parentElement;
            const container = parent.parentElement;

            // Toggle buttons
            parent.querySelectorAll('.tab-btn').forEach(b => {
                b.classList.remove('active');
                b.style.borderBottom = 'none';
                b.style.color = '#64748b';
            });
            btn.classList.add('active');
            btn.style.borderBottom = '2px solid var(--primary-color)';
            btn.style.color = 'var(--text-main)';

            // Toggle content
            container.querySelectorAll('.merchant-tab-content').forEach(c => c.style.display = 'none');
            container.querySelector(`#merchants-${type}`).style.display = 'block';
        };
    }
}

function renderRecurringPayments(container, data) {
    const html = `
        <div class="summary-stat">${data.insight}</div>
        ${data.subscriptions.length > 0 ? `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Merchant</th>
                        <th>Amount</th>
                        <th>Frequency</th>
                        <th>Occurrences</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.subscriptions.map(s => `
                        <tr>
                            <td>${s.merchant}</td>
                            <td>${formatCurrency(s.amount)}</td>
                            <td>Every ${s.frequency} days</td>
                            <td>${s.occurrences}x</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        ` : '<p class="text-muted">No recurring subscriptions detected.</p>'}
    `;
    container.innerHTML = html;
}

function renderSafeToSpend(container, data) {
    const safePercentage = data.currentBalance > 0
        ? Math.round((data.safeBalance / data.currentBalance) * 100)
        : 0;
    const isSafe = data.safeBalance > 0;

    const html = `
        <div class="summary-stat">${data.insight}</div>
        <div style="margin: 20px 0;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                <span><strong>Current Balance:</strong></span>
                <span class="${isSafe ? 'success-text' : 'danger-text'}">${formatCurrency(data.currentBalance)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                <span><strong>Monthly Commitments:</strong></span>
                <span class="danger-text">${formatCurrency(data.monthlyCommitments)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 1.1em;">
                <span><strong>Safe to Spend:</strong></span>
                <span class="${isSafe ? 'success-text' : 'danger-text'}" style="font-weight: bold;">${formatCurrency(data.safeBalance)}</span>
            </div>
            
            <!-- Progress bar -->
            <div style="background: #e2e8f0; border-radius: 8px; height: 24px; overflow: hidden; position: relative;">
                <div style="background: ${isSafe ? '#10b981' : '#ef4444'}; height: 100%; width: ${Math.abs(safePercentage)}%; transition: width 0.3s;"></div>
                <div style="position: absolute; top: 0; left: 0; right: 0; text-align: center; line-height: 24px; font-size: 0.85em; color: #1e293b; font-weight: 500;">
                    ${Math.abs(safePercentage)}% ${isSafe ? 'Available' : 'Over Budget'}
                </div>
            </div>
        </div>
    `;
    container.innerHTML = html;
}

function renderInstallmentAnalysis(container, data) {
    const html = `
        <div class="summary-stat">${data.insight}</div>
        ${data.activeInstallments.length > 0 ? `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Purchase</th>
                        <th>Monthly</th>
                        <th>Progress</th>
                        <th>Remaining</th>
                        <th>Completion</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.activeInstallments.map(inst => `
                        <tr>
                            <td>${inst.description}</td>
                            <td>${formatCurrency(inst.monthlyPayment)}</td>
                            <td>${inst.paymentsMade}/${inst.totalPayments}</td>
                            <td>${formatCurrency(inst.totalRemaining)}</td>
                            <td>${new Date(inst.estimatedCompletion).toLocaleDateString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            
            ${data.timeline && data.timeline.length > 0 ? `
                <div style="margin-top: 20px;">
                    <h4 style="font-size: 0.9em; margin-bottom: 10px;">Projected Monthly Burden (Next 12 Months)</h4>
                    <div class="chart-container">
                        ${data.timeline.slice(0, 12).map(t => `
                            <div class="chart-bar-row">
                                <div class="bar-label">Month ${t.month}</div>
                                <div class="bar-area">
                                    <div class="bar-fill" style="width: ${(t.burden / data.totalMonthlyBurden) * 100}%; background: #3b82f6;"></div>
                                </div>
                                <div class="bar-value">${formatCurrency(t.burden)}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        ` : '<p class="text-muted">No active installment payments detected.</p>'}
    `;
    container.innerHTML = html;
}




function appendChatMessage(role, text) {
    const container = document.getElementById('ai-chat-output');
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${role}-message`;

    // Convert newlines to breaks for simple formatting
    const formatted = text.replace(/\n/g, '<br>');
    msgDiv.innerHTML = formatted;

    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

function appendTypingIndicator() {
    const container = document.getElementById('ai-chat-output');
    const id = 'typing-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = 'chat-message ai-message typing';
    div.innerText = 'Thinking...';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return id;
}

function removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

/**
 * Normalize CSV/Excel data to application schema
 */
function normalizeCsvData(rows) {
    return rows.map(row => {
        // Try to map common column names
        const date = row['Date'] || row['date'] || row['תאריך'] || row['processedDate'];
        const amount = row['Amount'] || row['amount'] || row['סכום'] || row['chargedAmount'];
        const description = row['Description'] || row['description'] || row['תיאור'] || row['merchant'] || row['בית עסק'];
        const memo = row['Memo'] || row['memo'] || row['הערות'] || '';
        const category = row['Category'] || row['category'] || row['קוכוריה'] || '';

        // Clean amount
        let cleanAmount = 0;
        if (typeof amount === 'string') {
            cleanAmount = parseFloat(amount.replace(/[^\d.-]/g, ''));
        } else if (typeof amount === 'number') {
            cleanAmount = amount;
        }

        return {
            date: date ? new Date(date).toISOString() : new Date().toISOString(),
            amount: cleanAmount,
            description: description || 'Unknown',
            memo: memo,
            category: category,
            originalCurrency: 'ILS' // Default assumption
        };
    });
}

function formatCurrency(num) {
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(num);
}

// --- Transaction Modal Logic ---

let transactionModalInitialized = false;
let currentCategoryResults = null; // Store full results for lookup

function initTransactionModal() {
    if (transactionModalInitialized || document.getElementById('transaction-details-modal')) return;

    const modalHtml = `
        <div id="transaction-details-modal" class="modal-overlay">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 id="trans-modal-title">Category Transactions</h3>
                    <button class="modal-close" onclick="closeTransactionModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div id="trans-modal-list"></div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Close on click outside
    document.getElementById('transaction-details-modal').addEventListener('click', (e) => {
        if (e.target.id === 'transaction-details-modal') closeTransactionModal();
    });

    transactionModalInitialized = true;
}

function showCategoryDetails(categoryName) {
    if (!currentCategoryResults) return;

    // Find category data
    const catData = currentCategoryResults.categories.find(c => c.category === categoryName);

    if (!catData || !catData.transactions || catData.transactions.length === 0) {
        alert('No transactions found for this category.');
        return;
    }

    const modal = document.getElementById('transaction-details-modal');
    if (!modal) initTransactionModal();

    document.getElementById('trans-modal-title').textContent = `${categoryName} (${catData.count})`;

    // Sort transactions by date (newest first)
    const sortedTransactions = [...catData.transactions].sort((a, b) => {
        const dateA = new Date(a.date || a.processedDate);
        const dateB = new Date(b.date || b.processedDate);
        return dateB - dateA;
    });

    const tableHtml = `
        <table class="transaction-list-table">
            <thead>
                <tr>
                    <th data-i18n="th_date">Date</th>
                    <th data-i18n="th_account">Account</th>
                    <th data-i18n="th_merchant">Merchant</th>
                    <th data-i18n="th_amount">Amount</th>
                    <th data-i18n="th_memo">Memo</th>
                </tr>
            </thead>
            <tbody>
                ${sortedTransactions.map(t => {
        const amount = t.chargedAmount || t.amount;
        const dateObj = new Date(t.date || t.processedDate);
        const dateStr = dateObj.toLocaleDateString();
        const isExpense = amount < 0;
        return `
                        <tr>
                            <td>${dateStr}</td>
                            <td>${t['account number'] || '-'}</td>
                            <td>${t.description || t.memo || ''}</td>
                            <td class="${isExpense ? 'danger-text' : 'success-text'}" style="direction: ltr;">${formatCurrency(amount)}</td>
                            <td>${t.memo || ''}</td>
                        </tr>
                    `;
    }).join('')}
            </tbody>
        </table>
    `;

    document.getElementById('trans-modal-list').innerHTML = tableHtml;
    document.getElementById('transaction-details-modal').style.display = 'flex';
}

function closeTransactionModal() {
    const modal = document.getElementById('transaction-details-modal');
    if (modal) modal.style.display = 'none';
}

// Expose to window
window.showCategoryDetails = showCategoryDetails;
window.closeTransactionModal = closeTransactionModal;

