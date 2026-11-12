// PM2 entry for CONSPACE only; never touches other applications.
// DATABASE_URL loads from private backend/.env via dotenv.
const apiCwd = process.env.CONSPACE_API_CWD || '/var/www/conspace/backend';
module.exports = {
  apps: [{
    name: 'conspace-api',
    cwd: apiCwd,
    script: 'src/server.js',
    interpreter: process.execPath,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '256M',
    kill_timeout: 10000,
    env_production: {
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: '5088',
    },
  }],
};
