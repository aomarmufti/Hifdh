// Boots the mock-backed static server, runs the end-to-end suite, tears down.
const { spawn } = require('child_process');
const path = require('path');

const server = spawn(process.execPath, [path.join(__dirname, 'server.cjs')], {
  stdio: ['ignore', 'pipe', 'inherit']
});

const stop = (code) => { try { server.kill(); } catch {} process.exit(code); };

server.stdout.once('data', () => {
  const suite = spawn(process.execPath, [path.join(__dirname, 'test.cjs')], { stdio: 'inherit' });
  suite.on('exit', stop);
});

server.on('exit', (c) => {
  if (c !== null && c !== 0) { console.error('test server exited:', c); process.exit(1); }
});
process.on('SIGINT', () => stop(130));
