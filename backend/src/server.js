import { app } from './app.js';
import { env } from './config/env.js';
import { pool, closeDatabase } from './database/pool.js';
import { createEditorialService } from './services/editorial.js';

const server = app.listen(env.port, env.host, () => {
  console.log('CONSPACE API listening at http://' + env.host + ':' + env.port);
});

server.on('error', (error) => {
  console.error('CONSPACE API failed to listen:', error.message);
  process.exitCode = 1;
});

const editorial = pool ? createEditorialService(pool) : null;
const publishTimer = editorial ? setInterval(() => {
  editorial.publishDueArticles().catch((error) => {
    console.error('CONSPACE scheduled publication failed:', error?.name || 'UnknownError');
  });
}, 60000) : null;
publishTimer?.unref();

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (publishTimer) clearInterval(publishTimer);
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
