import { memo } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
    ArrowLeftRight,
    Banknote,
    Briefcase,
    Car,
    CreditCard,
    Dumbbell,
    Film,
    GraduationCap,
    Heart,
    Home,
    Landmark,
    LayoutGrid,
    Music,
    Paintbrush,
    Receipt,
    Shirt,
    ShoppingBag,
    Smartphone,
    Utensils,
    Wifi,
} from 'lucide-react';
import { DEFAULT_EXPENSE_CATEGORY, expenseCategoryKey } from '@app/shared';

/** Maps canonical AI / UI category names to icons (Hebrew defaults + common English). */
const EXACT: Record<string, LucideIcon> = {
    [DEFAULT_EXPENSE_CATEGORY]: LayoutGrid,
    מזון: Utensils,
    תחבורה: Car,
    קניות: ShoppingBag,
    מנויים: CreditCard,
    בריאות: Heart,
    מגורים: Home,
    בילויים: Film,
    משכורת: Banknote,
    העברות: ArrowLeftRight,
    חשבונות: Receipt,
    ביגוד: Shirt,
    חינוך: GraduationCap,
    'משכנתא והלוואות': Landmark,
    'העברה פנימית': ArrowLeftRight,
    'Internal Transfer': ArrowLeftRight,
    'internal transfer': ArrowLeftRight,
    Food: Utensils,
    Transportation: Car,
    Shopping: ShoppingBag,
    Subscriptions: CreditCard,
    Health: Heart,
    Housing: Home,
    Entertainment: Film,
    Salary: Banknote,
    Transfers: ArrowLeftRight,
    Utilities: Receipt,
    Clothing: Shirt,
    Education: GraduationCap,
    Other: LayoutGrid,
    'Mortgage & Loans': Landmark,
    'Mortgage and Loans': Landmark,
};

/**
 * Returns a Lucide icon for a spending / income category name.
 * Uses the same canonical keys as {@link expenseCategoryKey}, then keyword heuristics.
 */
export function getCategoryLucideIcon(category?: string | null): LucideIcon {
    const raw = (category ?? '').trim();
    const key = expenseCategoryKey(category);

    const fromExact = EXACT[key] ?? EXACT[raw];
    if (fromExact) return fromExact;

    const haystack = `${raw} ${raw.toLowerCase()}`;

    if (/internal transfer|העברה פנימית|העברות פנימיות/i.test(haystack)) return ArrowLeftRight;

    if (/music|spotify|apple music|שיר|מוזיק/.test(haystack)) return Music;
    if (/video|netflix|stream|tv|disney|hbo|סרט|טלוויז/.test(haystack)) return Film;
    if (/phone|mobile|cell|pelephone|partner|golan|hot mobile|bezeq|internet|wifi|סלולר|טלפון|אינטרנט/.test(haystack)) {
        return Smartphone;
    }
    if (/gym|fitness|sport|כושר/.test(haystack)) return Dumbbell;
    if (/car|fuel|parking|דלק|רכב|חניה|תחבורה/.test(haystack)) return Car;
    if (/health|medical|insurance|bituach|בריאות|ביטוח|רפוא/.test(haystack)) return Heart;
    if (/home|rent|mortgage|דיור|שכירות|משכנתא|מגורים/.test(haystack)) return Home;
    if (/food|grocery|restaurant|מזון|מסעדה|סופר/.test(haystack)) return Utensils;
    if (/software|adobe|github|cloud|code|טכנולוג|תוכנה|ענן/.test(haystack)) return Wifi;
    if (/design|creative|photo|canva|עיצוב|צילום/.test(haystack)) return Paintbrush;
    if (/education|course|לימודים|השכלה|חינוך/.test(haystack)) return GraduationCap;
    if (/work|office|business|עסק|משרד/.test(haystack)) return Briefcase;

    return ShoppingBag;
}

export const CategoryIcon = memo(function CategoryIcon({
    category,
    className,
    'aria-hidden': ariaHidden = true,
}: {
    category?: string | null;
    className?: string;
    'aria-hidden'?: boolean;
}) {
    const Icon = getCategoryLucideIcon(category);
    return <Icon className={className ?? 'w-4 h-4'} aria-hidden={ariaHidden} />;
});
