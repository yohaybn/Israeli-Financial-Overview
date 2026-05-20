export type DemoAiFact = { id: string; text: string; createdAt: string; updatedAt: string };
export type DemoAiInsight = { id: string; text: string; score: number; createdAt: string; source?: string };
export type DemoAiAlert = { id: string; text: string; score: number; createdAt: string };

const now = () => new Date().toISOString();

export const demoMemoryFacts: DemoAiFact[] = [
    {
        id: 'demo-fact-1',
        text: 'משפחה בת 4 — שני ילדים בגן, תקציב מזון חודשי בערך 2,800 ₪.',
        createdAt: now(),
        updatedAt: now(),
    },
    {
        id: 'demo-fact-2',
        text: 'מטרה: להגדיל חיסכון לטווח ארוך ולעקוב אחר תיק המניות.',
        createdAt: now(),
        updatedAt: now(),
    },
];

export const demoMemoryInsights: DemoAiInsight[] = [
    {
        id: 'demo-insight-mem-1',
        text: 'הוצאות המזון יציבות ביחס לחודש הקודם — אין קפיצה חריגה.',
        score: 82,
        createdAt: now(),
        source: 'ai',
    },
];

export const demoMemoryAlerts: DemoAiAlert[] = [
    {
        id: 'demo-alert-1',
        text: 'חיוב דלק גבוה מהממוצע החודשי — כדאי לבדוק נסיעות חריגות.',
        score: 74,
        createdAt: now(),
    },
];

let insightCounter = demoMemoryInsights.length;
let factCounter = demoMemoryFacts.length;

export function demoChatReply(query: string, historyNote?: string): {
    response: string;
    factsAdded: number;
    insightsAdded: number;
    alertsAdded: number;
} {
    const q = query.trim();
    const lower = q.toLowerCase();
    let factsAdded = 0;
    let insightsAdded = 0;
    let alertsAdded = 0;
    let response: string;

    const monthHint = historyNote?.includes('month of')
        ? historyNote.split('month of ')[1]?.split('.')[0]?.trim()
        : undefined;

    if (/מזון|סופר|מכולת|food|grocery|supermarket/.test(lower)) {
        response =
            monthHint != null
                ? `בחודש **${monthHint}** הוצאות המזון בדמו נשארות בטווח הרגיל (רמי לוי, שופרסל, מסעדות). אין קפיצה חריגה לעומת חודשים קודמים.`
                : 'הוצאות המזון בדמו יציבות — רוב החיובים מרמי לוי, שופרסל ומסעדות, ללא קפיצה חריגה.';
        insightCounter += 1;
        demoMemoryInsights.unshift({
            id: `demo-insight-chat-${insightCounter}`,
            text: 'נשמר מצ׳אט: הוצאות מזון יציבות בחודש הנוכחי.',
            score: 76,
            createdAt: now(),
            source: 'ai',
        });
        insightsAdded = 1;
    } else if (/השקע|מניות|תיק|portfolio|stock|invest/.test(lower)) {
        response =
            'בדמו מוגדר תיק עם **AAPL**, **MSFT**, **NVDA** (דולר) ו-**TEVA** (בורסת ת״א). סיכום התיק מוצג בלוח ההשקעות — מחירים מדומים לצורך הדגמה בלבד.';
        factsAdded = 0;
        insightsAdded = 1;
        demoMemoryInsights.unshift({
            id: `demo-insight-chat-${++insightCounter}`,
            text: 'המשתמש מתעניין בתיק ההשקעות — כדאי להציג מגמות P&L חודשיות.',
            score: 70,
            createdAt: now(),
            source: 'ai',
        });
    } else if (/מנוי|subscription|נטפליקס|סלקום|spotify/.test(lower)) {
        response =
            'מנויים בדמו: נטפליקס, סלקום, ספוטיפיי וביטוח דירה. סה״כ כ־**280 ₪** לחודש — ניתן לסנן לפי `isSubscription` בטבלת העסקאות.';
        insightsAdded = 1;
        demoMemoryInsights.unshift({
            id: `demo-insight-chat-${++insightCounter}`,
            text: 'מנויים קבועים מזוהים בדמו — סכום חודשי נמוך יחסית להכנסה.',
            score: 65,
            createdAt: now(),
            source: 'ai',
        });
    } else if (/הכנס|שכר|income|salary/.test(lower)) {
        response =
            'הכנסות בדמו: שכר ראשי (~12–14k ₪), גמלת ילדים מביטוח לאומי, ושכר ממעסיק נוסף. רוב ההכנסה נכנסת בימים 1–20 בחודש.';
        factCounter += 1;
        demoMemoryFacts.push({
            id: `demo-fact-chat-${factCounter}`,
            text: 'נשמר מצ׳אט: שלושה מקורות הכנסה חודשיים בדמו.',
            createdAt: now(),
            updatedAt: now(),
        });
        factsAdded = 1;
    } else if (/דלק|רכב|car|fuel/.test(lower)) {
        response =
            'הוצאות רכב בדמו כוללות דלק (פז / דור אלון) ותחבורה ציבורית. יש **התראת דמו** על חיוב דלק גבוה מהממוצע — ראה AI Memory.';
        alertsAdded = 0;
        insightsAdded = 1;
    } else {
        response =
            'זוהי **תשובת הדגמה** המבוססת על נתוני הדמו. שאל על מזון, מנויים, הכנסות, השקעות או חודש ספציפי — ואשמור תובנות ל-AI Memory כשמתאים.\n\n' +
            'להפעלה מול הבנק וה-AI האמיתי, הרץ את האפליקציה המלאה עם שרת.';
    }

    return { response, factsAdded, insightsAdded, alertsAdded };
}
