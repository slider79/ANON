@echo off
title ANON Node 1
echo ==========================================
echo Setting up ANON Node 1 (Port 5000)
echo ==========================================

IF NOT EXIST "node_modules" (
    echo Installing Backend Deps...
    call npm install
)

IF NOT EXIST "client\node_modules" (
    echo Installing Frontend Deps...
    cd client
    call npm install
    cd ..
)

echo Starting Backend on Port 5000...
start "ANON Backend (5000)" cmd /k "set PORT=5000 && set DB_PATH=anon.db && set NODE_STATE_DIR=.anon && npm start"

echo Starting Frontend...
cd client
set API_TARGET=http://localhost:5000
start "ANON UI (Node 1)" cmd /k "npm run dev"