<script lang="ts" setup>
import { formatCountdown, freezeConfig, getTimeUntilReopen } from "@@/config/freeze"

const { t } = useI18n()

const countdown = ref({
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0
})

// 更新倒计时
function updateCountdown() {
  const remaining = getTimeUntilReopen()
  countdown.value = formatCountdown(remaining)
}

// 每秒更新倒计时
onMounted(() => {
  updateCountdown()
  const timer = setInterval(updateCountdown, 1000)
  onUnmounted(() => clearInterval(timer))
})
</script>

<template>
  <div class="freeze-banner">
    <div class="freeze-banner-content">
      <!-- 始终可见的倒计时部分 -->
      <div class="freeze-countdown-compact">
        <div class="freeze-countdown">
          <div class="countdown-item">
            <span class="countdown-value">{{ countdown.days }}</span>
            <span class="countdown-label">{{ t('天') }}</span>
          </div>
          <span class="countdown-separator">:</span>
          <div class="countdown-item">
            <span class="countdown-value">{{ countdown.hours.toString().padStart(2, '0') }}</span>
            <span class="countdown-label">{{ t('时') }}</span>
          </div>
          <span class="countdown-separator">:</span>
          <div class="countdown-item">
            <span class="countdown-value">{{ countdown.minutes.toString().padStart(2, '0') }}</span>
            <span class="countdown-label">{{ t('分') }}</span>
          </div>
          <span class="countdown-separator">:</span>
          <div class="countdown-item">
            <span class="countdown-value">{{ countdown.seconds.toString().padStart(2, '0') }}</span>
            <span class="countdown-label">{{ t('秒') }}</span>
          </div>
        </div>
        <span class="expand-hint">▼</span>
      </div>

      <!-- 悬停时展开的详细信息 -->
      <div class="freeze-details">
        <div class="details-header">
          <div class="freeze-icon">
            <span class="main-icon">⏸️</span>
            <span class="sub-icon">🎮</span>
          </div>
          <div class="freeze-message">
            <span class="freeze-title">{{ t(freezeConfig.message.title) }}</span>
            <span class="freeze-subtitle">{{ t('重新开放倒计时') }}</span>
          </div>
          <div class="freeze-countdown">
            <div class="countdown-item">
              <span class="countdown-value">{{ countdown.days }}</span>
              <span class="countdown-label">{{ t('天') }}</span>
            </div>
            <span class="countdown-separator">:</span>
            <div class="countdown-item">
              <span class="countdown-value">{{ countdown.hours.toString().padStart(2, '0') }}</span>
              <span class="countdown-label">{{ t('时') }}</span>
            </div>
            <span class="countdown-separator">:</span>
            <div class="countdown-item">
              <span class="countdown-value">{{ countdown.minutes.toString().padStart(2, '0') }}</span>
              <span class="countdown-label">{{ t('分') }}</span>
            </div>
            <span class="countdown-separator">:</span>
            <div class="countdown-item">
              <span class="countdown-value">{{ countdown.seconds.toString().padStart(2, '0') }}</span>
              <span class="countdown-label">{{ t('秒') }}</span>
            </div>
          </div>
          <div class="freeze-date">
            {{ new Date(freezeConfig.endDate).toLocaleString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
          </div>
        </div>

        <div class="details-content">
          <p class="message-main">
            {{ t(freezeConfig.message.content) }}
          </p>

          <div class="message-features">
            <div class="feature-item">
              <span class="feature-icon">💗</span>
              <span>{{ t('缅怀共同的游戏时光') }}</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">🌹</span>
              <span>{{ t('铭记每一位离开的玩家') }}</span>
            </div>
          </div>

          <div class="available-info">
            <span class="info-label">{{ t('暂停期间可访问') }}:</span>
            <span class="info-pages">{{ t('英灵殿') }}、{{ t('建议反馈') }}、{{ t('打赏') }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.freeze-banner {
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  background: linear-gradient(135deg, #2d2d4a 0%, #1a1a2e 100%);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  height: 50px;
  width: 280px;
  border-radius: 0 0 12px 12px;
  overflow: visible;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  pointer-events: auto;

  &:hover {
    height: 280px;
    width: 100%;
    max-width: 100%;
    border-radius: 0;
    overflow-y: visible;

    .expand-hint {
      opacity: 0;
    }

    .freeze-countdown-compact {
      opacity: 0;
      pointer-events: none;
    }

    .freeze-details {
      opacity: 1;
      pointer-events: auto;
    }
  }
}

@keyframes slideDown {
  from {
    transform: translateY(-100%);
  }
  to {
    transform: translateY(0);
  }
}

.freeze-banner-content {
  position: relative;
  width: 100%;
  height: 100%;
  max-width: 1400px;
  margin: 0 auto;
  color: #ffffff;
}

// 紧凑模式 - 默认显示
.freeze-countdown-compact {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 6px 20px;
  opacity: 1;
  transition: opacity 0.3s ease;

  .expand-hint {
    position: absolute;
    right: 12px;
    font-size: 10px;
    opacity: 0.6;
    transition: opacity 0.3s ease;
  }
}

// 详细信息 - 悬停时显示
.freeze-details {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px 30px 24px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
  overflow: visible;
  box-sizing: border-box;
}

.details-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  min-height: 50px;
  padding: 6px 0;
}

.freeze-icon {
  position: relative;
  width: 45px;
  height: 45px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  .main-icon {
    font-size: 36px;
    animation: pulse 2s ease-in-out infinite;
  }

  .sub-icon {
    position: absolute;
    bottom: -5px;
    right: -5px;
    font-size: 18px;
    animation: iconFloat 3s ease-in-out infinite;
  }
}

@keyframes iconFloat {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-3px);
  }
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
}

.freeze-message {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;

  .freeze-title {
    font-size: 15px;
    font-weight: bold;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    white-space: nowrap;
  }

  .freeze-subtitle {
    font-size: 11px;
    opacity: 0.9;
    white-space: nowrap;
  }
}

.freeze-countdown {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  backdrop-filter: blur(10px);
  flex-shrink: 0;
}

.countdown-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 35px;

  .countdown-value {
    font-size: 20px;
    font-weight: 600;
    line-height: 1;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .countdown-label {
    font-size: 10px;
    opacity: 0.9;
    margin-top: 2px;
  }
}

.countdown-separator {
  font-size: 18px;
  font-weight: bold;
  opacity: 0.7;
  animation: blink 1s ease-in-out infinite;
}

@keyframes blink {
  0%,
  100% {
    opacity: 0.8;
  }
  50% {
    opacity: 0.3;
  }
}

.freeze-date {
  font-size: 12px;
  font-weight: 500;
  padding: 5px 10px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  white-space: nowrap;
  flex-shrink: 0;
}

.details-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0 20px;
  max-width: 1200px;
  margin: 0 auto;

  .message-main {
    font-size: 15px;
    line-height: 1.8;
    text-align: center;
    margin: 0;
    opacity: 0.95;
    font-weight: 500;
  }

  .message-features {
    display: flex;
    gap: 24px;
    justify-content: center;
    flex-wrap: wrap;
  }

  .feature-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;

    .feature-icon {
      font-size: 18px;
    }
  }

  .available-info {
    text-align: center;
    font-size: 13px;
    padding: 8px 16px;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 8px;

    .info-label {
      opacity: 0.9;
      margin-right: 8px;
    }

    .info-pages {
      font-weight: 600;
    }
  }
}

// 响应式设计
@media (max-width: 768px) {
  .freeze-banner {
    height: 40px;
    width: 85%;
    max-width: 220px;
    border-radius: 0 0 12px 12px;

    &:hover {
      height: auto;
      padding-bottom: 16px;
      width: 100%;
      max-width: 100%;
      border-radius: 0;
    }
  }

  .freeze-countdown-compact {
    height: 40px;
    gap: 6px;
    padding: 6px 15px;

    .expand-hint {
      font-size: 10px;
      right: 8px;
    }
  }

  .freeze-details {
    min-height: auto;
    height: auto;
    position: relative;
    gap: 12px;
    padding: 12px 15px 16px;
  }

  .details-header {
    gap: 10px;
    flex-direction: column;
    min-height: auto;
    padding: 0;
  }

  .freeze-icon {
    width: 35px;
    height: 35px;

    .main-icon {
      font-size: 28px;
    }

    .sub-icon {
      font-size: 14px;
    }
  }

  .freeze-message {
    text-align: center;
    width: 100%;

    .freeze-title {
      font-size: 14px;
    }

    .freeze-subtitle {
      font-size: 11px;
    }
  }

  .freeze-countdown {
    gap: 4px;
    padding: 6px 10px;
  }

  .countdown-item {
    min-width: 28px;

    .countdown-value {
      font-size: 18px;
    }

    .countdown-label {
      font-size: 9px;
    }
  }

  .countdown-separator {
    font-size: 14px;
  }

  .freeze-date {
    font-size: 10px;
    padding: 4px 8px;
    width: 100%;
    text-align: center;
  }

  .details-content {
    padding: 0 5px;
    gap: 12px;

    .message-main {
      font-size: 12px;
      line-height: 1.6;
    }

    .message-features {
      gap: 10px;
      flex-direction: column;
      align-items: center;
    }

    .feature-item {
      font-size: 11px;

      .feature-icon {
        font-size: 14px;
      }
    }

    .available-info {
      font-size: 11px;
      padding: 6px 10px;
    }
  }
}
</style>
