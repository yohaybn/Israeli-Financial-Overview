import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getHelpManualText(): string {
    const assetsDir = path.join(__dirname, '..', 'assets', 'help');
    
    let manualText = '';
    let functionsText = '';
    
    try {
        manualText = fs.readFileSync(path.join(assetsDir, 'user_manual.md'), 'utf-8');
    } catch (e) {
        console.error('Failed to load user_manual.md', e);
    }
    
    try {
        functionsText = fs.readFileSync(path.join(assetsDir, 'functions_list.md'), 'utf-8');
    } catch (e) {
        console.error('Failed to load functions_list.md', e);
    }

    let guideText = '';
    try {
        const guideBundled = path.join(assetsDir, 'GUIDE.html');
        const guideFromClient = path.join(__dirname, '..', '..', '..', 'client', 'public', 'GUIDE.html');
        const guidePath = fs.existsSync(guideBundled) ? guideBundled : guideFromClient;
        const guideHtml = fs.readFileSync(guidePath, 'utf-8');
        // A very basic HTML to text stripping, since Gemini can read HTML fine, but text is cheaper
        guideText = guideHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove styles
                             .replace(/<[^>]+>/g, ' ') // Remove tags
                             .replace(/\s+/g, ' ') // Collapse whitespace
                             .trim();
    } catch (e) {
        console.error('Failed to load GUIDE.html', e);
    }

    return `
=== USER MANUAL ===
${manualText}

=== FUNCTIONS LIST & DEEPLINKS ===
${functionsText}

=== ADDITIONAL GUIDE ===
${guideText}
    `.trim();
}
