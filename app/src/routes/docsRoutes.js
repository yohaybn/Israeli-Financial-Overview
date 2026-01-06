import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..'); // Assuming src/routes is two levels deep

router.get('/docs', (req, res) => {
    const apiPath = path.join(projectRoot, 'API.md');
    fs.readFile(apiPath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading API Documentation');
        const host = req.get('host');
        const protocol = req.protocol;
        const fullHost = `${protocol}://${host}`;

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>API Reference</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 40px 20px; line-height: 1.6; color: #1f2937; background: #f9fafb; }
                pre { background: #111827; color: #f3f4f6; padding: 20px; overflow-x: auto; border-radius: 8px; position: relative; margin: 20px 0; }
                code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; font-size: 0.9em; }
                h1, h2, h3 { color: #1e40af; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-top: 40px; }
                blockquote { background: #eff6ff; padding: 15px 25px; border-left: 4px solid #3b82f6; margin: 20px 0; border-radius: 4px; }
                .copy-curl-btn {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    background: #3b82f6;
                    color: white;
                    border: none;
                    padding: 5px 12px;
                    border-radius: 4px;
                    font-size: 0.75rem;
                    cursor: pointer;
                    font-weight: 600;
                    transition: background 0.2s;
                }
                .copy-curl-btn:hover { background: #2563eb; }
                .copy-curl-btn.copied { background: #10b981; }
            </style>
        </head>
        <body>
            <div style="background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                ${marked(data)}
            </div>
            <script>
                document.querySelectorAll('pre').forEach(pre => {
                    const code = pre.querySelector('code');
                    if (!code) return;
                    
                    // Try to find the method and path in the preceding heading
                    let prev = pre.previousElementSibling;
                    let endpoint = "";
                    while (prev && !prev.tagName.startsWith('H')) {
                        prev = prev.previousElementSibling;
                    }
                    
                    if (prev && prev.innerText.includes('/')) {
                        endpoint = prev.innerText.trim();
                    }

                    if (endpoint) {
                        const btn = document.createElement('button');
                        btn.className = 'copy-curl-btn';
                        btn.innerText = 'Copy as cURL';
                        btn.onclick = () => {
                            const [method, path] = endpoint.split(' ');
                            const url = "${fullHost}" + path;
                            const json = code.innerText.trim();
                            
                            let curl = "curl -X " + method + " " + url;
                            curl += " -H \\"Content-Type: application/json\\"";
                            if (json && json.startsWith('{')) {
                                curl += " -d '" + json.replace(/'/g, "\\\\'") + "'";
                            }
                            
                            navigator.clipboard.writeText(curl).then(() => {
                                btn.innerText = 'Copied!';
                                btn.classList.add('copied');
                                setTimeout(() => {
                                    btn.innerText = 'Copy as cURL';
                                    btn.classList.remove('copied');
                                }, 2000);
                            });
                        };
                        pre.appendChild(btn);
                    }
                });
            </script>
        </body>
        </html>
        `;
        res.send(html);
    });
});

router.get('/readme', (req, res) => {
    const readmePath = path.join(projectRoot, 'README.md');
    fs.readFile(readmePath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading README');
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Documentation</title>
            <style>body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; } pre { background: #f4f4f4; padding: 10px; overflow-x: auto; } code { background: #f4f4f4; padding: 2px 5px; }</style>
        </head>
        <body>
            ${marked(data)}
        </body>
        </html>
        `;
        res.send(html);
    });
});

router.get('/readme-content', (req, res) => {
    const readmePath = path.join(projectRoot, 'README.md');
    fs.readFile(readmePath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading README');
        res.send(marked(data));
    });
});

export default router;
