// 将milky_trans.json 转换为 output/yyyy-mm-dd.json
// 旧格式{'item_id':'translation'}
// 新格式{'item_name': 'translation'}
// 其中item_id到item_name的映射关系在 ../../public/data/data.json 中

const fs = require("node:fs")

let data = fs.readFileSync("../../../public/data/data.json", "utf8")
let trans = fs.readFileSync("./milky_trans.json", "utf8")
data = JSON.parse(data)
trans = JSON.parse(trans)
const output = {}
for (const item_id of Object.keys(trans)) {
  console.log("item_id", item_id)
  const item_name = data.itemDetailMap[item_id].name
  output[item_name] = trans[item_id]
}
// object的key按照字母顺序排序
const sortedOutput = Object.keys(output)
  .sort()
  .reduce((obj, key) => {
    obj[key] = output[key]
    return obj
  }, {})

// 输出到文件
const date = new Date()
const year = date.getFullYear()
const month = String(date.getMonth() + 1).padStart(2, "0")
const day = String(date.getDate()).padStart(2, "0")
const outputPath = `./output/${year}-${month}-${day}.json`
fs.writeFileSync(outputPath, JSON.stringify(sortedOutput, null, 2), "utf8")
