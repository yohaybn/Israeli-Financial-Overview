import fs from 'fs-extra';
import puppeteer from 'puppeteer';

function getExecutablePath(): string | undefined {
    const standardPaths = [
        puppeteer.executablePath(),
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];
    for (const p of standardPaths) {
        if (p && fs.existsSync(p)) return p;
    }
    return undefined;
}

export async function htmlToPdfBuffer(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: getExecutablePath(),
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=medium'],
    });
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'domcontentloaded' });
        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '14mm', bottom: '16mm', left: '12mm', right: '12mm' },
        });
        return Buffer.from(pdf);
    } finally {
        await browser.close();
    }
}
