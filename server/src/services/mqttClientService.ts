/**
 * Singleton MQTT client: connection, auth, TLS, LWT, reconnect.
 */

import fs from 'fs-extra';
import path from 'path';
import mqtt, { type MqttClient, type IClientOptions } from 'mqtt';
import type { MqttConfig } from '@app/shared';
import { serviceLogger as logger } from '../utils/logger.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const MQTT_CONFIG_PATH = path.join(DATA_DIR, 'config', 'mqtt_config.json');

const DEFAULT_MQTT_CONFIG: MqttConfig = {
  enabled: false,
  rejectUnauthorized: true,
  willRetain: true,
};

function buildConnectUrl(c: MqttConfig): string {
  const raw = (c.brokerUrl || '').trim();
  if (!raw) return '';
  const hasScheme = /^mqtts?:\/\//i.test(raw) || /^wss?:\/\//i.test(raw);
  const useTls = c.useTls === true || raw.startsWith('mqtts://') || raw.startsWith('wss://');
  let base = raw;
  if (!hasScheme) {
    base = `${useTls ? 'mqtts' : 'mqtt'}://${raw.replace(/^\/*/, '')}`;
  }
  const u = new URL(base);
  if (c.port && c.port > 0) {
    u.port = String(c.port);
  }
  return u.toString();
}

function defaultWillTopic(notifyTopic: string | undefined): string {
  const t = (notifyTopic || 'bank-scraper/notify').replace(/\/+$/, '');
  return `${t}/status`;
}

export class MqttClientService {
  private client: MqttClient | null = null;
  private config: MqttConfig = { ...DEFAULT_MQTT_CONFIG };
  private lastError: string | null = null;
  private connected = false;
  private connectInFlight: Promise<void> | null = null;

  getConfig(): MqttConfig {
    return { ...this.config };
  }

  /**
   * Load from disk; does not connect. Call connectWithCurrentConfig to connect.
   */
  loadFromDisk(): MqttConfig {
    try {
      if (fs.existsSync(MQTT_CONFIG_PATH)) {
        const raw = JSON.parse(fs.readFileSync(MQTT_CONFIG_PATH, 'utf-8')) as MqttConfig;
        this.config = { ...DEFAULT_MQTT_CONFIG, ...raw };
      } else {
        this.config = { ...DEFAULT_MQTT_CONFIG };
      }
    } catch (e) {
      logger.error('Failed to load mqtt_config.json', { error: (e as Error).message });
      this.config = { ...DEFAULT_MQTT_CONFIG };
    }
    return this.getConfig();
  }

  saveToDisk(partial: Partial<MqttConfig>): MqttConfig {
    this.config = { ...this.config, ...partial };
    fs.ensureDirSync(path.dirname(MQTT_CONFIG_PATH));
    fs.writeFileSync(MQTT_CONFIG_PATH, JSON.stringify(this.config, null, 2), 'utf-8');
    return this.getConfig();
  }

  updateConfig(partial: Partial<MqttConfig>): MqttConfig {
    return this.saveToDisk(partial);
  }

  isConfiguredForPublish(): boolean {
    const c = this.config;
    return !!(c.enabled && c.brokerUrl?.trim() && c.topic?.trim());
  }

  getStatus(): { connected: boolean; lastError: string | null; brokerHost: string | null } {
    let brokerHost: string | null = null;
    try {
      const url = buildConnectUrl(this.config);
      if (url) brokerHost = new URL(url).hostname;
    } catch {
      brokerHost = null;
    }
    return {
      connected: this.connected,
      lastError: this.lastError,
      brokerHost,
    };
  }

  async initFromDisk(): Promise<void> {
    this.loadFromDisk();
    try {
      await this.connectWithCurrentConfig();
    } catch (e) {
      this.lastError = (e as Error).message;
      logger.warn('MQTT connect on startup failed (non-fatal)', { error: this.lastError });
    }
  }

  async connectWithCurrentConfig(): Promise<void> {
    if (this.connectInFlight) return this.connectInFlight;

    this.connectInFlight = (async () => {
      this.destroyClient();
      if (!this.isConfiguredForPublish()) {
        this.connected = false;
        return;
      }

      const c = this.config;
      const url = buildConnectUrl(c);
      if (!url) {
        this.lastError = 'Invalid broker URL';
        return;
      }

      const clientId =
        c.clientId?.trim() ||
        `israeli-bank-scraper-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;

      const willTopic = c.willTopic?.trim() || defaultWillTopic(c.topic);
      const willPayload = Buffer.from((c.willMessage ?? 'offline') as string, 'utf-8');

      const opts: IClientOptions = {
        clientId,
        username: c.username || undefined,
        password: c.password || undefined,
        reconnectPeriod: 5000,
        connectTimeout: 30_000,
        clean: true,
        rejectUnauthorized: c.rejectUnauthorized !== false,
        will: {
          topic: willTopic,
          payload: willPayload,
          qos: 1,
          retain: c.willRetain !== false,
        },
      };

      await new Promise<void>((resolve, reject) => {
        const cli = mqtt.connect(url, opts);
        this.client = cli;

        const timer = setTimeout(() => {
          if (!this.connected) {
            this.lastError = 'MQTT connect timeout';
            reject(new Error('MQTT connect timeout'));
          }
        }, 35_000);

        cli.once('connect', () => {
          clearTimeout(timer);
          this.connected = true;
          this.lastError = null;
          logger.info('MQTT connected', {
            host: (() => {
              try {
                return new URL(url).hostname;
              } catch {
                return '';
              }
            })(),
          });
          const onlinePayload = Buffer.from('online', 'utf-8');
          cli.publish(willTopic, onlinePayload, { qos: 1, retain: c.willRetain !== false }, () => {
            resolve();
          });
        });

        cli.once('error', (err: Error) => {
          this.lastError = err.message;
          logger.warn('MQTT client error', { error: err.message });
          if (!this.connected) {
            clearTimeout(timer);
            reject(err);
          }
        });

        cli.on('close', () => {
          this.connected = false;
        });

        cli.on('offline', () => {
          this.connected = false;
        });

        cli.on('reconnect', () => {
          logger.debug('MQTT reconnecting');
        });
      });
    })();

    try {
      await this.connectInFlight;
    } finally {
      this.connectInFlight = null;
    }
  }

  destroyClient(): void {
    if (this.client) {
      try {
        this.client.removeAllListeners();
        this.client.end(true);
      } catch {
        /* ignore */
      }
      this.client = null;
    }
    this.connected = false;
  }

  /**
   * Publish UTF-8 payload with QoS 1 (pipeline notifications).
   */
  async publish(topic: string, payload: string, opts?: { qos?: 0 | 1 | 2; retain?: boolean }): Promise<void> {
    const qos = opts?.qos ?? 1;
    const retain = opts?.retain ?? false;
    if (!this.client) {
      throw new Error('MQTT client not initialized');
    }
    if (!this.connected) {
      throw new Error('MQTT not connected');
    }
    await new Promise<void>((resolve, reject) => {
      this.client!.publish(topic, payload, { qos, retain }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /** Publish notification topic from config when set */
  async publishNotify(payload: string): Promise<void> {
    const t = this.config.topic?.trim();
    if (!t) throw new Error('MQTT notify topic not configured');
    await this.publish(t, payload, { qos: 1 });
  }

  async disconnect(): Promise<void> {
    this.destroyClient();
  }
}

export const mqttClientService = new MqttClientService();
