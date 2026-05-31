import type { MqttConfig } from './types.js';

export const MQTT_HA_DEVICE_ID = 'bank_scraper';
export const MQTT_HA_DISCOVERY_PREFIX = 'homeassistant';

/** Supervisor internal hostname for the Mosquitto add-on on typical HA installs. */
export const MQTT_HA_DEFAULT_BROKER_HOST = 'core-mosquitto';
export const MQTT_HA_DEFAULT_PORT = 1883;

export function defaultHaMqttTopics(deviceId: string = MQTT_HA_DEVICE_ID) {
    return {
        topic: `${deviceId}/notify`,
        commandTopic: `${deviceId}/command`,
        commandResponseTopic: `${deviceId}/command/response`,
        willTopic: `${deviceId}/status`,
        stateTopicPrefix: `${deviceId}/state`,
    };
}

/** Suggested MQTT config for Home Assistant + Mosquitto add-on. */
export function buildHaMqttPreset(partial?: Partial<MqttConfig>): Partial<MqttConfig> {
    const deviceId = partial?.deviceId?.trim() || MQTT_HA_DEVICE_ID;
    const topics = defaultHaMqttTopics(deviceId);
    return {
        enabled: true,
        brokerUrl: MQTT_HA_DEFAULT_BROKER_HOST,
        port: MQTT_HA_DEFAULT_PORT,
        useTls: false,
        rejectUnauthorized: true,
        deviceId,
        discoveryPrefix: MQTT_HA_DISCOVERY_PREFIX,
        enableHaDiscovery: false,
        stateTopicPrefix: topics.stateTopicPrefix,
        topic: topics.topic,
        commandTopic: topics.commandTopic,
        commandResponseTopic: topics.commandResponseTopic,
        willTopic: topics.willTopic,
        willMessage: 'offline',
        willRetain: true,
        ...partial,
    };
}

export function resolveStateTopicPrefix(cfg: MqttConfig): string {
    const explicit = cfg.stateTopicPrefix?.trim();
    if (explicit) return explicit.replace(/\/+$/, '');
    const deviceId = cfg.deviceId?.trim() || MQTT_HA_DEVICE_ID;
    return `${deviceId}/state`;
}

export function resolveDiscoveryPrefix(cfg: MqttConfig): string {
    return (cfg.discoveryPrefix?.trim() || MQTT_HA_DISCOVERY_PREFIX).replace(/\/+$/, '');
}

export function resolveDeviceId(cfg: MqttConfig): string {
    return cfg.deviceId?.trim() || MQTT_HA_DEVICE_ID;
}

export function isHomeAssistantAddonEnv(dataDir?: string): boolean {
    const dir = (dataDir || process.env.DATA_DIR || '').replace(/\\/g, '/');
    return dir === '/data' || dir.endsWith('/data');
}
