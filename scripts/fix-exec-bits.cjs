/* electron-builder drops exec bits on Linux resources (it loses +x on some
 * unpacked native binaries) — re-chmod after packing. */
const fs = require('fs')
const path = require('path')

exports.default = function fixExecBits(context) {
  const resourcesDir = context.packager.appInfo.stagingResourceDirectory
  if (!fs.existsSync(resourcesDir)) return
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.name.endsWith('.sh') || entry.name.endsWith('.so')) {
        fs.chmodSync(full, 0o755)
      }
    }
  }
  walk(resourcesDir)
}