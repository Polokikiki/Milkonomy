export function number(value: number, decimal = 0) {
  // 如果value~(0,100),保留decimal位小数
  // 否则保留整数
  if (Math.abs(value) >= 0 && Math.abs(value) < 2) {
    value = Math.round(value * (10 ** decimal)) / (10 ** decimal)
  } else if (Math.abs(value) >= 0 && Math.abs(value) < 10) {
    value = Math.round(value * (10 ** Math.min(decimal, 2))) / (10 ** Math.min(decimal, 2))
  } else if (Math.abs(value) >= 10 && Math.abs(value) < 100) {
    value = Math.round(value * (10 ** Math.min(decimal, 1))) / (10 ** Math.min(decimal, 1))
  } else {
    value = Math.round(value)
  }
  // 转成千分位格式
  return toThousandSeparatorFast(value)
  // return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

function toThousandSeparatorFast(value: number) {
  const str = value.toString()
  if (Math.abs(value) < 1000) {
    return str
  }
  let result = ""
  const isNegative = str[0] === "-"
  const length = str.length
  for (let i = isNegative ? 1 : 0; i < length; i++) {
    if (i > 0 && (length - i) % 3 === 0) {
      result += ","
    }
    result += str[i]
  }
  return isNegative ? `-${result}` : result
}

export function costTime(value: number) {
  // return `${Math.floor(value / 10000000) / 100}s`
  let result = ""
  value /= 1000000000
  const h = Math.floor(value / 3600)
  const m = Math.floor(value % 3600 / 60)
  const decimal = h || m ? 0 : 2
  const s = Math.floor(value % 60 * (10 ** decimal)) / (10 ** decimal)
  if (h) {
    result += `${h}h`
  }
  if (m) {
    // 个位数前面补0
    result += `${m < 10 ? "0" : ""}${m}m`
  }
  if (s) {
    result += `${s < 10 ? "0" : ""}${s}s`
  }
  return result
}

export function percent(value: number, decimal = 2) {
  return `${Math.round(value * 100 * (10 ** decimal)) / (10 ** decimal)}%`
}

const priceConfig = ["", "K", "M", "B", "T"]
export function price(value: number) {
  for (let i = 0; i < priceConfig.length; i++) {
    if (Math.abs(value) < 10 ** ((i + 2) * 3 - 1)) {
      return `${number(value / (1000 ** i))}${priceConfig[i]}`
    }
  }
  // 数值超过 1000T
  return number(value)
}

export function money(value: number) {
  for (let i = 0; i < priceConfig.length; i++) {
    if (Math.abs(value) < 10 ** ((i + 1) * 3)) {
      return `${number(value / (1000 ** i), 2)}${priceConfig[i]}`
    }
  }

  return `${value.toLocaleString("en-US")}`
}
