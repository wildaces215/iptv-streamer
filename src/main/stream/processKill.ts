import { spawn } from 'node:child_process'

/** Best-effort "is this pid alive" check. */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Kill a process and all its children. On POSIX this kills the whole process
 * group (spawned with detached: true); on Windows the negative-pid group
 * signal doesn't exist, so taskkill /T /F does the same job.
 */
export function killProcessTree(pid: number): void {
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
    } catch {
      // process already gone
    }
    return
  }
  try {
    process.kill(-pid, 'SIGKILL')
    return
  } catch {
    // no process group (e.g. not spawned detached) — fall through
  }
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // already gone
  }
}