<script lang="ts" setup>
import { announcementConfig, dismissAnnouncement, shouldShowAnnouncement } from "@@/config/announcement"

const { t } = useI18n()

const visible = ref(false)

onMounted(() => {
  // URL 带 ?announcement 时强制弹出，用于预览公告效果
  visible.value = shouldShowAnnouncement() || new URLSearchParams(window.location.search).has("announcement")
})

function handleClose() {
  dismissAnnouncement()
  visible.value = false
}
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="visible" class="announcement-overlay" @click.self="handleClose">
      <div class="announcement-modal">
        <div class="announcement-text">
          <span class="announcement-title">{{ t(announcementConfig.message.title) }}</span>
          <span class="announcement-message">{{ t(announcementConfig.message.content) }}</span>
          <a
            v-if="announcementConfig.link"
            :href="announcementConfig.link.url"
            target="_blank"
            rel="noopener noreferrer"
            class="announcement-link"
            @click="handleClose"
          >
            {{ announcementConfig.link.text }}
            <span class="link-arrow">→</span>
          </a>
        </div>
        <button class="announcement-close" :title="t('关闭')" @click="handleClose">
          ✕
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.announcement-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
  padding: 24px 0;
}

.announcement-modal {
  position: relative;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  padding: 32px 32px 28px;
  max-width: 520px;
  width: 90%;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  color: var(--el-text-color-primary);
}

.announcement-text {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.announcement-title {
  font-weight: 700;
  font-size: 20px;
  color: var(--el-color-primary);
}

.announcement-message {
  font-size: 14px;
  color: var(--el-text-color-regular);
  line-height: 1.8;
  white-space: pre-line;
  text-align: left;
}

.announcement-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--el-text-color-primary);
  text-decoration: none;
  background: transparent;
  border: 1px solid var(--el-border-color);
  padding: 6px 22px;
  border-radius: 6px;
  font-weight: 500;
  font-size: 14px;
  transition:
    color 0.2s ease,
    border-color 0.2s ease;
  margin-top: 4px;

  &:hover {
    color: var(--el-color-primary);
    border-color: var(--el-color-primary);
  }

  .link-arrow {
    font-size: 14px;
    transition: transform 0.2s ease;
  }

  &:hover .link-arrow {
    transform: translateX(3px);
  }
}

.announcement-close {
  position: absolute;
  top: 12px;
  right: 12px;
  background: var(--el-fill-color-light);
  border: none;
  color: var(--el-text-color-secondary);
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.2s ease;
  padding: 0;
  line-height: 1;

  &:hover {
    background: var(--el-fill-color);
    color: var(--el-text-color-primary);
  }
}

// 过渡动画
.modal-fade-enter-active {
  transition: all 0.3s ease;
}
.modal-fade-leave-active {
  transition: all 0.2s ease;
}
.modal-fade-enter-from {
  opacity: 0;
}
.modal-fade-enter-from .announcement-modal {
  transform: scale(0.9) translateY(20px);
}
.modal-fade-leave-to {
  opacity: 0;
}
</style>
