'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 3000;
const PROJECT_ROOT = __dirname;

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function send(response, statusCode, contentType, body) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Type': contentType
  });
  response.end(body);
}

async function readDashboardData() {
  const filePath = path.join(PROJECT_ROOT, 'data', 'demo-data.json');
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function serveStaticFile(urlPath, response) {
  const relativePath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const filePath = path.resolve(PROJECT_ROOT, relativePath);

  if (!filePath.startsWith(PROJECT_ROOT + path.sep)) {
    send(response, 403, 'text/plain; charset=utf-8', 'Forbidden');
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    const contentType = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
    send(response, 200, contentType, body);
  } catch (error) {
    if (error.code === 'ENOENT') {
      send(response, 404, 'text/plain; charset=utf-8', 'Not found');
      return;
    }
    throw error;
  }
}

const server = http.createServer(async function(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host || HOST}`);

    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Origin': '*'
      });
      response.end();
      return;
    }

    if (request.method !== 'GET') {
      send(response, 405, 'application/json; charset=utf-8', JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    if (url.pathname === '/api/dashboard') {
      const dashboardData = await readDashboardData();
      send(response, 200, 'application/json; charset=utf-8', JSON.stringify(dashboardData));
      return;
    }

    await serveStaticFile(decodeURIComponent(url.pathname), response);
  } catch (error) {
    console.error(error);
    send(response, 500, 'application/json; charset=utf-8', JSON.stringify({ error: 'Server error' }));
  }
});

server.listen(PORT, HOST, function() {
  console.log(`London Bike Pulse is running at http://localhost:${PORT}`);
  console.log(`Dashboard API: http://localhost:${PORT}/api/dashboard`);
});
