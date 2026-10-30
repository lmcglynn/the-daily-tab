// Minimal headless-Edge driver over the Chrome DevTools Protocol (Node's built-in WebSocket).
// Used by smoke checks and screenshots; no extra dependencies.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const EDGE_PATH =
  process.env.EDGE_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** True when a browser answers on this debugging port. */
async function portInUse(port) {
  try {
    return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok;
  } catch {
    return false;
  }
}

/** Launch Edge headless, optionally with an unpacked extension. */
export async function launchEdge({
  extensionDir,
  port = 9333,
  // HEADED=1 shows a real window: some sites (ESPN, LA Times) refuse headless Edge.
  headless = process.env.HEADED !== '1',
} = {}) {
  if (!existsSync(EDGE_PATH)) throw new Error(`Edge not found at ${EDGE_PATH}`);
  // A browser left over from an earlier run would answer in place of the new one (its old
  // profile and data included): refuse rather than test the wrong browser.
  if (await portInUse(port)) {
    throw new Error(
      `Port ${port} is already in use by another browser, probably a test Edge left running. ` +
        'Close it (or end msedge.exe processes whose command line has "daily-tab-edge-") and retry.',
    );
  }
  const profile = mkdtempSync(join(tmpdir(), 'daily-tab-edge-'));
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=msEdgeSidebarV2,msHubApps,msImplicitSignin,DisableLoadExtensionCommandLineSwitch',
    '--hide-scrollbars',
  ];
  if (headless) args.push('--headless=new');
  if (extensionDir) {
    const dir = resolve(extensionDir);
    args.push(`--disable-extensions-except=${dir}`, `--load-extension=${dir}`);
  }
  args.push('about:blank');
  const proc = spawn(EDGE_PATH, args, { stdio: 'ignore' });

  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`${base}/json/version`);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    await sleep(100);
  }

  const browser = {
    base,
    async targets() {
      return (await fetch(`${base}/json/list`)).json();
    },
    async newPage(url = 'about:blank') {
      const res = await fetch(`${base}/json/new?${encodeURI(url)}`, { method: 'PUT' });
      const t = await res.json();
      return connect(t.webSocketDebuggerUrl);
    },
    async attach(target) {
      return connect(target.webSocketDebuggerUrl);
    },
    async close() {
      // Ask the browser to quit, then end its whole process tree: killing only the process we
      // started leaves Edge's own browser process running on Windows.
      try {
        const { webSocketDebuggerUrl } = await (await fetch(`${base}/json/version`)).json();
        const ws = new WebSocket(webSocketDebuggerUrl);
        await new Promise((done) => {
          ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
          ws.onclose = done;
          ws.onerror = done;
          setTimeout(done, 2000);
        });
      } catch {
        /* already gone */
      }
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        proc.kill('SIGKILL');
      }
      for (let i = 0; i < 30 && (await portInUse(port)); i++) await sleep(100);
      await sleep(300);
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        /* Edge may still hold files briefly */
      }
    },
  };
  return browser;
}

/** Wait until a target matching `pred` appears. */
export async function waitForTarget(browser, pred, timeoutMs = 10000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const t = (await browser.targets()).find(pred);
    if (t) return t;
    await sleep(150);
  }
  throw new Error('target not found');
}

/**
 * Our extension's service worker, identified by manifest name (Edge's own component extensions
 * also run workers named background.js). Returns { target, session, extId }.
 */
export async function findExtensionWorker(browser, name = 'The Daily Tab', timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    for (const t of await browser.targets()) {
      if (t.type !== 'service_worker' || !t.url.startsWith('chrome-extension://')) continue;
      const session = await connect(t.webSocketDebuggerUrl).catch(() => null);
      if (!session) continue;
      const got = await session
        .eval(`globalThis.chrome?.runtime?.getManifest?.().name ?? null`)
        .catch(() => null);
      if (got === name) return { target: t, session, extId: new URL(t.url).host };
      session.close();
    }
    await sleep(250);
  }
  throw new Error(`service worker for "${name}" not found`);
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message));
      else res(msg.result);
    } else if (msg.method) {
      for (const l of listeners) l(msg);
    }
  };
  const session = {
    send(method, params = {}) {
      const myId = ++id;
      ws.send(JSON.stringify({ id: myId, method, params }));
      return new Promise((res, rej) => pending.set(myId, { res, rej }));
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    // CDP Runtime.evaluate inside the headless test page; dev-only, expressions are our own literals.
    async eval(expression) {
      const r = await session.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval');
      return r.result.value;
    },
    async navigate(url) {
      await session.send('Page.enable');
      const loaded = new Promise((res) => {
        const off = session.on((m) => {
          if (m.method === 'Page.loadEventFired') {
            off();
            res();
          }
        });
      });
      await session.send('Page.navigate', { url });
      await loaded;
    },
    close() {
      ws.close();
    },
  };
  return session;
}

export { sleep };
