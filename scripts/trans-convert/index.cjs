const data = require("./data.json")
const trans = require("./trans.json")

const result = {}
for (const [key, item] of Object.entries(data.itemDetailMap)) {
  result[item.name] = trans[key]
}

const fs = require("node:fs")
const path = require("node:path")

fs.writeFileSync(
  path.join(__dirname, "result.json"),
  JSON.stringify(result, null, 2),
  "utf-8"
)
