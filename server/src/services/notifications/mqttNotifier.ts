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
    if (!mqttClientService.isConfiguredForPublish()) {
      serverLogger.debug('MQTT notifier skip: not configured');
      return;
    }
    const body = toJson(payload);
    await mqttClientService.publishNotify(body);
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
