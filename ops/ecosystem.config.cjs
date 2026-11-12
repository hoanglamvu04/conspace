// PM2 entry for CONSPACE only; log files are isolated from other PM2 apps.
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
    min_uptime: '10s',
    max_restarts: 5,
    restart_delay: 2000,
    max_memory_restart: '256M',
    kill_timeout: 10000,
    out_file: '/var/log/conspace/api-out.log',
    error_file: '/var/log/conspace/api-error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    env_production: {
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: '5088',
    },
  }],
};
