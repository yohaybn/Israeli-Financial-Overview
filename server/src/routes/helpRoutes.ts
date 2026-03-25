import { Router } from 'express';
import { handleHelpChat } from '../controllers/helpAssistantController.js';

const router = Router();

router.post('/chat', handleHelpChat);

export const helpRoutes = router;
