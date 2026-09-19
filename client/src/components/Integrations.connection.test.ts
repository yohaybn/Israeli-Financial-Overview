import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const google = readFileSync(resolve(process.cwd(), 'src/components/GoogleSettings.tsx'), 'utf8');
const mqtt = readFileSync(resolve(process.cwd(), 'src/components/MqttSettings.tsx'), 'utf8');
const telegram = readFileSync(resolve(process.cwd(), 'src/components/TelegramSettings.tsx'), 'utf8');

describe('connection-first integration setup', () => {
    it('google leads with a connection status card', () => {
        expect(google).toContain("t('google_settings.status_not_connected')");
        expect(google).toContain("t('google_settings.status_connected')");
        expect(google).toContain("t('google_settings.status_checking')");
        expect(google).toContain("t('google_settings.status_failed')");
    });

    it('google unfolds the drive folder browser only once connected', () => {
        expect(google).toContain("connectionState === 'connected' && (");
        expect(google).toContain('hasSavedCredentials && selectedFolderId');
    });

    it('mqtt keeps post-connection settings hidden until the integration is set up', () => {
        expect(mqtt).toContain('const isSetUp = Boolean(config?.enabled);');
        expect(mqtt).toContain('{isSetUp && (');
    });

    it('telegram shows only the token step on a fresh screen', () => {
        expect(telegram).toContain('const showSetupOnly = !status?.isActive && !hasSavedToken && !botToken.trim();');
    });
});
