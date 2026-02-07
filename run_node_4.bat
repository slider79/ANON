@echo off
title ANON Node 4
echo ==========================================
echo Starting ANON Node 4 (Port 5003)
echo ==========================================

REM Configuration for Node 4
set PORT=5003
set DB_PATH=anon_peer4.db
set NODE_STATE_DIR=.anon_peer4
set ADVERTISE_URL=ws://localhost:5003/p2p
set API_TARGET=http://localhost:5003

echo Starting Backend on Port 5003...
start "ANON Backend (5003)" cmd /k "npm start"

echo Starting Frontend for Node 4...
cd client
start "ANON UI (Node 4)" cmd /k "npm run dev -- --port 5176"