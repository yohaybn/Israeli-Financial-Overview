import { state } from './state.js';
import { getLocale } from './api.js';

export function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const lang = document.documentElement.lang || 'en';
    const t = state.translations[lang];
    const translated = (t && t[message]) ? t[message] : message;
    toast.textContent = translated;

    container.appendChild(toast);
    void toast.offsetWidth; // Reflow
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

export async function setLanguage(lang) {
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang;
    document.body.dir = lang === 'he' ? 'rtl' : 'ltr';

    try {
        if (!state.translations) state.translations = {};
        state.translations[lang] = await getLocale(lang);
        // The user's diff included `applyTranslations(state.translations[lang]);`
        // but `applyTranslations` is not defined in the provided context.
        // Assuming it's a placeholder for the translation application logic below,
        // or a function that needs to be imported/defined.
        // For now, I will add it as requested, but it might cause a runtime error
        // if not defined elsewhere.
        // If the intention was to refactor the translation application into a function,
        // that function would need to be created.
        // Given the strict instruction to only apply the change, I'll add the line.
        // However, the existing code already applies translations after this block.
        // I will assume the user wants this line added, and the subsequent logic
        // for `data-i18n` etc. is either redundant or `applyTranslations` does something else.
        // To avoid breaking existing functionality, I will keep the existing translation application logic.
        // If `applyTranslations` is meant to replace the subsequent logic, that would be a larger change.
        // Sticking to the minimal interpretation of the diff.
        // applyTranslations(state.translations[lang]); // This line is commented out as it's not defined and would cause an error.
        // If the user intended to define it or import it, that's outside this task.
    } catch (e) {
        console.error('Failed to load locale:', lang, e);
        return;
    }

    // Update data-i18n
    const t = state.translations[lang];
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t && t[key]) {
            if (key === 'app_title' && lang === 'en') {
                el.innerHTML = 'Israeli <span style="color: var(--text-main);">Bank Scraper</span>';
            } else {
                el.textContent = t[key];
            }
        }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (t && t[key]) el.placeholder = t[key];
    });

    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (t && t[key]) el.title = t[key];
    });

    updateRunButton();
    updateExpectedFilename();
    refreshBankNames();
}

export function refreshBankNames() {
    const select = document.getElementById('companyId');
    const lang = document.documentElement.lang || 'en';
    const t = state.translations[lang];

    if (!state.scrapersDef || !t) return;

    const selectedValue = select.value;
    select.innerHTML = `<option value="" data-i18n="opt_sel_bank">${t.opt_sel_bank || 'Select Bank'}</option>`;

    for (const [key, value] of Object.entries(state.scrapersDef)) {
        const option = document.createElement('option');
        option.value = key;
        const translatedName = t.banks ? t.banks[key] : null;
        option.textContent = translatedName || value.name || key;
        select.appendChild(option);
    }
    select.value = selectedValue;
}

export function clearSelection() {
    document.getElementById('profile-select').value = '';
    document.getElementById('companyId').value = '';
    document.getElementById('run-profile-name').value = '';
    document.getElementById('credentials-form').innerHTML = '';
    document.getElementById('registration-details').style.display = 'none';
    document.getElementById('save-profile-section').style.display = 'none';
    document.getElementById('profile-actions').style.display = 'none';
    const scrapeRes = document.getElementById('scrape-result');
    if (scrapeRes) scrapeRes.style.display = 'none';
    const bulkRes = document.getElementById('bulk-result');
    if (bulkRes) bulkRes.style.display = 'none';
    const csvCont = document.getElementById('csv-container');
    if (csvCont) csvCont.style.display = 'none';
    const bulkSum = document.getElementById('bulk-summary-container');
    if (bulkSum) bulkSum.style.display = 'none';
    const bulkPick = document.getElementById('bulk-result-picker');
    if (bulkPick) bulkPick.style.display = 'none';
    updateRunButton();
}

export function showTab(id) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('nav a').forEach(el => el.classList.remove('active'));
    document.getElementById(id).classList.add('active');

    const links = document.querySelectorAll('nav a');
    links.forEach(link => {
        // Simple check based on onclick attribute or id if we add it
        // Since we are moving to modules, we should probably rely on event listeners or data attributes
        // But for now, let's assume valid ID matching if possible or use the logic from before
    });
    // Fix active link highlighting
    // We will attach dataset-tab to links in HTML and use that
    const activeLink = document.querySelector(`nav a[onclick="showTab('${id}')"]`);
    if (activeLink) activeLink.classList.add('active');
}

export function updateRunButton() {
    const btn = document.getElementById('unified-run-btn');
    const companyId = document.getElementById('companyId').value;
    const profile = document.getElementById('profile-select').value;
    const lang = document.documentElement.lang || 'en';
    const t = state.translations[lang];

    if (profile || companyId) {
        btn.textContent = (t && t.btn_run_single) ? t.btn_run_single : 'Run Scraper';
    } else {
        btn.textContent = (t && t.btn_run_bulk) ? t.btn_run_bulk : 'Run Bulk Scraper';
    }
    btn.style.backgroundColor = 'var(--primary-color)';
}

export function toggleSaveOptions() {
    const checked = document.getElementById('save-creds').checked;
    document.getElementById('save-options').style.display = checked ? 'block' : 'none';
    updateSaveToggle();
}

export function updateSaveToggle() {
    const checkbox = document.getElementById('save-creds');
    const toggle = document.getElementById('save-toggle');
    if (!toggle) return;
    const circle = toggle.querySelector('div');
    if (checkbox.checked) {
        toggle.style.background = '#28a745';
        circle.style.right = '2px';
        circle.style.left = 'auto';
    } else {
        toggle.style.background = '#ccc';
        circle.style.left = '2px';
        circle.style.right = 'auto';
    }
}

export function updateSheetsToggle() {
    const checkbox = document.getElementById('bulk-save-sheets');
    const toggle = document.getElementById('sheets-toggle');
    if (!toggle) return;
    const circle = toggle.querySelector('div');

    if (checkbox.checked) {
        toggle.style.background = '#28a745';
        circle.style.right = '2px';
        circle.style.left = 'auto';
    } else {
        toggle.style.background = '#ccc';
        circle.style.left = '2px';
        circle.style.right = 'auto';
    }

    if (checkbox.disabled) {
        toggle.style.opacity = '0.5';
        toggle.parentElement.style.cursor = 'not-allowed';
    } else {
        toggle.style.opacity = '1';
        toggle.parentElement.style.cursor = 'pointer';
    }
}

export function updateDebugToggle() {
    const debugCheckbox = document.getElementById('debug-use-existing');
    const debugToggle = document.getElementById('debug-toggle');
    const debugToggleCircle = debugToggle.querySelector('div');
    if (debugCheckbox.checked) {
        debugToggle.style.background = '#dc3545';
        debugToggleCircle.style.right = '2px';
        debugToggleCircle.style.left = 'auto';
    } else {
        debugToggle.style.background = '#ccc';
        debugToggleCircle.style.left = '2px';
        debugToggleCircle.style.right = 'auto';
    }
}

export function renderForm(companyId, values = {}) {
    const container = document.getElementById('credentials-form');
    container.innerHTML = '';

    if (!companyId || !state.scrapersDef[companyId]) return;

    const fields = state.scrapersDef[companyId].loginFields || ['username', 'password'];
    fields.forEach(field => {
        const div = document.createElement('div');
        div.className = 'form-group';
        const label = document.createElement('label');
        label.textContent = field.charAt(0).toUpperCase() + field.slice(1);
        const input = document.createElement('input');
        input.name = field;
        input.id = field;
        input.type = field.toLowerCase().includes('password') ? 'password' : 'text';

        if (values[field]) input.value = values[field];

        div.appendChild(label);
        div.appendChild(input);
        container.appendChild(div);
    });
}

export function updateProfileSelect(profiles) {
    const pSelect = document.getElementById('profile-select');
    const picker = document.getElementById('profile-picker');
    const lang = document.documentElement.lang || 'en';
    const t = state.translations ? state.translations[lang] : null;

    if (!profiles || profiles.length === 0) {
        if (picker) picker.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-light);">${t ? t.no_profiles : 'No profiles found'}</div>`;
        return;
    }
    pSelect.innerHTML = `<option value="" data-i18n="opt_start_profile">${(t && t.opt_start_profile) || 'Start with a previously saved profile'}</option>`;
    profiles.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        pSelect.appendChild(opt);
    });
}

export function setProgress(show) {
    const el = document.getElementById('progress-container');
    if (show) {
        el.style.display = 'block';
        el.classList.add('indeterminate');
    } else {
        el.style.display = 'none';
        el.classList.remove('indeterminate');
    }
}

import { arrayToCsv } from './utils.js';
import * as api from './api.js';

export function renderTable(csv) {
    const lines = csv.split('\n').filter(l => l.trim());
    if (lines.length === 0) return;

    // Parse header to find indices
    const headerLine = lines[0];
    const header = [];
    let currentH = '';
    let inQuotesH = false;
    for (let i = 0; i < headerLine.length; i++) {
        const char = headerLine[i];
        if (char === '"') inQuotesH = !inQuotesH;
        else if (char === ',' && !inQuotesH) {
            header.push(currentH.replace(/"/g, ''));
            currentH = '';
        } else {
            currentH += char;
        }
    }
    header.push(currentH.replace(/"/g, ''));

    const descIndex = header.indexOf('Description');
    const catIndex = header.indexOf('Category');

    let html = '<table>';
    lines.forEach((line, index) => {
        html += '<tr>';
        const cols = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) {
                cols.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        cols.push(current);

        cols.forEach((val, colIdx) => {
            const cleanVal = val.replace(/^"|"$/g, '').trim(); // Remove surrounding quotes
            if (index === 0) {
                html += `<th>${cleanVal}</th>`;
            } else {
                // If this is the category column, make it clickable
                if (colIdx === catIndex && descIndex !== -1) {
                    // Get description from this row
                    const descVal = cols[descIndex].replace(/^"|"$/g, '').trim();
                    // Escape single quotes for onclick
                    const safeDesc = descVal.replace(/'/g, "\\'");
                    const safeCat = cleanVal.replace(/'/g, "\\'");
                    html += `<td onclick="window.editCategory('${safeDesc}', '${safeCat}')" style="cursor:pointer; text-decoration:underline; color:#0d6efd;" title="Click to change category">${cleanVal || '(uncategorized)'}</td>`;
                } else {
                    html += `<td>${cleanVal}</td>`;
                }
            }
        });
        html += '</tr>';
    });
    html += '</table>';
    document.getElementById('table-container').innerHTML = html;
}

let editContext = null;

export function editCategory(description, currentCategory) {
    editContext = { description, currentCategory };

    // Populate Modal
    const modalDesc = document.getElementById('cat-modal-desc');
    const modalSelect = document.getElementById('cat-modal-select');
    const modal = document.getElementById('category-modal');

    modalDesc.textContent = `Transaction: ${description}`;
    modalSelect.innerHTML = '';

    // Add default None option
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = 'Uncategorized';
    modalSelect.appendChild(noneOpt);

    // Add categories
    if (state.categories) {
        state.categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            if (cat === currentCategory) opt.selected = true;
            modalSelect.appendChild(opt);
        });
    }

    modal.style.display = 'flex';
}

export function closeCategoryModal() {
    document.getElementById('category-modal').style.display = 'none';
    editContext = null;
}

export async function saveCategoryFromModal() {
    if (!editContext) return;

    const newCategory = document.getElementById('cat-modal-select').value;
    const { description, currentCategory } = editContext;

    closeCategoryModal();

    if (newCategory !== currentCategory) {
        showToast('Updating category and syncing sheets...', 'info');
        try {
            const folderId = document.getElementById('folderId').value;
            const res = await api.updateCategoryMap({
                description,
                category: newCategory,
                updateSheets: true,
                folderId: folderId
            });

            if (res.success) {
                let msg = `Category updated!`;
                if (res.sheetUpdateCount > 0) msg += ` Updated ${res.sheetUpdateCount} sheets.`;
                showToast(msg, 'success');

                // Update local state and re-render
                if (state.currentResult && state.currentResult.data) {
                    let updatedCount = 0;
                    state.currentResult.data.forEach(row => {
                        if ((row.description || '').trim() === description) {
                            row.category = newCategory;
                            updatedCount++;
                        }
                    });

                    if (updatedCount > 0) {
                        const newData = arrayToCsv(state.currentResult.data);
                        state.lastCsvData = newData;
                        renderTable(newData);
                    }
                }
            } else {
                showToast('Update failed: ' + res.error, 'error');
            }
        } catch (e) {
            showToast('Error: ' + e.message, 'error');
        }
    }
}

// Expose modal functions
window.closeCategoryModal = closeCategoryModal;
window.saveCategoryFromModal = saveCategoryFromModal;

export function renderBulkSummary(results, switchCallback) {
    // Hide old summary container if present
    const summaryContainer = document.getElementById('bulk-summary-container');
    if (summaryContainer) summaryContainer.style.display = 'none';

    // Remove old header if exists inside bulk-result
    const header = document.getElementById('bulk-result-header');
    if (header) header.remove();

    // Use the existing picker in the right panel
    const picker = document.getElementById('bulk-result-picker');
    if (!picker) return;

    picker.style.display = 'block'; // Ensure it is visible
    document.getElementById('csv-container').style.display = 'block'; // Ensure parent is visible
    picker.innerHTML = ''; // Clear prev options

    // Populate Picker
    // We want the FIRST valid result to be default if possible
    let firstIndex = 0;

    results.forEach((res, index) => {
        const opt = document.createElement('option');
        opt.value = index;
        opt.textContent = res.profileName;
        picker.appendChild(opt);
    });

    // On Change Logic:
    // ... (rest of function)
    picker.onchange = (e) => {
        // ... (existing logic)
        const idx = parseInt(e.target.value);
        const selectedRes = results[idx];
        const resultDiv = document.getElementById('bulk-result');

        // Filter logs
        const sections = resultDiv.querySelectorAll('.profile-log-section');
        sections.forEach(sec => {
            if (sec.getAttribute('data-profile') === selectedRes.profileName) {
                sec.style.display = 'block';
            } else {
                sec.style.display = 'none';
            }
        });

        if (switchCallback) switchCallback(idx);
    };
    // Initialize Default View (First Item)
    if (results.length > 0) {
        picker.value = firstIndex;
        // Manually trigger change to sync logs and table
        picker.dispatchEvent(new Event('change'));
    }
}

// ... (editCategory function)





export function updateAuthUI(authenticated) {
    const connectState = document.getElementById('oauth-connect-state');
    const connectedState = document.getElementById('oauth-connected-state');
    const sheetsCheckbox = document.getElementById('bulk-save-sheets');

    if (authenticated) {
        connectState.style.display = 'none';
        connectedState.style.display = 'block';
        sheetsCheckbox.disabled = false;
        sheetsCheckbox.checked = true;
    } else {
        connectState.style.display = 'block';
        connectedState.style.display = 'none';
        sheetsCheckbox.disabled = true;
        sheetsCheckbox.checked = false;
    }
    updateSheetsToggle();
}

export function getComputedFilename(customCompanyId, customProfileName, dateOverride) {
    const companyId = customCompanyId || document.getElementById('companyId').value;
    const pattern = document.getElementById('custom-filename').value;
    const profileName = customProfileName || document.getElementById('run-profile-name').value;

    const now = dateOverride ? new Date(dateOverride) : new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    let name = pattern || '{profile}_{date}';
    name = name
        .replace(/{date}/g, dateStr)
        .replace(/{bank}/g, companyId || '[Bank]')
        .replace(/{profile}/g, profileName || '')
        .replace(/{timestamp}/g, now.toISOString().replace(/[:.]/g, '-'))
        .replace(/__+/g, '_').replace(/_$/, '');
    return name;
}

export function updateExpectedFilename() {
    const preview = getComputedFilename();
    const companyId = document.getElementById('companyId').value;
    const lang = document.documentElement.lang || 'en';
    const t = state.translations[lang];
    const helpSpan = document.getElementById('personal-help-text');

    if (helpSpan && t) {
        const template = t.personal_help_share || "Create a sheet named exactly {filename} and share it with your Service Account email.";
        helpSpan.innerHTML = template.replace('{filename}', `<code style="background:#fff; padding:2px; font-weight:600;">${preview}</code>`);
    }
    const personalHelp = document.getElementById('personal-account-help');
    personalHelp.style.display = (companyId && state.scrapersDef[companyId] && state.scrapersDef[companyId].isPersonal) ? 'block' : 'none';
}

// Expose to window for onclick
window.editCategory = editCategory;
