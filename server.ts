import {spawn, spawnSync, type ChildProcess} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express, {type NextFunction, type Request, type Response} from 'express';
import {createCloudRunErpRouter} from './server/cloudRunErpEngine.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const FASTAPI_PORT = Number(process.env.FASTAPI_INTERNAL_PORT || 8001);
const FASTAPI_ORIGIN = `http://127.0.0.1:${FASTAPI_PORT}`;

interface PythonRunnerSpec {
  cmd: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

let uvicornProcess: ChildProcess | null = null;
let backendReadyPromise: Promise<void> | null = null;
let fastApiUnavailable = false;

function buildPythonEnv(): NodeJS.ProcessEnv {
  const extraPaths: string[] = [process.cwd()];
  const venvLibDir = path.resolve(process.cwd(), '.venv', 'lib');
  if (fs.existsSync(venvLibDir)) {
    try {
      for (const entry of fs.readdirSync(venvLibDir)) {
        const sitePkg = path.join(venvLibDir, entry, 'site-packages');
        if (fs.existsSync(sitePkg)) {
          extraPaths.push(sitePkg);
        }
      }
    } catch {
      // Ignore directory scan errors
    }
  }
  const winSitePkg = path.resolve(process.cwd(), '.venv', 'Lib', 'site-packages');
  if (fs.existsSync(winSitePkg)) {
    extraPaths.push(winSitePkg);
  }
  if (process.env.PYTHONPATH) {
    extraPaths.push(process.env.PYTHONPATH);
  }

  return {
    ...process.env,
    PYTHONPATH: extraPaths.join(path.delimiter),
    JWT_SECRET: process.env.JWT_SECRET || 'dev-ephemeral-gateway-jwt-secret-change-in-production',
    BOOTSTRAP_ADMIN_USERNAME: process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin',
    BOOTSTRAP_ADMIN_PASSWORD: process.env.BOOTSTRAP_ADMIN_PASSWORD || 'ChangeThis-Immediately-123!',
    SEED_DEMO_DATA: process.env.SEED_DEMO_DATA || 'false',
  };
}

function detectWorkingPythonFastApi(): PythonRunnerSpec | null {
  if (process.env.DISABLE_PYTHON_BACKEND === 'true') {
    return null;
  }

  const pyEnv = buildPythonEnv();
  const candidates = [
    process.env.PYTHON_BIN,
    path.resolve(process.cwd(), '.venv', 'bin', 'python'),
    path.resolve(process.cwd(), '.venv', 'Scripts', 'python.exe'),
    'python3',
    'python',
  ].filter((c): c is string => Boolean(c));

  for (const candidate of candidates) {
    try {
      const probe = spawnSync(
        candidate,
        ['-c', 'import uvicorn, fastapi, sqlalchemy; print("ERP_PY_OK")'],
        {
          cwd: process.cwd(),
          env: pyEnv,
          timeout: 5000,
          encoding: 'utf8',
        },
      );
      if (!probe.error && probe.status === 0 && String(probe.stdout || '').includes('ERP_PY_OK')) {
        return {
          cmd: candidate,
          args: ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(FASTAPI_PORT)],
          env: pyEnv,
        };
      }
    } catch {
      // Try next candidate
    }
  }

  return null;
}

async function isErpFastApiHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${FASTAPI_ORIGIN}/health`);
    if (!res.ok) return false;
    const body = (await res.json()) as {status?: string; service?: string};
    return body?.status === 'ok' && Boolean(body?.service);
  } catch {
    return false;
  }
}

async function waitForFastApiHealth(timeoutMs = 20000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (fastApiUnavailable) {
      throw new Error('FastAPI child process failed to spawn');
    }
    if (await isErpFastApiHealthy()) {
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`FastAPI backend did not respond on ${FASTAPI_ORIGIN}/health within ${timeoutMs}ms`);
}

function startFastApiBackend(spec: PythonRunnerSpec): Promise<void> {
  if (backendReadyPromise) {
    return backendReadyPromise;
  }

  backendReadyPromise = (async () => {
    if (await isErpFastApiHealthy()) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const child = spawn(spec.cmd, spec.args, {
        cwd: process.cwd(),
        env: spec.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      uvicornProcess = child;

      child.on('error', (err) => {
        console.warn(`[fastapi] spawn error (${err.message}); falling back to TypeScript ERP engine.`);
        fastApiUnavailable = true;
        uvicornProcess = null;
        backendReadyPromise = null;
        if (!settled) {
          settled = true;
          reject(err);
        }
      });

      child.on('spawn', () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });

      child.stdout?.on('data', (chunk) => {
        process.stdout.write(`[fastapi] ${chunk}`);
      });
      child.stderr?.on('data', (chunk) => {
        process.stderr.write(`[fastapi] ${chunk}`);
      });
      child.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          console.warn(`[fastapi] exited with code ${code}`);
        }
        uvicornProcess = null;
        backendReadyPromise = null;
      });
    });

    await waitForFastApiHealth();
  })();

  return backendReadyPromise;
}

async function createServer() {
  const app = express();
  const pythonSpec = detectWorkingPythonFastApi();
  const cloudRunErpRouter = createCloudRunErpRouter();
  const rawBodyMiddleware = express.raw({type: '*/*', limit: '10mb'});

  if (pythonSpec) {
    startFastApiBackend(pythonSpec).catch((err) => {
      console.warn('[erp] FastAPI startup failed, activating built-in TypeScript ERP engine:', err.message || err);
      fastApiUnavailable = true;
    });
  } else {
    fastApiUnavailable = true;
    console.log('[erp] Python/FastAPI runtime not present in container; serving /api/* via built-in TypeScript ERP engine.');
  }

  app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
    if (!pythonSpec || fastApiUnavailable) {
      cloudRunErpRouter(req, res, next);
      return;
    }

    try {
      await startFastApiBackend(pythonSpec);
    } catch {
      fastApiUnavailable = true;
      cloudRunErpRouter(req, res, next);
      return;
    }

    rawBodyMiddleware(req, res, async (rawErr) => {
      if (rawErr) {
        next(rawErr);
        return;
      }
      try {
        const upstreamPath = req.originalUrl.replace(/^\/api/, '') || '/';
        const targetUrl = `${FASTAPI_ORIGIN}${upstreamPath}`;

        const forwardHeaders: Record<string, string> = {};
        if (req.headers['authorization']) {
          forwardHeaders['authorization'] = String(req.headers['authorization']);
        }
        if (req.headers['content-type']) {
          forwardHeaders['content-type'] = String(req.headers['content-type']);
        }
        if (req.headers['accept']) {
          forwardHeaders['accept'] = String(req.headers['accept']);
        }

        const hasBody =
          !['GET', 'HEAD'].includes(req.method.toUpperCase()) &&
          Buffer.isBuffer(req.body) &&
          req.body.length > 0;

        const upstreamRes = await fetch(targetUrl, {
          method: req.method,
          headers: forwardHeaders,
          body: hasBody ? new Uint8Array(req.body) : undefined,
        });

        res.status(upstreamRes.status);
        const contentType = upstreamRes.headers.get('content-type');
        if (contentType) {
          res.setHeader('Content-Type', contentType);
        }
        const contentDisposition = upstreamRes.headers.get('content-disposition');
        if (contentDisposition) {
          res.setHeader('Content-Disposition', contentDisposition);
        }
        const wwwAuth = upstreamRes.headers.get('www-authenticate');
        if (wwwAuth) {
          res.setHeader('WWW-Authenticate', wwwAuth);
        }

        const arrayBuf = await upstreamRes.arrayBuffer();
        res.send(Buffer.from(arrayBuf));
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Backend gateway error';
        res.status(502).json({detail: `FastAPI gateway error: ${msg}`});
      }
    });
  });

  const distPath = path.resolve(process.cwd(), 'dist');
  const hasBuiltDist = fs.existsSync(path.join(distPath, 'index.html'));
  const isDevLifecycle = process.env.npm_lifecycle_event === 'dev';
  const serveStaticDist =
    hasBuiltDist &&
    (process.env.NODE_ENV === 'production' || Boolean(process.env.K_SERVICE) || !isDevLifecycle);

  if (!serveStaticDist) {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        res.sendFile(path.join(distPath, 'index.html'));
        return;
      }
      next();
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`NEXTGEN TECHNIX LIMITED ERP server running at http://0.0.0.0:${PORT}`);
  });

  const shutdown = () => {
    if (uvicornProcess) {
      uvicornProcess.kill('SIGTERM');
    }
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

createServer();
