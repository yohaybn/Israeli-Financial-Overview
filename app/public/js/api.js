// API Wrappers

export async function getAuthStatus() {
    const res = await fetch('/auth/status');
    return res.json();
}

export async function disconnectAuth() {
    const res = await fetch('/auth/disconnect', { method: 'POST' });
    return res.json();
}

export async function saveDriveConfig(data) {
    const res = await fetch('/config/drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return res.json();
}

export async function getDefinitions() {
    const res = await fetch('/definitions');
    return res.json();
}

export async function getProfiles() {
    const res = await fetch('/profiles');
    return res.json();
}

export async function getSettings() {
    const res = await fetch('/config/settings');
    return res.json();
}

export async function saveSetting(key, value) {
    await fetch('/config/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value })
    });
}

export async function deleteProfileApi(name) {
    const res = await fetch(`/profiles/${name}`, { method: 'DELETE' });
    return res.json();
}

export async function getProfile(name, key) {
    const res = await fetch(`/profiles/${name}?key=${encodeURIComponent(key)}`);
    return res.json();
}

export async function saveProfileApi(data) {
    const res = await fetch('/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return res.json(); // May return null if void, but backend usually sends json
}

export async function scrape(options) {
    const res = await fetch('/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options)
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Scrape failed');
    }
    return res.json();
}

export async function scrapeAll(options) {
    const res = await fetch('/scrape-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...options, verbose: true })
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server error ${res.status}: ${text.substring(0, 100)}`);
    }
    return res.json();
}

export async function runBulkScrapeApi(options) {
    return scrapeAll(options);
}

export async function uploadResultApi(body) {
    const res = await fetch('/upload-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return res.json();
}

export async function getAuthUrl(clientId, clientSecret, redirectUri) {
    const res = await fetch('/auth/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret, redirectUri })
    });
    return res.json();
}

export async function exchangeToken(code, clientId, clientSecret, redirectUri) {
    const res = await fetch('/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, clientId, clientSecret, redirectUri })
    });
    return res.json();
}

export async function saveOAuthConfig(data) {
    const res = await fetch('/config/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return res.json();
}

export async function testConnection(data) {
    const res = await fetch('/config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const text = await res.text();
        try {
            const json = JSON.parse(text);
            throw new Error(json.error || 'Server error ' + res.status);
        } catch (e) {
            throw new Error('Server returned ' + res.status + ': ' + text.substring(0, 100));
        }
    }
    return res.json();
}

export async function getLocale(lang) {
    const res = await fetch(`/locales/${lang}.json`);
    return res.json();
}

export async function categorizeTransactions({ transactions, filename }) {
    const res = await fetch('/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions, filename })
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Categorization failed');
    }
    return res.json();
}

export async function updateCategoryMap(data) {
    const res = await fetch('/categorize/update-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return res.json();
}
