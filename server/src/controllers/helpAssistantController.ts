import { Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getHelpManualText } from '../utils/helpManualText.js';

export const handleHelpChat = async (req: Request, res: Response) => {
    try {
        const { messages } = req.body;
        
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Valid messages array is required' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        const modelName = 'gemini-2.5-flash';

        if (!apiKey) {
            return res.status(400).json({ error: 'Gemini API Key is missing. Please configure it in the Environment Settings.' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });

        const manualText = getHelpManualText();

        const systemPrompt = `You are the official Help Assistant for the Israeli Bank Scraper app.
Your ONLY job is to help users understand how to use the app and answer technical/how-to questions.
Use the following User Manual to answer the user's questions:

<user_manual>
${manualText}
</user_manual>

Rules:
1. If the answer is not contained in the user manual, or you don't know, YOU MUST reply with: "I don't know the answer to that based on the documentation." (If the user asks in Hebrew, translate this exact phrase to Hebrew: "אינני יודע את התשובה לכך על סמך התיעוד."). Do not guess or hallucinate features.
2. Be concise and helpful. Give step-by-step instructions if needed.
3. Pay explicitly close attention to the EXACT Deep Link associated with each section. Do NOT return the link for "AI Settings" (\`configTab=ai\`) if the user is asking about a different configuration tab like Telegram. Always use the specific link shown for that precise topic.
4. Whenever possible, include the exact deep link (URL path) formatted as a Markdown link (e.g., \`[Open Telegram Settings](/?view=configuration&configTab=telegram)\`) in your answer to let the user click and navigate immediately.`;

        const geminiMessages = messages.map((m: any) => ({
            role: m.role === 'assistant' ? 'model' : m.role,
            parts: [{ text: m.content }]
        }));

        const chatContext = [
            { role: 'user', parts: [{ text: systemPrompt }] },
            { role: 'model', parts: [{ text: "Understood. I will follow the user manual." }] },
            ...geminiMessages
        ];

        const history = chatContext.slice(0, -1);
        const latestMessage = chatContext[chatContext.length - 1].parts[0].text;

        const chat = model.startChat({
            history: history
        });

        const result = await chat.sendMessage(latestMessage);
        const responseText = result.response.text();

        return res.json({ success: true, text: responseText });

    } catch (error: any) {
        console.error('Help Chat API Error:', error);
        return res.status(500).json({ error: error.message || 'Help Chat processing failed' });
    }
};
