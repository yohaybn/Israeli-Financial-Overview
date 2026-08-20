#!/usr/bin/env node
import { spawn } from 'child_process';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Parse CLI args
const rawArgs = process.argv.slice(2);
let password = process.env.APP_LOCK_PASSWORD || '';
let headed = false;
let uiMode = false;
let port = process.env.CLIENT_PORT || '5173';
const forwardArgs = [];

for (let i = 0; i < rawArgs.length; i++) {
  const arg = rawArgs[i];

  if (arg === '--password' || arg === '-p') {
    password = rawArgs[i + 1] || '';
    i++;
  } else if (arg.startsWith('--password=')) {
    password = arg.split('=')[1] || '';
  } else if (arg === '--headed') {
    headed = true;
  } else if (arg === '--ui') {
    uiMode = true;
  } else if (arg === '--port') {
    port = rawArgs[i + 1] || port;
    i++;
  } else if (arg.startsWith('--port=')) {
    port = arg.split('=')[1] || port;
  } else {
    forwardArgs.push(arg);
  }
}

async function promptPasswordIfEmpty() {
  if (password || process.env.CI || !process.stdin.isTTY) {
    return password;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('🔒 Enter App Lock Password (leave empty if not locked / demo mode): ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log('\n🚀 ===============================================');
  console.log('   Israeli Financial Overview - Browser Test Runner');
  console.log('=================================================\n');

  const finalPassword = await promptPasswordIfEmpty();
  if (finalPassword) {
    process.env.APP_LOCK_PASSWORD = finalPassword;
    console.log('🔑 App Lock password configured for test session.\n');
  } else {
    console.log('ℹ️  No App Lock password provided (running in standard/demo mode).\n');
  }

  const playwrightArgs = ['playwright', 'test'];
  if (uiMode) {
    playwrightArgs.push('--ui');
  } else if (headed) {
    playwrightArgs.push('--headed');
  }

  playwrightArgs.push(...forwardArgs);

  console.log(`▶️ Executing: npx ${playwrightArgs.join(' ')}\n`);

  const runner = spawn('npx', playwrightArgs, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      APP_LOCK_PASSWORD: finalPassword,
      CLIENT_PORT: port,
    },
  });

  runner.on('close', (code) => {
    console.log('\n📊 Test run completed with exit code:', code);
    console.log('📄 View markdown summary: test-report.md');
    console.log('🌐 View interactive HTML report: npx playwright show-report\n');
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error('❌ Error executing browser test runner:', err);
  process.exit(1);
});
