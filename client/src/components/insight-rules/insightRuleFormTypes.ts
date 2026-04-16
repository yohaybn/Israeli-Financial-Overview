/** Row shape returned by GET /insight-rules (matches server payload). */
export type InsightRuleRow = {
    id: string;
    name: string;
    enabled: boolean;
    priority: number;
    source: 'user' | 'ai';
    definition: {
        version: number;
        scope: string;
        lastNDays?: number;
        description?: string;
        condition: unknown;
        output: {
            kind: string;
            score: number;
            message: { en: string; he: string };
        };
    };
    createdAt: string;
    updatedAt: string;
};

export type InsightRuleFormCreateSeed = {
    name: string;
    enabled: boolean;
    priority: number;
    source?: 'user' | 'ai';
    definition: InsightRuleRow['definition'];
};
