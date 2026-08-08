import type Calculator from "."
import type { StorageCalculatorItem } from "@/pinia/stores/favorite"
import { CoinifyCalculator, DecomposeCalculator, TransmuteCalculator } from "./alchemy"
import { EnhanceCalculator } from "./enhance"
import { ManufactureCalculator } from "./manufacture"
import { WorkflowCalculator } from "./workflow"

const CLASS_MAP: { [key: string]: any } = {
  DecomposeCalculator,
  TransmuteCalculator,
  ManufactureCalculator,
  CoinifyCalculator,
  EnhanceCalculator
}

const WORKFLOW_CLASS_NAME = "WorkflowCalculator"

export function calculatorConstructable(className: string): boolean {
  return className === WORKFLOW_CLASS_NAME || !!CLASS_MAP[className]
}

function cloneSubConfig(config: StorageCalculatorItem): StorageCalculatorItem {
  // 只保留持久化必需字段，避免把 workflow 构造时注入的 ingredient/productPriceConfigList 带回来
  return {
    id: config.id,
    className: config.className,
    hrid: config.hrid,
    project: config.project,
    action: config.action,
    catalystRank: config.catalystRank
  }
}

export function getCalculatorInstance(
  config: StorageCalculatorItem,
  sellTaxFactor?: number,
  crossStepBalance: boolean = false
): Calculator {
  const className = config.className!
  if (className === WORKFLOW_CLASS_NAME) {
    if (!config.subConfigs?.length) {
      throw new Error("WorkflowCalculator 收藏缺少 subConfigs")
    }
    // 子配置在 WorkflowCalculator 构造里会被原地修改，传副本进去
    const subConfigs = config.subConfigs.map(cloneSubConfig)
    return new WorkflowCalculator(subConfigs, config.project!, sellTaxFactor, crossStepBalance)
  }
  const constructor = CLASS_MAP[className]
  return new constructor(config) as Calculator
}

export function getStorageCalculatorItem(calculator: Calculator): StorageCalculatorItem {
  if (calculator instanceof WorkflowCalculator) {
    if (calculator.configs.some(c => Array.isArray(c))) {
      throw new Error("暂不支持收藏含有数组步骤的工作流")
    }
    const subConfigs = (calculator.configs as StorageCalculatorItem[]).map(cloneSubConfig)
    return {
      id: calculator.id,
      className: calculator.className,
      hrid: calculator.hrid,
      project: calculator.project,
      action: calculator.action,
      subConfigs
    }
  }
  return {
    className: calculator.className,
    id: calculator.id,
    ...calculator.config
  }
}
