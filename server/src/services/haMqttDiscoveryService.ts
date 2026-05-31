/**
 * Home Assistant MQTT Discovery — publishes entity configs under homeassistant/<component>/...
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  resolveDeviceId,
  resolveDiscoveryPrefix,
  resolveStateTopicPrefix,
} from '@app/shared';
import { mqttClientService } from './mqttClientService.js';
import { serviceLogger as logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DISCOVERY_ENTITY_IDS = [
  'scrape_running',
  'last_scrape_success',
  'review_pending_count',
  'top_insight_score',
  'alert_count',
  'app_locked',
  'trigger_scrape_all',
  'trigger_scheduler_now',
  'generate_report',
  'refresh_insights',
] as const;

function readAppVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '../../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

function discoveryTopic(component: string, objectId: string): string {
  const cfg = mqttClientService.getConfig();
  const prefix = resolveDiscoveryPrefix(cfg);
  const deviceId = resolveDeviceId(cfg);
  return `${prefix}/${component}/${deviceId}/${objectId}/config`;
}

function baseDevice() {
  const cfg = mqttClientService.getConfig();
  const deviceId = resolveDeviceId(cfg);
  return {
    identifiers: [deviceId],
    name: 'Financial Overview',
    manufacturer: 'Israeli Financial Overview',
    model: 'Bank Scraper',
    sw_version: readAppVersion(),
  };
}

function statePrefix(): string {
  return resolveStateTopicPrefix(mqttClientService.getConfig());
}

function commandPayload(command: string, args: Record<string, unknown> = {}): string {
  const cfg = mqttClientService.getConfig();
  const secret = (cfg.commandSecret || '').trim();
  return JSON.stringify({
    command,
    secret: secret || undefined,
    requestId: `ha-discovery-${command}`,
    args,
  });
}

function buildEntities(): { component: string; objectId: string; config: Record<string, unknown> }[] {
  const cfg = mqttClientService.getConfig();
  const cmdTop = cfg.commandTopic?.trim();
  const st = statePrefix();
  const device = baseDevice();
  const entities: { component: string; objectId: string; config: Record<string, unknown> }[] = [];

  entities.push({
    component: 'binary_sensor',
    objectId: 'scrape_running',
    config: {
      name: 'Scrape Running',
      state_topic: `${st}/scrape`,
      value_template: '{{ value_json.running }}',
      payload_on: 'true',
      payload_off: 'false',
      device_class: 'running',
      unique_id: `${resolveDeviceId(cfg)}_scrape_running`,
      device,
    },
  });

  entities.push({
    component: 'binary_sensor',
    objectId: 'last_scrape_success',
    config: {
      name: 'Last Scrape Success',
      state_topic: `${st}/scrape`,
      value_template: "{{ 'true' if value_json.lastStatus == 'success' else 'false' }}",
      payload_on: 'true',
      payload_off: 'false',
      unique_id: `${resolveDeviceId(cfg)}_last_scrape_success`,
      device,
    },
  });

  entities.push({
    component: 'sensor',
    objectId: 'review_pending_count',
    config: {
      name: 'Review Pending Count',
      state_topic: `${st}/review`,
      value_template: '{{ value_json.count }}',
      unit_of_measurement: 'transactions',
      state_class: 'measurement',
      unique_id: `${resolveDeviceId(cfg)}_review_pending_count`,
      device,
    },
  });

  entities.push({
    component: 'sensor',
    objectId: 'top_insight_score',
    config: {
      name: 'Top Insight Score',
      state_topic: `${st}/insights/top`,
      value_template: "{{ value_json.items[0].score if value_json.items else 0 }}",
      state_class: 'measurement',
      unique_id: `${resolveDeviceId(cfg)}_top_insight_score`,
      device,
    },
  });

  entities.push({
    component: 'sensor',
    objectId: 'alert_count',
    config: {
      name: 'AI Alert Count',
      state_topic: `${st}/alerts`,
      value_template: '{{ value_json.count }}',
      state_class: 'measurement',
      unique_id: `${resolveDeviceId(cfg)}_alert_count`,
      device,
    },
  });

  entities.push({
    component: 'binary_sensor',
    objectId: 'app_locked',
    config: {
      name: 'App Locked',
      state_topic: `${st}/app_lock`,
      value_template: "{{ 'true' if value_json.configured and not value_json.unlocked else 'false' }}",
      payload_on: 'true',
      payload_off: 'false',
      unique_id: `${resolveDeviceId(cfg)}_app_locked`,
      device,
    },
  });

  if (cmdTop) {
    entities.push({
      component: 'button',
      objectId: 'trigger_scrape_all',
      config: {
        name: 'Scrape All Profiles',
        command_topic: cmdTop,
        payload_press: commandPayload('scrape', { all: true }),
        unique_id: `${resolveDeviceId(cfg)}_trigger_scrape_all`,
        device,
      },
    });
    entities.push({
      component: 'button',
      objectId: 'trigger_scheduler_now',
      config: {
        name: 'Run Scheduled Scrape Now',
        command_topic: cmdTop,
        payload_press: commandPayload('scheduler_run_now'),
        unique_id: `${resolveDeviceId(cfg)}_trigger_scheduler_now`,
        device,
      },
    });
    entities.push({
      component: 'button',
      objectId: 'generate_report',
      config: {
        name: 'Generate Financial Report',
        command_topic: cmdTop,
        payload_press: commandPayload('report', { scope: 'month' }),
        unique_id: `${resolveDeviceId(cfg)}_generate_report`,
        device,
      },
    });
    entities.push({
      component: 'button',
      objectId: 'refresh_insights',
      config: {
        name: 'Refresh Insight Rules',
        command_topic: cmdTop,
        payload_press: commandPayload('refresh_rules'),
        unique_id: `${resolveDeviceId(cfg)}_refresh_insights`,
        device,
      },
    });
  }

  return entities;
}

export async function publishHaMqttDiscovery(): Promise<void> {
  const cfg = mqttClientService.getConfig();
  if (!cfg.enableHaDiscovery || !mqttClientService.getStatus().connected) return;

  const secret = (cfg.commandSecret || '').trim();
  if (!secret) {
    logger.warn('HA MQTT Discovery enabled but commandSecret is missing — buttons will not be published');
  }

  for (const ent of buildEntities()) {
    if (ent.component === 'button' && !cfg.commandTopic?.trim()) continue;
    try {
      const topic = discoveryTopic(ent.component, ent.objectId);
      await mqttClientService.publishRetainedState(topic, ent.config);
    } catch (e) {
      logger.warn('HA discovery publish failed', { objectId: ent.objectId, error: (e as Error).message });
    }
  }
  logger.info('HA MQTT Discovery entities published', { count: buildEntities().length });
}

export async function removeHaMqttDiscovery(): Promise<void> {
  const cfg = mqttClientService.getConfig();
  const prefix = resolveDiscoveryPrefix(cfg);
  const deviceId = resolveDeviceId(cfg);
  if (!mqttClientService.getStatus().connected) return;

  for (const objectId of DISCOVERY_ENTITY_IDS) {
    for (const component of ['binary_sensor', 'sensor', 'button'] as const) {
      const topic = `${prefix}/${component}/${deviceId}/${objectId}/config`;
      try {
        await mqttClientService.clearRetained(topic);
      } catch {
        /* ignore */
      }
    }
  }
}

export async function syncHaMqttDiscovery(): Promise<void> {
  const cfg = mqttClientService.getConfig();
  if (cfg.enableHaDiscovery) {
    await publishHaMqttDiscovery();
  } else {
    await removeHaMqttDiscovery();
  }
}
