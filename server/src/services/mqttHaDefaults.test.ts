import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHaMqttPreset,
  resolveStateTopicPrefix,
  resolveDeviceId,
  defaultHaMqttTopics,
} from '@app/shared';

describe('mqttHaDefaults', () => {
  it('buildHaMqttPreset uses bank_scraper topics', () => {
    const preset = buildHaMqttPreset();
    assert.equal(preset.brokerUrl, 'core-mosquitto');
    assert.equal(preset.port, 1883);
    assert.equal(preset.topic, 'bank_scraper/notify');
    assert.equal(preset.commandTopic, 'bank_scraper/command');
  });

  it('resolveStateTopicPrefix defaults from deviceId', () => {
    assert.equal(resolveStateTopicPrefix({}), 'bank_scraper/state');
    assert.equal(resolveStateTopicPrefix({ deviceId: 'custom' }), 'custom/state');
    assert.equal(resolveStateTopicPrefix({ stateTopicPrefix: 'foo/bar' }), 'foo/bar');
  });

  it('defaultHaMqttTopics uses device id', () => {
    const t = defaultHaMqttTopics('mydevice');
    assert.equal(t.topic, 'mydevice/notify');
    assert.equal(resolveDeviceId({ deviceId: 'mydevice' }), 'mydevice');
  });
});
