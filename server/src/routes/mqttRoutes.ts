/**
 * MQTT configuration API (broker, topics, auth) + test publish + status.
 */

import { Router, Request, Response } from 'express';
import type { MqttConfig } from '@app/shared';
import { mqttClientService } from '../services/mqttClientService.js';
import { MqttNotifier } from '../services/notifications/mqttNotifier.js';
import { notificationService } from '../services/notifications/notificationService.js';
import { serverLogger } from '../utils/logger.js';

const router = Router();

function maskPassword(cfg: MqttConfig): MqttConfig {
  const p = cfg.password;
  if (!p || typeof p !== 'string') return { ...cfg, password: '' };
  return {
    ...cfg,
    password: p.length ? `***${p.slice(-4)}` : '',
  };
}

/** Register or refresh MQTT notifier after config changes (reads live config from mqttClientService). */
export function registerMqttNotifier(): void {
  try {
    const notifier = new MqttNotifier();
    notificationService.registerNotifier('mqtt', notifier);
  } catch (e) {
    serverLogger.warn('MQTT notifier registration skipped', { error: (e as Error).message });
  }
}

/**
 * GET /api/mqtt/config
 */
router.get('/config', (_req: Request, res: Response) => {
  try {
    mqttClientService.loadFromDisk();
    const data = maskPassword(mqttClientService.getConfig());
    res.json({ success: true, data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    serverLogger.error('MQTT GET config failed', { error: msg });
    res.status(500).json({ success: false, error: msg });
  }
});

/**
 * POST /api/mqtt/config — create/update full or partial MQTT settings
 */
router.post('/config', async (req: Request, res: Response) => {
  try {
    mqttClientService.loadFromDisk();
    const body = req.body as Partial<MqttConfig>;
    const current = mqttClientService.getConfig();
    const merged: MqttConfig = {
      ...current,
      ...body,
    };
    if (typeof body.password === 'string' && body.password.startsWith('***')) {
      merged.password = current.password;
    }
    if (body.password === '' || body.password === undefined) {
      delete (merged as any).password;
      if (current.password && body.password === undefined) {
        merged.password = current.password;
      }
    }
    mqttClientService.saveToDisk(merged);
    await mqttClientService.connectWithCurrentConfig();
    registerMqttNotifier();
    res.json({
      success: true,
      message: 'MQTT configuration saved',
      data: maskPassword(mqttClientService.getConfig()),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    serverLogger.error('MQTT POST config failed', { error: msg });
    res.status(500).json({ success: false, error: msg });
  }
});

/**
 * DELETE /api/mqtt/config — disable MQTT (keeps saved broker settings but turns off delivery)
 */
router.delete('/config', async (_req: Request, res: Response) => {
  try {
    const current = mqttClientService.getConfig();
    mqttClientService.saveToDisk({
      ...current,
      enabled: false,
    });
    mqttClientService.destroyClient();
    registerMqttNotifier();
    res.json({ success: true, message: 'MQTT disabled' });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: msg });
  }
});

/**
 * GET /api/mqtt/status
 */
router.get('/status', (_req: Request, res: Response) => {
  try {
    const status = mqttClientService.getStatus();
    res.json({ success: true, data: status });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: msg });
  }
});

/**
 * POST /api/mqtt/test — publish a small JSON test payload to the notify topic (QoS 1)
 */
router.post('/test', async (_req: Request, res: Response) => {
  try {
    if (!mqttClientService.isConfiguredForPublish()) {
      return res.status(400).json({
        success: false,
        error: 'MQTT is not enabled or broker/topic is missing',
      });
    }
    const payload = JSON.stringify({
      type: 'mqtt-test',
      timestamp: new Date().toISOString(),
      message: 'Israeli bank scraper MQTT test message',
    });
    await mqttClientService.publishNotify(payload);
    res.json({ success: true, message: 'Test message published' });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    serverLogger.warn('MQTT test publish failed', { error: msg });
    res.status(500).json({ success: false, error: msg });
  }
});

export { router as mqttRoutes };
