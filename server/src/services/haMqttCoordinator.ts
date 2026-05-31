/**
 * Initializes HA MQTT state + discovery after broker connect and config changes.
 */

import { mqttClientService } from './mqttClientService.js';
import { refreshAllHaMqttState, publishAvailability } from './haMqttStateService.js';
import { syncHaMqttDiscovery } from './haMqttDiscoveryService.js';
import { serviceLogger as logger } from '../utils/logger.js';

let connectHookInstalled = false;
let originalConnect: (() => Promise<void>) | null = null;
let originalDestroy: (() => void) | null = null;

export async function initHaMqttIntegration(): Promise<void> {
  const cfg = mqttClientService.getConfig();
  if (!cfg.enabled) {
    await syncHaMqttDiscovery().catch(() => undefined);
    return;
  }
  if (!mqttClientService.getStatus().connected) return;

  try {
    await refreshAllHaMqttState();
    await syncHaMqttDiscovery();
  } catch (e) {
    logger.warn('HA MQTT integration refresh failed', { error: (e as Error).message });
  }
}

/** Call once at server startup to refresh HA state after MQTT reconnects. */
export function installHaMqttConnectHook(): void {
  if (connectHookInstalled) return;
  connectHookInstalled = true;

  originalConnect = mqttClientService.connectWithCurrentConfig.bind(mqttClientService);
  originalDestroy = mqttClientService.destroyClient.bind(mqttClientService);

  mqttClientService.connectWithCurrentConfig = async function patchedConnect() {
    await originalConnect!();
    if (mqttClientService.getStatus().connected) {
      void initHaMqttIntegration();
    }
  };

  mqttClientService.destroyClient = function patchedDestroy() {
    void publishAvailability(false).catch(() => undefined);
    originalDestroy!.call(mqttClientService);
  };
}
