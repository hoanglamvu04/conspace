import { app } from './app.js';
import { env } from './config/env.js';
import { closeDatabase } from './database/pool.js';

const server = app.listen(env.port, env.host, () => {
  console.log('CONSPACE API listening at http://' + env.host + ':' + env.port);
});

server.on('error', (error) => {
  console.error('CONSPACE API failed to listen:', error.message);
  process.exitCode = 1;
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('Received ' + signal + ', shutting down...');
  server.close(async () => {
    try {
      await closeDatabase();
      process.exit(0);
    } catch (error) {
      console.error('Database shutdown failed:', error.message);
      process.exit(1);
    }
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
