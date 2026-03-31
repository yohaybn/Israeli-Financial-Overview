import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    builderStateToDefinition,
    definitionToBuilderState,
    defaultBuilderState,
} from './insightRuleBuilder.js';

describe('insightRuleBuilder', () => {
    it('round-trips single sum_expenses row', () => {
        const s0 = defaultBuilderState();
        s0.rows = [{ rowType: 'sum_expenses', op: 'gte', amount: 500, category: 'מזון' }];
        const def = builderStateToDefinition(s0);
        const back = definitionToBuilderState(def);
        assert.ok(back);
        assert.equal(back!.state.rows.length, 1);
        assert.equal(back!.state.rows[0].rowType, 'sum_expenses');
        if (back!.state.rows[0].rowType === 'sum_expenses') {
            assert.equal(back!.state.rows[0].amount, 500);
            assert.equal(back!.state.rows[0].category, 'מזון');
        }
    });

    it('round-trips AND of two rows', () => {
        const s0 = defaultBuilderState();
        s0.combineMode = 'and';
        s0.rows = [
            { rowType: 'sum_expenses', op: 'gte', amount: 100, category: '' },
            { rowType: 'txn_count', min: 2, category: '' },
        ];
        const def = builderStateToDefinition(s0);
        assert.equal(def.condition.op, 'and');
        const back = definitionToBuilderState(def);
        assert.ok(back);
        assert.equal(back!.state.rows.length, 2);
    });

    it('returns null for not-wrapped condition', () => {
        const def = builderStateToDefinition({
            ...defaultBuilderState(),
            rows: [{ rowType: 'txn_exists', match: { op: 'categoryEquals', value: 'x' } }],
        });
        const notDef = {
            ...def,
            condition: { op: 'not' as const, item: def.condition },
        };
        assert.equal(definitionToBuilderState(notDef as any), null);
    });

    it('includes description in definition', () => {
        const s = defaultBuilderState();
        s.description = '  My strategy  ';
        const def = builderStateToDefinition(s);
        assert.equal(def.description, 'My strategy');
    });
});
