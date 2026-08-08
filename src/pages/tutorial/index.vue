<script lang="ts" setup>
import { useI18n } from "vue-i18n"

const { t } = useI18n()

const steps = [
  {
    imgs: [`${import.meta.env.BASE_URL}tutorial/step-1-a.jpg`, `${import.meta.env.BASE_URL}tutorial/step-1-b.jpg`],
    title: "第一步：安装脚本，导出数据",
    text: "在游戏里点击顶部绿色「Milkonomy」按钮，弹出「Copied!」即导出成功。"
  },
  {
    imgs: [`${import.meta.env.BASE_URL}tutorial/step-2-preset.jpg`],
    title: "第二步：切换预设",
    text: "点击绿色数字切换预设（0-9），点「对比」同时查看两个预设的利润差异。"
  },
  {
    imgs: [`${import.meta.env.BASE_URL}tutorial/step-3-buttons.jpg`],
    title: "第三步：导入数据",
    text: "点「快速导入数据」一键覆盖当前预设，或点「导入」选择性粘贴。"
  },
  {
    imgs: [`${import.meta.env.BASE_URL}tutorial/step-4-import.jpg`],
    title: "第四步：粘贴并确认",
    text: "粘贴 JSON 数据，可选「数据升级」合并到其他预设，确认后点「确定」。"
  }
]
</script>

<template>
  <div class="tutorial-page">
    <div class="page-head">
      <h1>使用教程</h1>
      <p class="sub-title">
        从脚本安装到数据导入，4 步搞定
      </p>
    </div>

    <div class="steps">
      <el-card v-for="(step, i) in steps" :key="i" class="step-card">
        <div class="step-header">
          <span class="step-num">{{ i + 1 }}</span>
          <h3>{{ step.title }}</h3>
        </div>
        <div class="step-body">
          <div class="step-imgs">
            <img
              v-for="(img, j) in step.imgs"
              :key="j"
              :src="img"
              :alt="`${step.title} - 图${j + 1}`"
              class="step-img"
            >
          </div>
          <p class="step-text">
            {{ step.text }}
          </p>
        </div>
      </el-card>
    </div>

    <div class="links">
      <p>必需链接：</p>
      <a href="https://www.tampermonkey.net/" target="_blank">Tampermonkey 插件</a>
      <span>→</span>
      <a href="https://home.greasyfork.org.cn/zh-hans/info#/zh-CN/scripts/587094/detail" target="_blank">安装脚本</a>
      <span>→</span>
      <a href="https://www.milkywayidle.com/" target="_blank">打开游戏</a>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.tutorial-page {
  padding: 20px;
  max-width: 720px;
  margin: 0 auto;
}

.page-head {
  text-align: center;
  margin-bottom: 32px;
}

.page-head h1 {
  margin: 0 0 8px;
  font-size: 34px;
}

.sub-title {
  color: #999;
  font-size: 15px;
}

.steps {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.step-card {
  :deep(.el-card__body) {
    padding: 24px;
  }
}

.step-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.step-num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #409eff;
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  flex-shrink: 0;
}

.step-header h3 {
  margin: 0;
  font-size: 20px;
}

.step-body {
  padding-left: 52px;
}

.step-imgs {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.step-img {
  border-radius: 8px;
  background: #1a1a2e;
  max-width: 100%;
  flex: 1 1 280px;
}

.step-text {
  color: #555;
  line-height: 1.8;
  font-size: 15px;
}

.links {
  margin-top: 32px;
  text-align: center;
  padding: 20px;
  background: #f5f7fa;
  border-radius: 8px;
  color: #666;

  p {
    margin: 0 0 8px;
    font-weight: 600;
  }

  a {
    color: #409eff;
    margin: 0 6px;
  }

  span {
    color: #ccc;
    margin: 0 4px;
  }
}
</style>
