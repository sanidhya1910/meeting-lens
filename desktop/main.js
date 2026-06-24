// Electron shell for Meeting Lens.
// In production it launches the local Python backend (which also serves the built
// frontend) and opens a native window pointing at it. In dev (ELECTRON_DEV=1) it
// assumes you're running the backend + Vite dev server yourself and just opens 5173.
const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');
const PORT = 8000;
const DEV = process.env.ELECTRON_DEV === '1';
let backendProc = null;

function backendPython() {
  const isWin = process.platform === 'win32';
  const venv = path.join(BACKEND, 'venv', isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python');
  if (fs.existsSync(venv)) return venv;
  return isWin ? 'python' : 'python3';
}

function startBackend() {
  backendProc = spawn(backendPython(), ['-m', 'uvicorn', 'main:app', '--port', String(PORT)], {
    cwd: BACKEND,
    stdio: 'inherit',
  });
  backendProc.on('error', (e) => console.error('Failed to start backend:', e));
}

function waitForBackend(onReady, tries = 60) {
  const ping = () => {
    http
      .get(`http://localhost:${PORT}/api/asr-models`, (res) => {
        res.destroy();
        onReady();
      })
      .on('error', () => {
        if (--tries > 0) setTimeout(ping, 500);
        else onReady(); // give up waiting; load anyway so errors are visible
      });
  };
  ping();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: 'Meeting Lens',
    backgroundColor: '#0f172a',
    webPreferences: { contextIsolation: true },
  });

  // Open external links in the system browser, not inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (DEV) {
    win.loadURL('http://localhost:5173');
  } else {
    waitForBackend(() => win.loadURL(`http://localhost:${PORT}`));
  }
}

app.whenReady().then(() => {
  if (!DEV) startBackend();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());

app.on('before-quit', () => {
  if (backendProc) {
    try {
      backendProc.kill();
    } catch (e) {
      /* ignore */
    }
  }
});
