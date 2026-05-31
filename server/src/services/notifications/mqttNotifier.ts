/**
 * MQTT notifier — publishes NotificationPayload as JSON (QoS 1) via mqttClientService.
 */

import { BaseNotifier } from './baseNotifier.js';
import type { NotificationPayload, NotifierConfig } from './types.js';
import { toJson } from './formatter.js';
import { mqttClientService } from '../mqttClientService.js';
import { serverLogger } from '../../utils/logger.js';

export class MqttNotifier extends BaseNotifier {
  constructor(config: Partial<NotifierConfig> = {}) {
    super('mqtt', { enabled: config.enabled ?? false, ...config });
  }

  async send(payload: NotificationPayload): Promise<void> {
    const c = mqttClientService.getConfig();
    if (!mqttClientService.isConfiguredForPublish() || !c.topic?.trim()) {
      serverLogger.debug('MQTT notifier skip: not configured or no notify topic');
      return;
    }
    const body = toJson(payload);
    const baseTopic = c.topic!.trim().replace(/\/+$/, '');
    await mqttClientService.publish(`${baseTopic}/event`, body, { qos: 1 });
    // Legacy: also publish to primary topic for backward compatibility
    await mqttClientService.publishNotify(body);

    if (payload.summary?.insights?.length) {
      const segment = payload.telegramSegment || payload.pipelineId.replace(/\s+/g, '_').toLowerCase();
      const insightPayload = JSON.stringify({
        pipelineId: payload.pipelineId,
        status: payload.status,
        timestamp: payload.timestamp instanceof Date ? payload.timestamp.toISOString() : payload.timestamp,
        summary: payload.summary,
      });
      await mqttClientService.publish(`${baseTopic}/insight/${segment}`, insightPayload, { qos: 1 });
    }

    if (payload.pipelineId && !payload.telegramSegment) {
      const slim = JSON.stringify({
        pipelineId: payload.pipelineId,
        status: payload.status,
        transactionCount: payload.summary.transactionCount,
        durationMs: payload.summary.durationMs,
        insights: payload.summary.insights,
        timestamp: payload.timestamp instanceof Date ? payload.timestamp.toISOString() : payload.timestamp,
      });
      await mqttClientService.publish(`${baseTopic}/scrape/summary`, slim, { qos: 1 });
    }
  }

  /**
   * Enabled means mqtt_config has enabled + broker + topic; connection may still be in progress.
   */
  override isEnabled(): boolean {
    const c = mqttClientService.getConfig();
    return c.enabled === true && !!(c.brokerUrl?.trim() && c.topic?.trim());
  }

  validate(_config: NotifierConfig): boolean {
    const c = mqttClientService.getConfig();
    if (!c.enabled) return true;
    return !!(c.brokerUrl?.trim() && c.topic?.trim());
  }
}
