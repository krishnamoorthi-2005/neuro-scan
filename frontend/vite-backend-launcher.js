import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function checkBackendAlive(port = 8000) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 1500 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

export function backendLauncherPlugin() {
  let backendChild = null;

  const killBackend = () => {
    if (backendChild && !backendChild.killed) {
      const pid = backendChild.pid;
      backendChild = null;
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', pid.toString(), '/f', '/t']);
        } else {
          process.kill(-pid, 'SIGTERM');
        }
      } catch {
        // Process might have already exited
      }
    }
  };

  return {
    name: 'vite-backend-launcher',
    async configureServer(server) {
      const isAlive = await checkBackendAlive(8000);
      if (isAlive) {
        console.log('\x1b[32m%s\x1b[0m', ' [backend] NeuroScan Python backend is already running on port 8000.');
        return;
      }

      const backendDir = path.resolve(__dirname, '../backend');
      console.log('\x1b[36m%s\x1b[0m', ' [backend] Spawning FastAPI backend on http://127.0.0.1:8000...');

      // Spawn python running run_server.py
      backendChild = spawn('python', ['run_server.py'], {
        cwd: backendDir,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      backendChild.stdout?.on('data', (data) => {
        const text = data.toString().trim();
        if (text) {
          console.log(`\x1b[34m[backend]\x1b[0m ${text}`);
        }
      });

      backendChild.stderr?.on('data', (data) => {
        const text = data.toString().trim();
        if (text && !text.includes('UserWarning')) {
          console.log(`\x1b[33m[backend]\x1b[0m ${text}`);
        }
      });

      backendChild.on('error', (err) => {
        console.error('\x1b[31m%s\x1b[0m', ` [backend] Failed to spawn Python backend: ${err.message}`);
      });

      backendChild.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          console.log(`\x1b[31m[backend] Backend exited with code ${code}\x1b[0m`);
        }
      });

      // Poll until backend is online
      let attempts = 0;
      const pollInterval = setInterval(async () => {
        attempts++;
        const ready = await checkBackendAlive(8000);
        if (ready) {
          clearInterval(pollInterval);
          console.log('\x1b[32m%s\x1b[0m', ' [backend] [+] NeuroScan Backend is ONLINE and ready for inference!');
        } else if (attempts >= 40) {
          clearInterval(pollInterval);
          console.log('\x1b[33m%s\x1b[0m', ' [backend] [!] Warning: Backend health check timed out. Retrying on demand.');
        }
      }, 500);

      // Clean shutdown when Vite stops
      process.on('exit', killBackend);
      process.on('SIGINT', killBackend);
      process.on('SIGTERM', killBackend);

      if (server.httpServer) {
        server.httpServer.on('close', killBackend);
      }
    },
  };
}
