<script lang="ts" setup>
import ItemIcon from "@@/components/ItemIcon/index.vue"
import TombstoneCard from "@@/components/TombstoneCard/index.vue"
import axios from "axios"
import { ElLoading, type FormRules } from "element-plus"
import { useGameStoreOutside } from "@/pinia/stores/game"

const { t } = useI18n()
const gameStore = useGameStoreOutside()

// Google Apps Script 提交地址（需要替换为实际地址）
const submitUrl = "https://script.google.com/macros/s/AKfycbzniWRuUF4z75GY2dSIlpE_7k9sUht4xs9NCqRRSxnb0ALRZsSZ1FTj7Rf3j2dGfH4R/exec"

// 上香API地址（需要替换为实际地址）
const incenseUrl = "https://script.google.com/macros/s/AKfycbwnKgjCs6jTNt7zIaEquGiG1Le8R5aAn77Sje5qO35b7i-5du3xRs_1_uMqjmcX4gkJ/exec"

// Google Sheets JSON 数据地址（需要替换为实际地址）
const jsonUrl = "https://opensheet.elk.sh/1TSfl95hekna--yFOHss23Ioapj68OVSWqkr8ifByGkc/1"

// 墓碑类型定义
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

// 墓碑配置
const tombstoneConfig = {
  banned: {
    title: t("封弊者"),
    color: "#DC143C",
    borderColor: "#8B0000",
    bgGradient: "linear-gradient(135deg, #2c0a0a 0%, #1a0000 100%)",
    icon: "⚔️",
    shadowColor: "rgba(220, 20, 60, 0.3)"
  },
  gambling: {
    title: t("赌徒"),
    color: "#FFD700",
    borderColor: "#FFA500",
    bgGradient: "linear-gradient(135deg, #2c2410 0%, #1a1600 100%)",
    icon: "🎰",
    shadowColor: "rgba(255, 215, 0, 0.3)"
  },
  quit: {
    title: t("远行者"),
    color: "#87CEEB",
    borderColor: "#4169E1",
    bgGradient: "linear-gradient(135deg, #0a1a2c 0%, #000c1a 100%)",
    icon: "🌙",
    shadowColor: "rgba(135, 206, 235, 0.3)"
  },
  other: {
    title: t("逝者"),
    color: "#C0C0C0",
    borderColor: "#708090",
    bgGradient: "linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)",
    icon: "✨",
    shadowColor: "rgba(192, 192, 192, 0.3)"
  }
}

// 墓碑列表和加载状态
const tombstones = ref<Tombstone[]>([])
const tombstonesLoading = ref(false)

// 上香loading状态
const incenseLoading = ref(false)

// 表单相关
const refForm = ref()
const form = ref<Tombstone>({
  昵称: "",
  原因: undefined,
  称号: "",
  描述: "",
  时间: "",
  图标: ""
})
const dialogVisible = ref(false)
const dialogLoading = ref(false)
let loadingService: any

// 图标选择对话框
const iconDialogVisible = ref(false)
const iconSearch = ref("")

// 获取所有物品图标
const itemIcons = computed(() => {
  if (!gameStore.gameData) return []

  const items = Object.values(gameStore.gameData.itemDetailMap)
  return items
    .filter(item => item.hrid && item.name)
    .map(item => ({
      hrid: item.hrid,
      name: item.name,
      sortIndex: item.sortIndex || 0
    }))
    .sort((a, b) => a.sortIndex - b.sortIndex)
})

// 获取所有聊天图标
const chatIcons = computed(() => {
  if (!gameStore.gameData?.chatIconDetailMap) return []

  const icons = Object.values(gameStore.gameData.chatIconDetailMap)
  return icons
    .filter((icon: any) => icon.hrid)
    .map((icon: any) => ({
      hrid: icon.hrid,
      name: icon.name,
      sortIndex: icon.sortIndex || 0
    }))
    .sort((a, b) => a.sortIndex - b.sortIndex)
})

// 过滤后的物品图标
const filteredItemIcons = computed(() => {
  if (!iconSearch.value) return itemIcons.value

  const searchLower = iconSearch.value.toLowerCase()
  return itemIcons.value.filter(item =>
    t(item.name).toLowerCase().includes(searchLower)
    || item.hrid.toLowerCase().includes(searchLower)
  )
})

// 过滤后的聊天图标
const filteredChatIcons = computed(() => {
  if (!iconSearch.value) return chatIcons.value

  const searchLower = iconSearch.value.toLowerCase()
  return chatIcons.value.filter(item =>
    t(item.name).toLowerCase().includes(searchLower)
    || item.hrid.toLowerCase().includes(searchLower)
  )
})

// 打开图标选择对话框
function openIconDialog() {
  iconDialogVisible.value = true
  iconSearch.value = ""
}

// 选择图标
function selectIcon(hrid: string) {
  form.value.图标 = hrid
  iconDialogVisible.value = false
}

// 获取图标名称
function getIconName(hrid: string) {
  if (!gameStore.gameData) return ""
  const item = gameStore.gameData.itemDetailMap[hrid]
  if (item) return item.name
  if (gameStore.gameData.chatIconDetailMap) {
    const chatIcon = gameStore.gameData.chatIconDetailMap[hrid]
    if (chatIcon) return chatIcon.name
  }
  return ""
}

// 表单验证规则
const rules = reactive<FormRules>({
  昵称: [{ required: true, message: t("不能为空"), trigger: ["blur", "change"] }],
  原因: [{ required: true, message: t("不能为空"), trigger: ["blur", "change"] }],
  称号: [{ required: true, message: t("不能为空"), trigger: ["blur", "change"] }],
  描述: [{ required: true, message: t("不能为空"), trigger: ["blur", "change"] }],
  时间: [{ required: true, message: t("不能为空"), trigger: ["blur", "change"] }]
})

// 监听对话框加载状态
watch(dialogLoading, (val) => {
  if (val) {
    loadingService = ElLoading.service({
      lock: true,
      target: ".dialog"
    })
  } else {
    loadingService?.close()
  }
})

// 提交表单
function submit() {
  refForm.value.validate((valid: boolean) => {
    if (valid) {
      dialogLoading.value = true
      fetch(submitUrl, {
        redirect: "follow",
        method: "POST",
        body: JSON.stringify(form.value),
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        }
      })
        .then(() => {
          ElMessage.success(t("提交成功，请等待作者审核"))
          dialogVisible.value = false
          form.value = {
            昵称: "",
            原因: undefined,
            称号: "",
            描述: "",
            时间: "",
            图标: ""
          }
          loadData()
        })
        .catch((e) => {
          ElMessage.error(e.message || t("提交失败"))
        })
        .finally(() => {
          dialogLoading.value = false
        })
    }
  })
}

// 加载数据
function loadData() {
  tombstonesLoading.value = true
  axios.get(jsonUrl)
    .then(({ data }) => {
      // 过滤审核通过的数据并按上香数量降序排序
      tombstones.value = data
        .filter((item: any) => item.审核状态 === "1" || item.审核状态 === 1 || item.审核状态 === true)
        .map((item: any) => ({
          昵称: item.昵称,
          原因: item.原因,
          称号: item.称号,
          描述: item.描述,
          title: item.title, // 英文称号
          desc: item.desc, // 英文描述
          时间: item.时间,
          图标: item.图标,
          上香: item.上香 || 0
        }))
        .sort((a: Tombstone, b: Tombstone) => (b.上香 || 0) - (a.上香 || 0))
    })
    .catch((e) => {
      ElMessage.error(e.message || t("加载数据失败"))
      // 使用示例数据作为备用
      tombstones.value = [
        {
          昵称: "XiaoR",
          原因: "banned",
          称号: "青蛙王",
          描述: "邪恶青蛙，贤者饰品操盘者，500B最速达成传说",
          title: "Frog King",
          desc: "Evil Frog, Sage Accessory Manipulator, Legend: Fastest to reach 500B",
          时间: "2025-10-27",
          图标: "/chat_icons/frog",
          上香: 0
        },
        {
          昵称: "DouShaL",
          原因: "banned",
          称号: "奥本海默",
          描述: "核武理论持有者",
          title: "Oppenheimer",
          desc: "Nuclear Weapon Theory Holder",
          时间: "2025-10-27",
          图标: "/chat_icons/frog",
          上香: 0
        },
        {
          昵称: "luyh7",
          原因: "banned",
          称号: "Milkonomy",
          描述: "Milkonomy作者",
          title: "Milkonomy",
          desc: "Author of Milkonomy",
          时间: "2025-10-27",
          图标: "/chat_icons/frog",
          上香: 0
        }
      ]
    })
    .finally(() => {
      tombstonesLoading.value = false
    })
}

// 页面加载时获取数据
loadData()

// 背景音乐
const audioRef = ref<HTMLAudioElement | null>(null)
const isPlaying = ref(false)

// 播放背景音乐
// onMounted(() => {
//   if (audioRef.value) {
//     audioRef.value.play().then(() => {
//       isPlaying.value = true
//     }).catch((e) => {
//       console.log("音频自动播放被浏览器阻止:", e)
//       isPlaying.value = false
//     })
//   }
// })

// 页面卸载时停止音乐
onUnmounted(() => {
  if (audioRef.value) {
    audioRef.value.pause()
    audioRef.value.currentTime = 0
  }
})

// 切换音乐播放状态
function toggleMusic() {
  if (!audioRef.value) return

  if (isPlaying.value) {
    audioRef.value.pause()
    isPlaying.value = false
  } else {
    audioRef.value.play().then(() => {
      isPlaying.value = true
    }).catch((e) => {
      console.error("播放失败:", e)
      ElMessage.error(t("音频播放失败"))
    })
  }
}

// 打开提交对话框
function openDialog() {
  dialogVisible.value = true
  form.value = {
    昵称: "",
    原因: undefined,
    称号: "",
    描述: "",
    时间: "",
    图标: ""
  }
}

// 上香相关
const INCENSE_STORAGE_KEY = "valhalla_incense_date"

// 获取今天的日期字符串
function getTodayDateString(): string {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
}

// 检查今天是否已上香
function hasIncensedToday(): boolean {
  const lastIncenseDate = localStorage.getItem(INCENSE_STORAGE_KEY)
  return lastIncenseDate === getTodayDateString()
}

// 保存上香记录（记录今天的日期）
function saveIncenseRecord() {
  localStorage.setItem(INCENSE_STORAGE_KEY, getTodayDateString())
}

// 检查是否已上香（兼容旧版，现在统一检查今天是否上过香）
function hasIncensed(): boolean {
  return hasIncensedToday()
}

// 上香功能
function offerIncense(tombstone: Tombstone) {
  // 用户点击上香时尝试播放背景音乐（这是用户交互，浏览器通常允许播放）
  try {
    if (audioRef.value && !isPlaying.value) {
      audioRef.value.play()
        .then(() => {
          isPlaying.value = true
        })
        .catch((e) => {
          // 如果播放被阻止，记录并继续上香流程
          console.warn("尝试播放音频失败:", e)
        })
    }
  } catch (e) {
    console.warn("触发播放时出错:", e)
  }

  if (hasIncensedToday()) {
    ElMessage.warning(t("您今天已经上过香了"))
    return
  }

  if (incenseLoading.value) {
    return
  }

  // 设置loading状态
  incenseLoading.value = true

  // 发送上香请求
  fetch(incenseUrl, {
    redirect: "follow",
    method: "POST",
    body: JSON.stringify({ 昵称: tombstone.昵称 }),
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    }
  })
    .then(response => response.json())
    .then((data) => {
      if (data.success) {
        // 保存上香记录（记录今天的日期）
        saveIncenseRecord()
        // 本地更新上香数
        tombstone.上香 = (Number(tombstone.上香) || 0) + 1
        ElMessage.success(t("上香成功"))
      } else {
        ElMessage.error(data.message || t("上香失败"))
      }
    })
    .catch((e) => {
      ElMessage.error(e.message || t("上香失败"))
    })
    .finally(() => {
      incenseLoading.value = false
    })
}
</script>

<template>
  <div class="valhalla-container">
    <div class="valhalla-header">
      <h1 class="valhalla-title">
        <span class="title-icon">⚰️</span>
        {{ t('英灵殿') }}
        <span class="title-icon">⚰️</span>
      </h1>
      <p class="valhalla-subtitle">
        {{ t('山川铭记着那些不屈的魂灵，他们的传说在牛铃声中回响，诉说着血泪与抗争。') }}
      </p>

      <!-- 音乐控制器 -->
      <div class="music-player">
        <div class="music-info">
          <span class="music-icon">🎵</span>
          <span class="music-name"> BGM </span>
        </div>
        <div class="music-controls">
          <el-button
            :type="isPlaying ? 'success' : 'info'"
            size="small"
            circle
            @click="toggleMusic"
          >
            <span class="control-icon">{{ isPlaying ? '⏸' : '▶' }}</span>
          </el-button>
          <audio
            ref="audioRef"
            loop
            preload="auto"
            src="/media/lanlianha.mp3"
          />
        </div>
      </div>

      <el-button
        type="primary"
        style="margin-top: 20px;"
        @click="openDialog"
      >
        {{ t('提名入殿') }}
      </el-button>
    </div>

    <div v-loading="tombstonesLoading" class="tombstones-grid">
      <TombstoneCard
        v-for="(tombstone, index) in tombstones"
        :key="index"
        :tombstone="tombstone"
        :tombstone-config="tombstoneConfig"
        :show-title="true"
        :incense-loading="incenseLoading"
        :has-incensed="hasIncensed()"
        @offer-incense="offerIncense"
      />
    </div>

    <!-- 说明文字 -->
    <div class="valhalla-footer">
      <el-alert
        type="info"
        :closable="false"
        show-icon
      >
        <template #title>
          <div class="footer-text">
            <p>{{ t('这里纪念着因各种原因离开游戏的玩家：') }}</p>
            <p>
              <span :style="{ color: tombstoneConfig.banned.color }">{{ tombstoneConfig.banned.icon }} {{ t('封弊者') }}</span> -
              {{ t('因违反游戏规则被封禁') }} |
              <span :style="{ color: tombstoneConfig.gambling.color }">{{ tombstoneConfig.gambling.icon }} {{ t('赌徒') }}</span> -
              {{ t('因赌博飞升而退坑') }} |
              <span :style="{ color: tombstoneConfig.quit.color }">{{ tombstoneConfig.quit.icon }} {{ t('远行者') }}</span> -
              {{ t('因生活原因主动退坑') }}
            </p>
            <p style="margin-top: 12px; color: #ffd700;">
              🕯️ {{ t('上香规则：每天可以上香一次，可选择为任意一位玩家上香') }}
            </p>
          </div>
        </template>
      </el-alert>
    </div>

    <!-- 提交对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="t('提名入殿')"
      width="600px"
      class="dialog"
    >
      <el-form
        ref="refForm"
        :model="form"
        :rules="rules"
        label-width="100px"
      >
        <el-form-item :label="t('昵称')" prop="昵称">
          <el-input
            v-model="form.昵称"
            :placeholder="t('请输入游戏昵称')"
          />
        </el-form-item>

        <el-form-item :label="t('原因')" prop="原因">
          <el-select
            v-model="form.原因"
            :placeholder="t('请选择退坑原因')"
            style="width: 100%"
          >
            <el-option :label="t('封弊者 - 被封禁')" value="banned" />
            <el-option :label="t('赌徒 - 赌博飞升')" value="gambling" />
            <el-option :label="t('远行者 - 主动退坑')" value="quit" />
            <el-option :label="t('逝者 - 其他原因')" value="other" />
          </el-select>
        </el-form-item>

        <el-form-item :label="t('专属称号')" prop="称号">
          <el-input
            v-model="form.称号"
            :placeholder="t('如：青蛙王')"
          />
        </el-form-item>

        <el-form-item :label="t('描述')" prop="描述">
          <el-input
            v-model="form.描述"
            type="textarea"
            :rows="3"
            :placeholder="t('请输入墓志铭或入殿理由')"
          />
        </el-form-item>

        <el-form-item :label="t('时间')" prop="时间">
          <el-input
            v-model="form.时间"
            :placeholder="t('如：2025-10-27')"
          />
        </el-form-item>

        <el-form-item :label="t('图标')" prop="图标">
          <div style="display: flex; gap: 8px; align-items: center;">
            <el-button @click="openIconDialog" style="flex-shrink: 0;">
              {{ t('选择图标') }}
            </el-button>
            <div v-if="form.图标" style="display: flex; align-items: center; gap: 8px;">
              <ItemIcon :hrid="form.图标" :width="30" :height="30" />
              <span style="color: #606266; font-size: 14px;">{{ t(getIconName(form.图标)) }}</span>
              <el-button size="small" @click="form.图标 = ''">
                {{ t('清除') }}
              </el-button>
            </div>
            <span v-else style="color: #909399; font-size: 12px;">{{ t('未选择') }}</span>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">{{ t('取消') }}</el-button>
          <el-button
            type="primary"
            :loading="dialogLoading"
            @click="submit"
          >
            {{ t('提交') }}
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 图标选择对话框 -->
    <el-dialog
      v-model="iconDialogVisible"
      :title="t('选择图标')"
      width="800px"
    >
      <el-input
        v-model="iconSearch"
        :placeholder="t('搜索')"
        style="margin-bottom: 16px;"
      />
      <div style="max-height: 500px; overflow-y: auto;">
        <!-- 聊天图标 -->
        <div v-if="filteredChatIcons.length > 0">
          <div style="font-size: 14px; color: #606266; font-weight: 600; margin-bottom: 8px; padding-left: 4px;">
            💬 {{ t('聊天图标') }} ({{ filteredChatIcons.length }})
          </div>
          <div style="display: flex; flex-wrap: wrap; margin-bottom: 20px;">
            <el-button
              v-for="item in filteredChatIcons"
              :key="item.hrid"
              style="width: 50px; height: 50px; margin: 2px; padding: 4px;"
              :type="form.图标 === item.hrid ? 'primary' : 'default'"
              @click="selectIcon(item.hrid)"
            >
              <ItemIcon :hrid="item.hrid" :width="36" :height="36" />
            </el-button>
          </div>
        </div>

        <!-- 物品图标 -->
        <div v-if="filteredItemIcons.length > 0">
          <div style="font-size: 14px; color: #606266; font-weight: 600; margin-bottom: 8px; padding-left: 4px;">
            🎒 {{ t('物品图标') }} ({{ filteredItemIcons.length }})
          </div>
          <div style="display: flex; flex-wrap: wrap; margin-bottom: 20px;">
            <el-button
              v-for="item in filteredItemIcons"
              :key="item.hrid"
              style="width: 50px; height: 50px; margin: 2px; padding: 4px;"
              :type="form.图标 === item.hrid ? 'primary' : 'default'"
              @click="selectIcon(item.hrid)"
            >
              <ItemIcon :hrid="item.hrid" :width="36" :height="36" />
            </el-button>
          </div>
        </div>

        <!-- 无结果提示 -->
        <div v-if="filteredItemIcons.length === 0 && filteredChatIcons.length === 0" style="text-align: center; padding: 40px; color: #909399;">
          {{ t('未找到匹配的图标') }}
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.valhalla-container {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

.valhalla-header {
  text-align: center;
  margin-bottom: 40px;
  padding: 30px 20px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.valhalla-title {
  font-size: 42px;
  font-weight: bold;
  color: #e0e0e0;
  margin-bottom: 16px;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);

  .title-icon {
    margin: 0 16px;
    display: inline-block;
    animation: float 3s ease-in-out infinite;
  }
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

.valhalla-subtitle {
  font-size: 16px;
  color: #b0b0b0;
  font-style: italic;
}

.music-player {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 20px;
  padding: 12px 24px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  max-width: 320px;
  margin-left: auto;
  margin-right: auto;
  transition: all 0.3s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.2);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }

  .music-info {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;

    .music-icon {
      font-size: 20px;
      animation: musicNote 2s ease-in-out infinite;
    }

    .music-name {
      font-size: 14px;
      color: #e0e0e0;
      font-weight: 500;
    }
  }

  .music-controls {
    display: flex;
    align-items: center;

    .control-icon {
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    audio {
      display: none;
    }
  }
}

@keyframes musicNote {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  25% {
    transform: translateY(-3px) rotate(-5deg);
  }
  75% {
    transform: translateY(-3px) rotate(5deg);
  }
}

.tombstones-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 32px 24px;
  margin-bottom: 40px;
  overflow: visible;

  @media (min-width: 1400px) {
    grid-template-columns: repeat(5, 1fr);
  }

  @media (min-width: 1200px) and (max-width: 1399px) {
    grid-template-columns: repeat(4, 1fr);
  }

  @media (min-width: 992px) and (max-width: 1199px) {
    grid-template-columns: repeat(3, 1fr);
  }

  @media (min-width: 768px) and (max-width: 991px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 767px) {
    grid-template-columns: repeat(1, 1fr);
  }
}

.valhalla-footer {
  margin-top: 40px;

  .footer-text {
    line-height: 1.8;
    font-size: 14px;

    p {
      margin: 8px 0;
    }

    span {
      font-weight: bold;
      margin: 0 8px;
    }
  }
}

// 响应式设计
@media (max-width: 768px) {
  .valhalla-title {
    font-size: 32px;

    .title-icon {
      margin: 0 8px;
    }
  }
}
</style>
