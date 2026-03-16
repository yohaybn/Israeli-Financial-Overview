import { Router } from 'express';
import { DbService } from '../services/dbService.js';

const router = Router();
const db = new DbService();

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

export const fraudRoutes = router;

