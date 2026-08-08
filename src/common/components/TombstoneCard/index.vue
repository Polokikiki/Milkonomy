<script lang="ts" setup>
import ItemIcon from "@@/components/ItemIcon/index.vue"

const props = withDefaults(defineProps<Props>(), {
  showTitle: true,
  incenseLoading: false,
  hasIncensed: false
})

// Emit定义
const emit = defineEmits<{
  offerIncense: [tombstone: Tombstone]
}>()

const { t } = useI18n()

// 获取当前语言
const { locale } = useI18n()

// Props定义
interface Tombstone {
  昵称: string
  原因?: "banned" | "gambling" | "quit" | "other"
  称号?: string
  描述?: string
  title?: string // 英文称号
  desc?: string // 英文描述
  时间: string
  图标?: string
  审核状态?: string
  上香?: number
  [key: string]: any
}

interface TombstoneConfig {
  title: string
  color: string
  borderColor: string
  bgGradient: string
  icon: string
  shadowColor: string
}

interface Props {
  tombstone: Tombstone
  tombstoneConfig: Record<string, TombstoneConfig>
  showTitle?: boolean // 是否显示称号，默认显示
  incenseLoading?: boolean
  hasIncensed?: boolean
}

// 获取本地化的称号
function getLocalizedTitle(tombstone: Tombstone): string {
  if (locale.value === "en" && tombstone.title) {
    return tombstone.title
  }
  return tombstone.称号 || ""
}

// 获取本地化的描述
function getLocalizedDesc(tombstone: Tombstone): string {
  if (locale.value === "en" && tombstone.desc) {
    return tombstone.desc
  }
  return tombstone.描述 || ""
}

// 获取墓碑样式
function getTombstoneStyle(reason: string) {
  const config = props.tombstoneConfig[reason as keyof typeof props.tombstoneConfig]
  if (!config) return {}
  return {
    background: config.bgGradient,
    borderColor: config.borderColor
  }
}

// 获取墓碑配置
function getTombstoneConfig(reason: string) {
  return props.tombstoneConfig[reason as keyof typeof props.tombstoneConfig] || props.tombstoneConfig.other
}

// 上香点击处理
function handleOfferIncense() {
  emit("offerIncense", props.tombstone)
}
</script>

<template>
  <div
    class="tombstone-card"
    :style="getTombstoneStyle(tombstone.原因!)"
  >
    <!-- 墓碑主体 -->
    <div class="tombstone-body">
      <!-- 个人专属称号 - 在图标上方（可选显示） -->
      <div v-if="showTitle && getLocalizedTitle(tombstone)" class="tombstone-custom-title">
        「{{ getLocalizedTitle(tombstone) }}」
      </div>

      <!-- 物品图标位置 -->
      <div class="tombstone-icon">
        <ItemIcon
          v-if="tombstone.图标"
          :hrid="tombstone.图标"
          :size="64"
        />
        <div v-else class="empty-icon">
          <span>💀</span>
        </div>
      </div>

      <!-- 昵称 -->
      <div class="tombstone-nickname">
        {{ tombstone.昵称 }}
      </div>

      <!-- 分割线 -->
      <div class="tombstone-divider" />

      <!-- 日期 -->
      <div class="tombstone-date">
        {{ tombstone.时间 }}
      </div>

      <!-- 墓志铭 -->
      <div v-if="getLocalizedDesc(tombstone)">
        <el-tooltip
          placement="top"
          :show-after="100"
          :hide-after="100"
          effect="dark"
          popper-class="custom-tooltip"
        >
          <template #content>
            <div class="tooltip-content">
              <div class="tooltip-nickname">
                {{ tombstone.昵称 }}
              </div>
              <p
                v-for="(paragraph, idx) in getLocalizedDesc(tombstone).split('\n').filter(p => p.trim())"
                :key="idx"
                class="tooltip-paragraph"
              >
                {{ paragraph }}
              </p>
            </div>
          </template>
          <div class="tombstone-message">
            <span class="message-text">"{{ getLocalizedDesc(tombstone) }}"</span>
          </div>
        </el-tooltip>
      </div>

      <!-- 上香区域 -->
      <div class="incense-section">
        <div class="incense-count">
          <span v-if="tombstone.上香 && tombstone.上香 > 0">
            {{ tombstone.上香 }}&nbsp;🕯️
          </span>
        </div>
        <el-button
          v-if="!hasIncensed"
          :disabled="hasIncensed || incenseLoading"
          :loading="incenseLoading"
          size="small"
          @click="handleOfferIncense"
        >
          <span class="incense-icon">🕯️</span>
          {{ hasIncensed ? t('已上香') : t('上香') }}
        </el-button>
      </div>
    </div>

    <!-- 右下角：原因称号和emoji -->
    <div class="tombstone-corner">
      <span class="tombstone-emoji">{{ getTombstoneConfig(tombstone.原因!).icon }}</span>
      <div
        class="tombstone-reason"
        :style="{ color: getTombstoneConfig(tombstone.原因!).color }"
      >
        {{ getTombstoneConfig(tombstone.原因!).title }}
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tombstone-card {
  border: 3px solid;
  border-radius: 20px 20px 8px 8px;
  padding: 16px;
  padding-bottom: 28px;
  transition: all 0.3s ease;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  position: relative;
  overflow: visible;
  z-index: 1;

  &:hover {
    transform: translateY(-8px) scale(1.02);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.7);
    z-index: 10000;
  }

  &::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear-gradient(90deg, transparent, currentColor, transparent);
    opacity: 0.5;
  }

  &::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: radial-gradient(circle at center, transparent 0%, rgba(0, 0, 0, 0.3) 100%);
    pointer-events: none;
    z-index: 0;
  }
}

// 右下角：原因称号和emoji
.tombstone-corner {
  position: absolute;
  bottom: 4px;
  right: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  z-index: 1;

  .tombstone-emoji {
    font-size: 28px;
    display: inline-block;
    animation: pulse 2s ease-in-out infinite;
  }
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.1);
    opacity: 0.8;
  }
}

.tombstone-body {
  text-align: center;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: visible;
  position: relative;
  z-index: 2;
}

.tombstone-custom-title {
  font-size: 22px;
  color: #ffd700;
  font-weight: 700;
  margin-bottom: 12px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
  letter-spacing: 1px;
  font-style: italic;
  position: relative;
  display: inline-block;
  padding: 0 8px;
}

.tombstone-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.5);

  .empty-icon {
    font-size: 40px;
    opacity: 0.6;
  }
}

.tombstone-nickname {
  font-size: 18px;
  color: #e0e0e0;
  margin-bottom: 8px;
  font-weight: 600;
}

.tombstone-reason {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.5px;
  text-align: right;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}

.tombstone-divider {
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  margin: 12px 0;
}

.tombstone-date {
  font-size: 13px;
  color: #a0a0a0;
  margin-bottom: 10px;
  font-family: monospace;
}

.tombstone-message {
  font-size: 13px;
  color: #c0c0c0;
  font-style: italic;
  line-height: 1.5;
  padding: 10px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  border-left: 3px solid rgba(255, 255, 255, 0.2);
  margin-bottom: 12px;
  position: relative;
  cursor: help;

  .message-text {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.incense-section {
  margin-top: auto;
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.incense-count {
  font-size: 16px;
  color: #ffd700;
  font-weight: 600;
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.incense-icon {
  margin-right: 4px;
}
</style>

<style lang="scss">
// Tooltip 全局样式 - 需要使用非 scoped 样式来覆盖 Element Plus
.custom-tooltip {
  background: linear-gradient(135deg, rgba(45, 45, 63, 0.98) 0%, rgba(26, 26, 46, 0.98) 100%) !important;
  color: #e8e8e8 !important;
  padding: 16px 20px !important;
  border-radius: 12px !important;
  font-size: 14px !important;
  line-height: 1.6 !important;
  max-width: 400px !important;
  min-width: 200px !important;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7) !important;
  backdrop-filter: blur(12px) !important;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3) !important;
  z-index: 99999 !important;
  white-space: pre-line !important;
  word-wrap: break-word !important;
  word-break: break-word !important;
  border: none !important;

  .tooltip-content {
    margin: 0;
    padding: 0;
  }

  .tooltip-nickname {
    font-size: 16px !important;
    font-weight: 600 !important;
    color: #ffd700 !important;
    margin: 0 0 8px 0 !important;
    padding: 0 0 8px 0 !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2) !important;
    text-align: center !important;
  }

  .tooltip-paragraph {
    margin: 0 0 6px 0 !important;
    padding: 0;
    line-height: 1.6;
  }

  .tooltip-paragraph:last-child {
    margin-bottom: 0 !important;
  }

  .el-popper__arrow::before {
    background: rgba(45, 45, 63, 0.98) !important;
    border: none !important;
  }

  .el-popper__arrow::after {
    border: none !important;
  }
}

// 确保覆盖 Element Plus 的默认样式
.el-popper.custom-tooltip {
  border: none !important;

  .el-popper__arrow {
    border: none !important;
  }

  .el-popper__arrow::before,
  .el-popper__arrow::after {
    border: none !important;
  }
}
</style>
