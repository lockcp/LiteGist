const http = require('node:http');
const config = require('./src/config');
const router = require('./src/web/router');
const repo = require('./src/db/repo');

console.log('[server] LiteGist database initialized at: ' + config.DB_PATH);

const server = http.createServer(async (req, res) => {
  try {
    await router.route(req, res);
  } catch (err) {
    console.error('[server] Error:', err);
    res.writeHead(500);
    res.end('Internal Server Error');
  }
});

require('./src/webdav').startScheduler();

server.listen(config.PORT, () => {
  console.log('==================================================');
  console.log(`  ${config.SERVICE_NAME} Server`);
  console.log(`  Listening on: http://localhost:${config.PORT}`);
  console.log(`  Admin User: ${config.ADMIN_USERNAME}`);
  console.log(`  Admin Pass: ${config.ADMIN_PASSWORD}`);
  console.log(`  Admin API Key: ${config.API_KEY}`);
  console.log('==================================================');
});

process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0);
  });
});
