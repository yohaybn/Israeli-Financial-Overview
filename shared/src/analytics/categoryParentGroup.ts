/**
 * Maps a spending category label to a stable parent-group key for hierarchical charts.
 * Covers Hebrew defaults, English aliases, and light heuristics for custom labels.
 */
export type CategoryParentGroupKey =
    | 'housing'
    | 'lifestyle'
    | 'mobility'
    | 'wellbeing'
    | 'education'
    | 'essentials'
    | 'finance'
    | 'other';

const EXACT: Record<string, CategoryParentGroupKey> = {
    Housing: 'housing',
    דיור: 'housing',
    מגורים: 'housing',
    'Mortgage & Loans': 'housing',
    'Mortgage and Loans': 'housing',
    משכנתא: 'housing',
    'משכנתא והלוואות': 'housing',
    'Food & Dining': 'lifestyle',
    מזון: 'lifestyle',
    Entertainment: 'lifestyle',
    'פנאי ובידור': 'lifestyle',
    בילויים: 'lifestyle',
    Shopping: 'lifestyle',
    קניות: 'lifestyle',
    Gifts: 'lifestyle',
    מתנות: 'lifestyle',
    Transport: 'mobility',
    תחבורה: 'mobility',
    Travel: 'mobility',
    'חופשות וטיולים': 'mobility',
    Health: 'wellbeing',
    בריאות: 'wellbeing',
    Insurance: 'wellbeing',
    ביטוח: 'wellbeing',
    Education: 'education',
    חינוך: 'education',
    Utilities: 'essentials',
    חשבונות: 'essentials',
    Subscriptions: 'essentials',
    מנויים: 'essentials',
    Income: 'finance',
    הכנסה: 'finance',
    Salary: 'finance',
    משכורת: 'finance',
    Investments: 'finance',
    השקעות: 'finance',
    Other: 'other',
    אחר: 'other',
    'ללא קטגוריה': 'other',
};

const GROUP_ORDER: CategoryParentGroupKey[] = [
    'housing',
    'lifestyle',
    'mobility',
    'wellbeing',
    'education',
    'essentials',
    'finance',
    'other',
];

export function getCategoryParentGroupKey(category: string): CategoryParentGroupKey {
    const fromExact = EXACT[category];
    if (fromExact) return fromExact;

    const s = category.trim();

    if (/mortgage|loan|rent|housing|דיור|מגורים|משכנת|שכירות|בית|utilities.*home/i.test(s)) return 'housing';
    if (/food|dining|grocery|restaurant|entertainment|shopping|gift|מזון|קניות|בילוי|מתנות|פנאי/i.test(s)) {
        return 'lifestyle';
    }
    if (/transport|travel|commute|תחבורה|טיול|חופשה|flight|fuel|parking/i.test(s)) return 'mobility';
    if (/health|medical|dental|pharm|insurance|בריאות|ביטוח|רפוא/i.test(s)) return 'wellbeing';
    if (/school|education|course|university|חינוך|לימוד/i.test(s)) return 'education';
    if (/utility|utilities|bill|subscription|electric|water|gas|internet|phone|חשבון|מנוי|סלולר|אינטרנט/i.test(s)) {
        return 'essentials';
    }
    if (/salary|income|investment|dividend|משכורת|הכנסה|השקעה/i.test(s)) return 'finance';

    return 'other';
}

export const CATEGORY_PARENT_GROUP_ORDER = GROUP_ORDER;
