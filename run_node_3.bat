@echo off
title ANON Node 3
echo ==========================================
echo Starting ANON Node 3 (Port 5002)
echo ==========================================

REM Configuration for Node 3
set PORT=5002
set DB_PATH=anon_peer3.db
set NODE_STATE_DIR=.anon_peer3
set ADVERTISE_URL=ws://localhost:5002/p2p
set API_TARGET=http://localhost:5002

echo Starting Backend on Port 5002...
start "ANON Backend (5002)" cmd /k "npm start"

echo Starting Frontend for Node 3...
cd client
start "ANON UI (Node 3)" cmd /k "npm run dev -- --port 5175"