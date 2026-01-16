import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const [, , command, ...restArgs] = process.argv

if (!command) {
  console.error('Usage: node scripts/tauri.mjs <dev|build>')
  process.exit(1)
}

const projectRoot = process.cwd()
const env = { ...process.env }

const devServerHost = '127.0.0.1'
const devServerPort = 1420

if (process.platform === 'win32') {
  const cargoBin = path.join(os.homedir(), '.cargo', 'bin')
  if (existsSync(cargoBin)) {
    const sep = path.delimiter
    const currentPath = env.PATH ?? ''
    if (!currentPath.toLowerCase().includes(cargoBin.toLowerCase())) {
      env.PATH = `${cargoBin}${sep}${currentPath}`
    }
  }
}

const tauriCliEntry = path.join(
  projectRoot,
  'node_modules',
  '@tauri-apps',
  'cli',
  'tauri.js',
)
if (!existsSync(tauriCliEntry)) {
  console.error('Tauri CLI entry not found. Did you run pnpm install?')
  process.exit(1)
}

const viteEntry = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')
const tscEntry = path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc')

function runNode(entryFile, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [entryFile, ...args], {
      stdio: 'inherit',
      env,
      cwd: projectRoot,
    })
    child.on('exit', (code) => resolve(code ?? 1))
  })
}

function runTauri(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [tauriCliEntry, ...args], {
      stdio: 'inherit',
      env,
      cwd: projectRoot,
    })
    child.on('exit', (code) => resolve(code ?? 1))
  })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForDevServerReady({ timeoutMs }) {
  const startedAt = Date.now()
  const url = `http://${devServerHost}:${devServerPort}/`

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'GET' })
      if (res.ok) return
    } catch {
      // ignore and retry
    }
    await sleep(200)
  }

  throw new Error(`Dev server did not become ready at ${url} within ${timeoutMs}ms`)
}

function stopChild(child) {
  if (!child || child.killed) return

  if (process.platform === 'win32' && typeof child.pid === 'number') {
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', shell: true })
    return
  }

  try {
    child.kill('SIGINT')
  } catch {
    // ignore
  }
}

if (command === 'build') {
  const tscCode = await runNode(tscEntry, ['-b'])
  if (tscCode !== 0) process.exit(tscCode)

  const viteCode = await runNode(viteEntry, ['build'])
  if (viteCode !== 0) process.exit(viteCode)

  const tauriCode = await runTauri(['build', ...restArgs])
  process.exit(tauriCode)
}

if (command === 'dev') {
  const viteChild = spawn(process.execPath, [viteEntry, 'dev', '--host', devServerHost, '--port', String(devServerPort)], {
    stdio: 'inherit',
    env,
    cwd: projectRoot,
  })

  const cleanup = () => stopChild(viteChild)
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
  process.on('exit', cleanup)

  try {
    await waitForDevServerReady({ timeoutMs: 30_000 })
  } catch (e) {
    cleanup()
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  }

  const tauriCode = await runTauri([
    'dev',
    '--no-dev-server-wait',
    '-c',
    'src-tauri/tauri.dev.conf.json',
    ...restArgs,
  ])
  cleanup()

  process.exit(tauriCode)
}

console.error(`Unknown command: ${command}`)
process.exit(1)
