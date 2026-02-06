const express = require('express');
const cors = require('cors');
require('dotenv').config();
const http = require('http');

const p2pService = require('./services/p2pService');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Routes
const anonRouter = require('./routes/anon');
app.use('/api', anonRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// Attach WebSocket P2P server at ws://host:PORT/p2p
p2pService.attachWebSocketServer(server);

server.listen(PORT, async () => {
  console.log(`ANON backend running on port ${PORT}`);

  // Optional: bootstrap outgoing connections
  await p2pService.bootstrap();
});