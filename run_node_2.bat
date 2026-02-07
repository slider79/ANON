@echo off
title ANON Node 2
echo ==========================================
echo Starting ANON Node 2 (Port 5001)
echo ==========================================

REM Configuration for Node 2
set PORT=5001
set DB_PATH=anon_peer2.db
set NODE_STATE_DIR=.anon_peer2
set ADVERTISE_URL=ws://localhost:5001/p2p
set API_TARGET=http://localhost:5001

echo Starting Backend on Port 5001...
start "ANON Backend (5001)" cmd /k "npm start"

echo Starting Frontend for Node 2...
cd client
start "ANON UI (Node 2)" cmd /k "npm run dev -- --port 5174"