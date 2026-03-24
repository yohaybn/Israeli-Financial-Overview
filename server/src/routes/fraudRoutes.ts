import { Router } from 'express';
import type { FraudDetectionLocalConfig, Transaction } from '@app/shared';
import { DbService } from '../services/dbService.js';
import { fraudDetectionService } from '../services/fraudDetectionService.js';
import { buildLocalFraudAlertPreview } from '../utils/fraudAlertPreview.js';

const router = Router();
const db = new DbService();

function normalizeTestTransaction(input: Partial<Transaction>): Transaction {
  const id = typeof input.id === 'string' && input.id ? input.id : `test-${Date.now()}`;
  const dateRaw = typeof input.date === 'string' ? input.date : new Date().toISOString();
  const amount = Number(input.amount ?? 0);
  const origAmt = input.originalAmount !== undefined && input.originalAmount !== null ? Number(input.originalAmount) : amount;
  const cur = String(input.originalCurrency || 'ILS').toUpperCase();
  return {
    id,
    date: dateRaw,
    processedDate: typeof input.processedDate === 'string' ? input.processedDate : dateRaw,
    description: typeof input.description === 'string' ? input.description : '',
    memo: typeof input.memo === 'string' ? input.memo : undefined,
    amount,
    originalAmount: origAmt,
    originalCurrency: cur,
    chargedAmount: input.chargedAmount !== undefined ? Number(input.chargedAmount) : amount,
    chargedCurrency: typeof input.chargedCurrency === 'string' ? input.chargedCurrency : undefined,
    status: (input.status as Transaction['status']) || 'completed',
    type: typeof input.type === 'string' ? input.type : undefined,
    provider: typeof input.provider === 'string' ? input.provider : 'test',
    accountNumber: typeof input.accountNumber === 'string' ? input.accountNumber : 'test',
    category: typeof input.category === 'string' ? input.category : undefined,
    txnType: input.txnType as Transaction['txnType'] | undefined,
  };
}

router.get('/findings', (req, res) => {
  try {
    const { since, minScore, minSeverity, detector } = req.query as {
      since?: string;
      minScore?: string;
      minSeverity?: 'low' | 'medium' | 'high';
      detector?: 'local' | 'ai';
    };

    const parsedMinScore =
      typeof minScore === 'string' && minScore.trim() !== ''
        ? Number(minScore)
        : undefined;

    const findings = db.getFraudFindings({
      since,
      minScore: Number.isFinite(parsedMinScore) ? parsedMinScore : undefined,
      minSeverity,
      detector,
    });

    res.json({ success: true, data: findings });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/findings/:txnId', (req, res) => {
  try {
    const { txnId } = req.params;
    const findings = db.getFraudFindingsForTxn(txnId);
    res.json({ success: true, data: findings });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/preview', (req, res) => {
  try {
    const body = req.body as {
      transaction?: Partial<Transaction>;
      history?: Partial<Transaction>[];
      local?: FraudDetectionLocalConfig;
    };
    if (!body?.transaction || typeof body.transaction !== 'object') {
      res.status(400).json({ success: false, error: 'Missing transaction' });
      return;
    }
    const txn = normalizeTestTransaction(body.transaction);
    const history = Array.isArray(body.history) ? body.history.map((h) => normalizeTestTransaction(h)) : [];
    const local = body.local;
    const localForPreview: FraudDetectionLocalConfig = {
      ...local,
      thresholds: { ...local?.thresholds, persistOnlyFlagged: false },
    };

    const { findings, summary } = fraudDetectionService.detectLocal([txn], history, localForPreview);
    const finding = findings[0] ?? null;
    const thresholds = localForPreview.thresholds;
    const alertPreview = buildLocalFraudAlertPreview(findings, [txn], summary, thresholds?.notifyMinSeverity);

    res.json({
      success: true,
      data: {
        finding,
        summary,
        alertPreview,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export const fraudRoutes = router;
