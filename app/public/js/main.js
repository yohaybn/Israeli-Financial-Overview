import { state } from './state.js';
import * as api from './api.js';
import * as ui from './ui.js';
import * as auth from './auth.js';
import { arrayToCsv, flattenMultiAccountData } from './utils.js';
import { convertToFirefly, convertToYnab } from './export.js';

let currentResultDiv = null;
const socket = io();
let appSettings = {};

// socket logic
socket.on('log', (msg) => {
    if (currentResultDiv) {
        let profile = null;
        let cleanMsg = msg;
        if (msg.startsWith('PROFILE:')) {
            const parts = msg.split('::');
            if (parts.length > 1) {
                profile = parts[0].replace('PROFILE:', '');
                cleanMsg = parts.slice(1).join('::');
            }
        }

        const li = document.createElement('li');
        li.innerHTML = cleanMsg.includes('ERROR') ? `<span style="color:red">❌ ${cleanMsg}</span>` : `✅ ${cleanMsg}`;

        let container = currentResultDiv;
        if (profile && currentResultDiv.id === 'bulk-result') {
            let profileSection = currentResultDiv.querySelector(`[data-profile="${profile}"]`);
            if (!profileSection) {
                profileSection = document.createElement('div');
                profileSection.setAttribute('data-profile', profile);
                profileSection.className = 'profile-log-section';
                profileSection.innerHTML = `<div class="log-header">Profile: ${profile}</div><ul class="log-list"></ul>`;
                currentResultDiv.appendChild(profileSection);
            }
            container = profileSection;
        }

        let list = container.querySelector('ul');
        if (!list) {
            list = document.createElement('ul');
            list.className = 'log-list';
            container.appendChild(list);
        }
        list.appendChild(li);
        currentResultDiv.scrollTop = currentResultDiv.scrollHeight;
    }
});

socket.on('result', (result) => {
    // Optional: could handle real-time result updates if needed
});

// --- Logic ---

function getCommonOptions() {
    const startDate = document.getElementById('start-date').value;
    const filename = document.getElementById('custom-filename').value;
    const saveToSheets = document.getElementById('bulk-save-sheets').checked;
    const useExisting = document.getElementById('debug-use-existing').checked;
    const profileName = document.getElementById('run-profile-name').value;

    const options = {};
    if (startDate) options.startDate = startDate;
    if (filename) options.filename = filename;
    if (saveToSheets) options.saveToSheets = true;
    if (useExisting) options.useExisting = true;
    if (useExisting) options.useExisting = true;
    if (profileName) options.profileName = profileName;

    // Add test data option
    const useTestData = document.getElementById('useTestData').checked;
    if (useTestData) options.useTestData = true;

    return options;
}

export async function init() {
    const savedLang = localStorage.getItem('lang') || 'en';
    document.getElementById('lang-select').value = savedLang;
    await ui.setLanguage(savedLang);

    auth.checkAuthStatus();

    try {
        await loadModels(); // Load AI models from config
        const [defs, profiles] = await Promise.all([
            api.getDefinitions(),
            api.getProfiles()
        ]);

        state.scrapersDef = defs;
        ui.updateProfileSelect(profiles);
        await loadAppSettings(); // Make sure this completes first
        ui.refreshBankNames(); // Now translations are loaded
        ui.updateExpectedFilename();
    } catch (err) {
        console.error(err);
    }
}

async function loadAppSettings() {
    try {
        const settings = await api.getSettings();
        if (settings.filePattern) {
            const el = document.getElementById('custom-filename');
            if (el) el.value = settings.filePattern;
        }
        if (settings.folderId) {
            const el = document.getElementById('folderId');
            if (el) el.value = settings.folderId;
        }
        if (settings.timeout) {
            const el = document.getElementById('setup-timeout');
            if (el) el.value = settings.timeout;
        }

        // Initialize categories (always run this)
        const defaultCategories = 'מזון, תחבורה, קניות, מנויים, בריאות, מגורים, בילויים, משכורת, העברות, חשבונות, ביגוד, חינוך, אחר';
        let categoriesStr = defaultCategories;

        if (settings.ai) {
            const elModel = document.getElementById('aiModel');
            const elKey = document.getElementById('aiApiKey');
            const elAutoRun = document.getElementById('aiAutoRun');

            if (elModel && settings.ai.model) elModel.value = settings.ai.model;
            if (elKey && settings.ai.apiKey) elKey.value = settings.ai.apiKey; // Will be masked
            if (elAutoRun !== null) {
                elAutoRun.checked = settings.ai.autoRun || false;
                // Update toggle UI
                const toggle = document.getElementById('ai-autorun-toggle');
                if (toggle) {
                    updateToggleUI(toggle, elAutoRun.checked, '#8b5cf6');
                }
            }

            // Use saved categories if available
            if (settings.ai.categories) {
                categoriesStr = settings.ai.categories;
            }
        }

        // Always set categories
        state.categories = categoriesStr.split(',').map(c => c.trim()).filter(c => c);
        renderCategoryChips();

        // Load Rules
        appSettings = settings || {};
        renderRulesList();

        ui.updateExpectedFilename();
    } catch (e) {
        console.error('Failed to load settings', e);
        // Even on error, initialize with defaults
        const defaultCategories = 'מזון, תחבורה, קניות, מנויים, בריאות, מגורים, בילויים, משכורת, העברות, חשבונות, ביגוד, חינוך, אחר';
        state.categories = defaultCategories.split(',').map(c => c.trim());
        renderCategoryChips();
        renderRulesList(); // Empty
    }
}

function renderCategoryChips() {
    const container = document.getElementById('categoriesChips');
    if (!container) return;

    container.innerHTML = '';
    state.categories.forEach((category, index) => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.innerHTML = `
            <span>${category}</span>
            <span class="chip-remove" onclick="removeCategory(${index})">×</span>
        `;
        container.appendChild(chip);
    });
}

export function addCategory() {
    const input = document.getElementById('newCategoryInput');
    const category = input.value.trim();

    if (!category) {
        ui.showToast('Please enter a category name', 'warning');
        return;
    }

    if (state.categories.includes(category)) {
        ui.showToast('Category already exists', 'warning');
        return;
    }

    state.categories.push(category);
    renderCategoryChips();
    input.value = '';
    // Auto-save categories (silent)
    saveAiSettings(true);
    ui.showToast(`Added "${category}"`, 'success');
}

export function removeCategory(index) {
    const category = state.categories[index];
    state.categories.splice(index, 1);
    renderCategoryChips();
    // Auto-save categories (silent)
    saveAiSettings(true);
    ui.showToast(`Removed "${category}"`, 'info');
}

async function loadModels() {
    try {
        const response = await fetch('/config/models.json');
        const models = await response.json();
        const select = document.getElementById('aiModel');
        if (select) {
            const currentValue = select.value; // Save current selection
            select.innerHTML = '';
            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.value;
                option.textContent = model.label;
                select.appendChild(option);
            });
            // Restore selection if it exists
            if (currentValue && Array.from(select.options).some(opt => opt.value === currentValue)) {
                select.value = currentValue;
            }
        }
    } catch (e) {
        console.error('Failed to load models', e);
    }
}

// Auto-categorize toggle
const aiAutoRunCheckbox = document.getElementById('aiAutoRun');
const aiAutoRunToggle = document.getElementById('ai-autorun-toggle');
if (aiAutoRunCheckbox && aiAutoRunToggle) {
    aiAutoRunCheckbox.addEventListener('change', () => {
        const isChecked = aiAutoRunCheckbox.checked;
        updateToggleUI(aiAutoRunToggle, isChecked, '#8b5cf6');
        saveAppSetting('ai', { autoRun: isChecked });
    });
    // Initial state
    updateToggleUI(aiAutoRunToggle, aiAutoRunCheckbox.checked, '#8b5cf6');
    updateToggleUI(aiAutoRunToggle, aiAutoRunCheckbox.checked, '#8b5cf6');
}

// Test Mode toggle logic
const testModeCheckbox = document.getElementById('useTestData');
const testModeToggle = document.getElementById('test-mode-toggle');
if (testModeCheckbox && testModeToggle) {
    testModeCheckbox.addEventListener('change', () => {
        const isChecked = testModeCheckbox.checked;
        updateToggleUI(testModeToggle, isChecked, '#f59e0b');
    });
    // Initial state
    updateToggleUI(testModeToggle, testModeCheckbox.checked, '#f59e0b');
}

function updateToggleUI(toggle, isChecked, activeColor = '#dc3545') {
    const slider = toggle.querySelector('div');
    if (!slider) return;
    if (isChecked) {
        toggle.style.background = activeColor;
        slider.style.left = '28px'; // 50px - 20px - 2px
        slider.style.right = 'auto';
    } else {
        toggle.style.background = '#cbd5e1';
        slider.style.left = '2px';
        slider.style.right = 'auto';
    }
}
export async function saveAiSettings(silent = false) {
    const model = document.getElementById('aiModel').value;
    const apiKey = document.getElementById('aiApiKey').value;
    const autoRun = document.getElementById('aiAutoRun').checked;
    const categories = state.categories.join(', ');

    // Don't send masked key back if it hasn't changed
    const aiConfig = { model, autoRun };
    if (categories) {
        aiConfig.categories = categories;
    }
    if (apiKey && apiKey !== '********') {
        aiConfig.apiKey = apiKey;
    }

    try {
        await api.saveSetting('ai', aiConfig);
        if (!silent) {
            ui.showToast('AI Settings saved successfully', 'success');
        }
    } catch (e) {
        ui.showToast('Failed to save AI settings: ' + e.message, 'error');
    }
}

export async function categorizeNow() {
    if (!state.lastCsvData) {
        ui.showToast('No data available to categorize', 'warning');
        return;
    }

    // Parse CSV back to JSON (we need the transaction objects)
    // state.lastCsvData is CSV string, but we need the original data
    // Better: use state.currentResult.data if available, or parse from allBulkResults

    let transactions = [];

    // Try to get from current result or bulk results
    if (state.currentResult && state.currentResult.data) {
        transactions = state.currentResult.data;
    } else if (state.allBulkResults && state.allBulkResults.length > 0) {
        // Get from the currently selected bulk result
        const picker = document.getElementById('bulk-result-picker');
        if (picker && picker.value !== undefined) {
            const idx = parseInt(picker.value);
            const res = state.allBulkResults[idx];
            if (res && res.data) {
                transactions = res.data;
            }
        }
    }

    if (!transactions || transactions.length === 0) {
        ui.showToast('No transaction data found', 'warning');
        return;
    }

    ui.showToast('Categorizing transactions...', 'info');

    try {
        const filename = state.lastResultFiles ? state.lastResultFiles.json : null;
        const result = await api.categorizeTransactions({ transactions, filename });
        if (result.success && result.data) {
            // Update state
            state.lastCsvData = arrayToCsv(result.data);

            // Update current result if it exists
            if (state.currentResult) {
                state.currentResult.data = result.data;
            }

            // Update bulk results if applicable
            if (state.allBulkResults && state.allBulkResults.length > 0) {
                const picker = document.getElementById('bulk-result-picker');
                if (picker && picker.value !== undefined) {
                    const idx = parseInt(picker.value);
                    if (state.allBulkResults[idx]) {
                        state.allBulkResults[idx].data = result.data;
                        state.allBulkResults[idx].csv = arrayToCsv(result.data);
                    }
                }
            }

            // Re-render table
            ui.renderTable(state.lastCsvData);
            ui.showToast('Categorization complete!', 'success');
        } else {
            ui.showToast('Categorization failed', 'error');
        }
    } catch (e) {
        ui.showToast('Error: ' + e.message, 'error');
    }
}

export async function saveAppSetting(key, value) {
    if (!appSettings) appSettings = {};
    appSettings[key] = value;
    try {
        await api.saveSetting(key, value);
    } catch (e) {
        console.error('Failed to save setting', e);
    }
}

export async function deleteProfile() {
    const name = document.getElementById('profile-select').value;
    if (!name) return ui.showToast('Please select a profile to delete', 'error');
    if (!confirm(`Are you sure you want to delete profile "${name}"? This cannot be undone.`)) return;

    try {
        const data = await api.deleteProfileApi(name);
        if (data.success) {
            ui.showToast(data.message, 'success');
            const profiles = await api.getProfiles();
            ui.updateProfileSelect(profiles);
            document.getElementById('profile-select').value = '';
        } else {
            ui.showToast('Delete failed: ' + data.error, 'error');
        }
    } catch (e) {
        ui.showToast('Error: ' + e.message, 'error');
    }
}

export async function loadProfile() {
    const name = document.getElementById('profile-select').value;
    if (!name) {
        document.getElementById('profile-actions').style.display = 'none';
        return;
    }

    const key = document.getElementById('master-key').value;
    if (!key) {
        ui.showToast('toast_key_required', 'warning');
        document.getElementById('profile-select').value = '';
        document.getElementById('profile-actions').style.display = 'none';
        return;
    }

    try {
        const data = await api.getProfile(name, key);
        if (data.error) throw new Error(data.error);

        if (data.companyId) {
            document.getElementById('companyId').value = data.companyId;
            ui.renderForm(data.companyId, data.credentials || data);
            document.getElementById('run-profile-name').value = name;
            ui.showToast('toast_profile_loaded', 'success');

            document.getElementById('registration-details').style.display = 'block';
            document.getElementById('profile-actions').style.display = 'flex';
            document.getElementById('save-profile-section').style.display = 'block';
            document.getElementById('save-creds').checked = false;
            ui.toggleSaveOptions();
        }
        ui.updateExpectedFilename();
        ui.updateRunButton();
    } catch (err) {
        ui.showToast('Failed to load: ' + err.message, 'error');
        document.getElementById('profile-select').value = '';
        document.getElementById('profile-actions').style.display = 'none';
    }
}

export async function runScrape() {
    const companyId = document.getElementById('companyId').value;
    if (!companyId) return ui.showToast('Please select a bank', 'warning');

    const inputs = document.querySelectorAll('#credentials-form input');
    const credentials = {};
    inputs.forEach(input => credentials[input.name] = input.value);



    const useTestData = document.getElementById('useTestData').checked;

    // If using test data, provide dummy credentials to pass validation
    if (useTestData) {
        credentials.username = credentials.username || 'test';
        credentials.password = credentials.password || 'test';
    }

    // Handle Saving
    if (!useTestData && document.getElementById('save-creds').checked && document.getElementById('save-profile-section').style.display !== 'none') {
        const saveName = document.getElementById('save-name').value || companyId;
        const saveKey = document.getElementById('master-key').value;
        if (!saveKey) return ui.showToast('Master Key required to save credentials', 'error');

        const dataToSave = { ...credentials, companyId };
        try {
            await api.saveProfileApi({ name: saveName, credentials: dataToSave, key: saveKey });
            const profiles = await api.getProfiles();
            ui.updateProfileSelect(profiles);
        } catch (e) {
            ui.showToast('Failed to save profile: ' + e.message, 'error');
            return;
        }
    }

    const resultDiv = document.getElementById('scrape-result');
    const csvContainer = document.getElementById('csv-container');
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<strong>Execution Logs:</strong><ul class="log-list"><li>Initializing...</li></ul>';
    resultDiv.className = 'result-box';
    currentResultDiv = resultDiv;
    csvContainer.style.display = 'none';
    ui.setProgress(true);

    const startDate = document.getElementById('setup-startDate').value;
    const timeoutSec = parseInt(document.getElementById('setup-timeout').value) || 60;
    const saveToSheets = document.getElementById('bulk-save-sheets').checked;


    const options = {
        companyId,
        credentials,
        startDate,
        timeout: timeoutSec * 1000,
        saveToSheets: saveToSheets,
        profileName: document.getElementById('run-profile-name').value,
        useTestData: useTestData,
        key: document.getElementById('master-key').value,
        filename: document.getElementById('custom-filename').value
    };

    try {
        const results = await api.scrape(options);
        const response = results;

        if (!response.success) {
            throw new Error(response.error || 'Scrape failed');
        }

        const transactions = response.data;

        // Track current result
        state.currentResult = {
            companyId,
            name: document.getElementById('run-profile-name').value,
            sheetUrl: response.sheetUrl,
            savedFiles: response.savedFiles
        };

        const li = document.createElement('li');
        li.style.fontWeight = 'bold';
        li.style.marginTop = '10px';
        li.style.color = '#28a745';
        li.innerHTML = '✅ All steps completed successfully. Raw data received.';
        resultDiv.querySelector('ul').appendChild(li);
        resultDiv.className = 'result-box success';

        if (transactions && transactions.length > 0) {
            // Flatten multi-account data if needed
            const flatTransactions = flattenMultiAccountData(transactions);
            state.lastCsvData = arrayToCsv(flatTransactions);

            // Store everything in state
            state.currentResult.data = flatTransactions;
            state.lastResultFiles = response.savedFiles;

            document.getElementById('csv-container').style.display = 'block';
            ui.renderTable(state.lastCsvData);
        } else {
            ui.showToast('No transactions found.', 'info');
        }
    } catch (e) {
        resultDiv.textContent = 'Request failed: ' + e.message;
        resultDiv.className = 'result-box error';
    } finally {
        ui.setProgress(false);
    }
}

export async function runBulkScrape() {
    const key = document.getElementById('master-key').value;
    if (!key) return ui.showToast("Encryption key required for bulk run", 'error');

    const resultDiv = document.getElementById('bulk-result');
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<strong>Bulk Execution Logs:</strong>';
    resultDiv.className = 'result-box';
    currentResultDiv = resultDiv;
    ui.setProgress(true);

    document.getElementById('csv-container').style.display = 'none';
    const bulkSummary = document.getElementById('bulk-summary-container');
    if (bulkSummary) bulkSummary.style.display = 'none';

    const startDate = document.getElementById('setup-startDate').value;
    const timeoutSec = parseInt(document.getElementById('setup-timeout').value) || 60;
    const saveToSheets = document.getElementById('bulk-save-sheets').checked;
    const filename = document.getElementById('custom-filename').value;
    const useTestData = document.getElementById('useTestData').checked;

    ui.showToast('Starting bulk scrape...', 'info');
    const bulkLog = document.getElementById('bulk-log');
    if (bulkLog) bulkLog.textContent = 'Initializing...';
    document.getElementById('bulk-result').innerHTML = ''; // Clear prev logs
    document.getElementById('csv-container').style.display = 'none';

    try {
        const results = await api.runBulkScrapeApi({
            key,
            startDate,
            timeout: timeoutSec * 1000,
            saveToSheets,
            filename,
            useTestData: useTestData
        });
        state.allBulkResults = results;

        if (results && results.length > 0) {
            ui.renderBulkSummary(results, switchBulkResult);
            ui.showToast('Bulk scrape completed', 'success'); // simple msg
        } else {
            ui.showToast('toast_bulk_none', 'info');
        }
    } catch (e) {
        resultDiv.textContent = 'Bulk request failed: ' + e.message;
        resultDiv.className = 'result-box error';
    } finally {
        ui.setProgress(false);
    }
}

function switchBulkResult(index) {
    const res = state.allBulkResults[index];
    if (!res) return;

    state.currentResult = res;
    state.lastResultFiles = res.savedFiles;
    state.lastCsvData = res.csv || null;

    document.getElementById('csv-container').style.display = 'block';

    if (res.csv) {
        ui.renderTable(res.csv);
        // Only scroll if we actually have data to show? Or always?
        // document.getElementById('csv-container').scrollIntoView({ behavior: 'smooth' });
    } else {
        document.getElementById('table-container').innerHTML = '<p style="padding:20px; text-align:center; color:#666;">No data available for this profile (Scrape failed or empty).</p>';
    }
}

export async function uploadPostRun(type) {
    // Only require data, not file
    if (!state.currentResult || !state.currentResult.data) return ui.showToast('No data to upload.', 'warning');

    const btn = event.target; // Relying on event
    const originalText = btn.textContent;
    btn.textContent = 'Uploading...';
    btn.disabled = true;

    // Use name from result or fallback
    const res = state.currentResult;
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `${res.companyId || 'bank'}_${res.name || 'profile'}_${dateStr}`;

    const customName = ui.getComputedFilename(res.companyId, res.name, null);

    try {
        const body = {
            filename, // Still send a filename for naming the sheet
            type,
            data: res.data // Send actual data
        };
        //const data = await api.uploadResultApi(body);
        if (customName) body.filename = customName;
        const data = await api.uploadResultApi(body);
        if (data.success) {
            ui.showToast('toast_upload_success', 'success');
            if (data.sheetUrl) window.open(data.sheetUrl, '_blank');
        } else {
            ui.showToast('Upload failed: ' + data.error, 'error');
        }
    } catch (e) {
        ui.showToast('Error: ' + e.message, 'error');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

export function downloadCsv() {
    // Determine format
    const format = document.getElementById('export-format').value || 'csv';
    let dataToDownload = '';
    let suffix = '';

    if (format === 'csv') {
        if (!state.lastCsvData) {
            ui.showToast('No CSV data available. Please run a scrape first.', 'warning');
            return;
        }
        dataToDownload = state.lastCsvData;
    } else {
        // We need source data
        let transactions = [];
        if (state.currentResult && state.currentResult.data) {
            transactions = state.currentResult.data;
        } else if (state.allBulkResults && state.allBulkResults.length > 0) {
            // Try getting from picker
            const picker = document.getElementById('bulk-result-picker');
            if (picker) {
                const idx = parseInt(picker.value);
                if (state.allBulkResults[idx]) transactions = state.allBulkResults[idx].data;
            }
        }

        if (!transactions || transactions.length === 0) {
            ui.showToast('No data available for export', 'warning');
            return;
        }

        if (format === 'firefly') {
            dataToDownload = convertToFirefly(transactions);
            suffix = '_firefly';
        } else if (format === 'ynab') {
            dataToDownload = convertToYnab(transactions);
            suffix = '_ynab';
        }
    }

    const base = state.currentResult ? ui.getComputedFilename(state.currentResult.companyId, state.currentResult.name) : 'scraped_data';
    // Remove extension if present in base to append correctly or just replace suffix
    let fileName = base.replace(/\.csv$/i, '');
    fileName = `${fileName}${suffix}.csv`;

    if (!dataToDownload) {
        ui.showToast('Export generation failed (empty result)', 'error');
        return;
    }

    const blob = new Blob([dataToDownload], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', fileName);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

export function unifiedRun() {
    const companyId = document.getElementById('companyId').value;
    if (companyId) {
        runScrape();
    } else {
        runBulkScrape();
    }
}

export async function saveFolderId() {
    const folderId = document.getElementById('folderId').value;
    if (!folderId) return ui.showToast('Please enter a Folder ID', 'error');
    try {
        const data = await api.saveDriveConfig({ folderId });
        if (data.success) ui.showToast('Folder ID saved successfully!', 'success');
        else ui.showToast('Save failed: ' + data.error, 'error');
    } catch (e) {
        ui.showToast('Error: ' + e.message, 'error');
    }
}

export async function saveConfig() {
    const serviceAccountJson = document.getElementById('serviceAccountJson').value; // Legacy
    const folderId = document.getElementById('folderId').value;
    const resultDiv = document.getElementById('config-result');
    try {
        const data = await api.saveDriveConfig({ serviceAccountJson, folderId });
        resultDiv.style.display = 'block';
        resultDiv.textContent = data.message || data.error;
        resultDiv.className = data.success ? 'result-box success' : 'result-box error';
    } catch (e) {
        resultDiv.style.display = 'block';
        resultDiv.textContent = e.message;
        resultDiv.className = 'result-box error';
    }
}

export async function testConfig() {
    const folderId = document.getElementById('folderId').value;
    const resultDiv = document.getElementById('config-result');
    resultDiv.style.display = 'block';
    resultDiv.textContent = 'Testing connection...';
    try {
        const data = await api.testConnection({ folderId });
        resultDiv.textContent = data.message || data.error;
        resultDiv.className = data.success ? 'result-box success' : 'result-box error';
    } catch (e) {
        resultDiv.textContent = 'Test failed: ' + e.message;
        resultDiv.className = 'result-box error';
    }
}

// Export to window for HTML onclicks
window.showTab = ui.showTab;
window.unifiedRun = unifiedRun;
window.saveFolderId = saveFolderId;
window.testConfig = testConfig;
// window.saveConfig = saveConfig; // Legacy, kept if needed
window.disconnectAuth = auth.disconnectAuth;
window.startOAuthFlow = auth.startOAuthFlow;
window.exchangeAndSaveOAuth = auth.exchangeAndSaveOAuth;
// uploadPostRun needs event?
window.uploadPostRun = uploadPostRun;
window.downloadCsv = downloadCsv;
window.loadProfile = loadProfile;
window.deleteProfile = deleteProfile;
window.setLanguage = ui.setLanguage;
window.toggleSaveOptions = ui.toggleSaveOptions;
window.clearSelection = ui.clearSelection;

window.updateSheetsToggle = ui.updateSheetsToggle;
window.updateSheetsToggle = ui.updateSheetsToggle;
window.switchBulkResult = switchBulkResult;
window.saveAiSettings = saveAiSettings;
window.categorizeNow = categorizeNow;
window.addCategory = addCategory;
window.removeCategory = removeCategory;
window.addFilterRule = addFilterRule;
window.removeFilterRule = removeFilterRule;
window.saveAppSetting = saveAppSetting;


// --- Filtering Logic ---
// --- Filtering Logic ---

export async function addFilterRule() {
    const field = document.getElementById('filter-field').value;
    const operator = document.getElementById('filter-operator').value;
    const value = document.getElementById('filter-value').value;

    if (!value) {
        ui.showToast('Please enter a value', 'error');
        return;
    }

    if (!appSettings.exclusionRules) appSettings.exclusionRules = [];
    appSettings.exclusionRules.push({ field, operator, value });

    await api.saveSetting('exclusionRules', appSettings.exclusionRules);
    renderRulesList();
    document.getElementById('filter-value').value = '';
    ui.showToast('Rule added', 'success');
}

export async function removeFilterRule(index) {
    if (!appSettings.exclusionRules) return;
    appSettings.exclusionRules.splice(index, 1);
    await api.saveSetting('exclusionRules', appSettings.exclusionRules);
    renderRulesList();
    ui.showToast('Rule removed', 'success');
}

function renderRulesList() {
    const container = document.getElementById('rules-list');
    if (!container) return;

    if (!appSettings.exclusionRules || appSettings.exclusionRules.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#666;" data-i18n="no_rules">No active exclusion rules.</div>';
        return;
    }

    let html = '<div style="display:flex; flex-direction:column; gap:8px;">';
    appSettings.exclusionRules.forEach((rule, idx) => {
        html += `
            <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:8px 12px; border-radius:4px; border:1px solid #e2e8f0;">
                <div>
                    <span style="font-weight:600; color:#475569;">${rule.field}</span>
                    <span style="color:#94a3b8; margin:0 5px;">${rule.operator}</span>
                    <span style="font-family:monospace; background:#e2e8f0; padding:2px 6px; border-radius:4px;">${rule.value}</span>
                </div>
                <button onclick="window.removeFilterRule(${idx})" class="subtle" style="color:#ef4444; padding:4px 8px; font-size:0.8em;">Remove</button>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

// Listeners
document.addEventListener('DOMContentLoaded', () => {
    init();

    // Debug Toggle Listener
    const debugCheckbox = document.getElementById('debug-use-existing');
    if (debugCheckbox) {
        debugCheckbox.addEventListener('change', ui.updateDebugToggle);
        ui.updateDebugToggle(); // Init state
    }

    // Init other toggles
    ui.updateSheetsToggle();
    ui.updateSaveToggle();

    // Event listeners
    document.getElementById('companyId').addEventListener('change', (e) => {
        ui.renderForm(e.target.value);
        const regDetails = document.getElementById('registration-details');
        if (e.target.value) {
            regDetails.style.display = 'block';
            document.getElementById('save-profile-section').style.display = 'block';
            document.getElementById('profile-actions').style.display = 'flex';
            const runName = document.getElementById('run-profile-name');
            if (!runName.value) {
                const option = e.target.options[e.target.selectedIndex];
                runName.value = option.text;
            }
        } else {
            regDetails.style.display = 'none';
            document.getElementById('save-profile-section').style.display = 'none';
            document.getElementById('profile-actions').style.display = 'none';
        }
        ui.updateExpectedFilename();
        ui.updateRunButton();
    });

    document.getElementById('custom-filename').addEventListener('input', () => {
        saveAppSetting('filePattern', document.getElementById('custom-filename').value);
        ui.updateExpectedFilename();
    });
    document.getElementById('run-profile-name').addEventListener('input', ui.updateExpectedFilename);
});
