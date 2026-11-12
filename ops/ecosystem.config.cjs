// PM2 entry for CONSPACE only. Does not restart existing applications.
// Secret DATABASE_URL is loaded from backend/.env by dotenv, never committed here.
module.exports = {
  apps: [
    {
      name: 'conspace-api',
      cwd: '/var/www/conspace/backend',
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '256M',
      env_production: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '5088',
      },
    },
  ],
};
