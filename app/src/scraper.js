
import { createScraper } from 'israeli-bank-scrapers';
import fs from 'fs';

export async function runScraper(options) {
    try {
        const scraper = createScraper(options);
        const scrapeResult = await scraper.scrape(options.credentials);

        if (scrapeResult.success) {
            console.log(`Scraping successful for ${options.companyId}`);
            // Save result to file for drive upload
            const fileName = `scrape_result_${options.companyId}_${Date.now()}.json`;
            fs.writeFileSync(fileName, JSON.stringify(scrapeResult.accounts, null, 2));
            return { success: true, fileName };
        } else {
            console.error(`Scraping failed for ${options.companyId}:`, scrapeResult.errorType, scrapeResult.errorMessage);
            return { success: false, error: scrapeResult.errorMessage };
        }
    } catch (e) {
        console.error(`Scraper execution error: ${e.message}`);
        return { success: false, error: e.message };
    }
}
