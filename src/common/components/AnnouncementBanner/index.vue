<script lang="ts" setup>
import { announcementConfig, dismissAnnouncement, shouldShowAnnouncement } from "@@/config/announcement"

const { t } = useI18n()

const visible = ref(false)

onMounted(() => {
  visible.value = shouldShowAnnouncement()
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
        <div class="announcement-icon">
          🎉
        </div>
        <div class="announcement-text">
          <span class="announcement-title">{{ t(announcementConfig.message.title) }}</span>
          <span class="announcement-message">{{ t(announcementConfig.message.content) }}</span>
          <a
            v-if="announcementConfig.link"
            :href="announcementConfig.link.url"
            target="_blank"
            rel="noopener noreferrer"
            class="announcement-link"
          >
            <span class="link-icon">⭐</span>
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
}

.announcement-modal {
  position: relative;
  background: #ffffff;
  border-radius: 12px;
  padding: 40px 32px 32px;
  max-width: 420px;
  width: 90%;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  color: #333;
}

.announcement-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.announcement-text {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.announcement-title {
  font-weight: 700;
  font-size: 20px;
  color: #667eea;
}

.announcement-message {
  font-size: 14px;
  color: #666;
  line-height: 1.6;
}

.announcement-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: #ffffff;
  text-decoration: none;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 8px 24px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
  transition: all 0.25s ease;
  margin-top: 8px;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .link-icon {
    font-size: 14px;
  }

  .link-arrow {
    font-size: 14px;
    transition: transform 0.25s ease;
  }

  &:hover .link-arrow {
    transform: translateX(3px);
  }
}

.announcement-close {
  position: absolute;
  top: 12px;
  right: 12px;
  background: #f0f0f0;
  border: none;
  color: #999;
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
    background: #e0e0e0;
    color: #333;
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
