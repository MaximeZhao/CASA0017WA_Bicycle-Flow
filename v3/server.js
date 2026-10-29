'use strict';
const http = require('node:http');
const zlib = require('node:zlib');
const fs = require('node:fs/promises');
const path = require('node:path');
const config = require('./lib/config');
const { loadDashboard } = require('./lib/data-source');
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml' };
function send(res, status, type, body) {
  if (type.startsWith('application/json') && Buffer.byteLength(body)>1024 && /(?:^|[,\s])gzip(?:[,\s;]|$)/.test(res.req?.headers['accept-encoding'] || '')) {
    body=zlib.gzipSync(body,{level:3}); res.setHeader('Content-Encoding','gzip'); res.setHeader('Vary','Accept-Encoding');
  }
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options':'nosniff', 'Cache-Control':'no-store' }); res.end(body);
}
function json(res, status, data) { send(res, status, 'application/json; charset=utf-8', JSON.stringify(data)); }
function staticPath(urlPath) {
  const pages = { '/':'index.html', '/index.html':'index.html', '/insights.html':'insights.html', '/vendor/leaflet.js':'node_modules/leaflet/dist/leaflet.js', '/vendor/leaflet.css':'node_modules/leaflet/dist/leaflet.css' };
  if (pages[urlPath]) return path.join(config.root, pages[urlPath]);
  if (!/^\/assets\/(css|js)\/[a-zA-Z0-9_-]+\.(css|js)$/.test(urlPath)) return null;
  return path.join(config.root, urlPath.slice(1));
}
function createServer() {
  return http.createServer(async (req,res) => {
    try {
      if (req.method !== 'GET') return json(res,405,{error:'Only GET is supported'});
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/dashboard') return json(res,200,await loadDashboard(url.searchParams.get('date')));
      if (url.pathname === '/api/collection-status') {
        try { return json(res,200,JSON.parse(await fs.readFile(path.join(config.root,'data/collector-status.json'),'utf8'))); }
        catch (error) { if(error.code==='ENOENT') return json(res,200,{status:'not-started',intervalSeconds:300}); throw error; }
      }
      if (url.pathname === '/api/health') return json(res,200,{status:'ok',mode:config.mode});
      const file = staticPath(decodeURIComponent(url.pathname));
      if (!file) return json(res,404,{error:'Not found'});
      try { send(res,200,mime[path.extname(file)] || 'application/octet-stream', await fs.readFile(file)); }
      catch (e) { if (e.code === 'ENOENT') return json(res,404,{error:'File not found. Run npm install if Leaflet is missing.'}); throw e; }
    } catch (error) {
      if (!error.status) console.error('Request failed:', error.code || error.name);
      json(res,error.status || 503,{error:error.status ? error.message : 'Data unavailable. Check the selected data source and server configuration.'});
    }
  });
}
if (require.main === module) {
  const server = createServer();
  server.listen(config.port,config.host,() => console.log(`London Bike Pulse: http://${config.host}:${config.port} [${config.mode}]`));
  async function stop() { server.close(); await require('./lib/database').close(); }
  process.on('SIGTERM',stop); process.on('SIGINT',stop);
}
module.exports = { createServer, staticPath };
