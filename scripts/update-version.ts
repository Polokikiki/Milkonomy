import { execSync } from "node:child_process"
import fs from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 获取 commit 数量
function getCommitCount(): number {
  try {
    const count = execSync("git rev-list --count HEAD").toString().trim()
    return Number.parseInt(count, 10) + 1 // +1 因为包含本次提交
  } catch {
    return 0
  }
}

// 更新 package.json
function updateVersion() {
  const packagePath = resolve(__dirname, "../package.json")
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf-8"))

  // 获取主版本号 (1.0)
  const baseVersion = pkg.version.split(".").slice(0, 2).join(".")
  // 获取 commit 数量作为第三位版本号
  const buildNumber = getCommitCount()

  // 更新版本号为 1.0.123 格式
  pkg.version = `${baseVersion}.${buildNumber}`

  // 写回 package.json
  fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`)
}

updateVersion()
