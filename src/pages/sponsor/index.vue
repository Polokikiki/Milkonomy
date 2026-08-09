<script lang="ts" setup>
import logoAlipayOrg from "@@/assets/images/sponsor/alipay_org.jpg?url"
import logoPolokikiWechat from "@@/assets/images/sponsor/polokiki-wechat.jpg?url"
import logoPolokikiWechatPay from "@@/assets/images/sponsor/polokiki-wechat-pay.jpg?url"
import logoHyhfishWechat from "@@/assets/images/sponsor/hyhfish-wechat.jpg?url"
import logoWechatOrg from "@@/assets/images/sponsor/wechat_org.jpg?url"
import axios from "axios"
import { ElLoading, type FormRules } from "element-plus"
import { useI18n } from "vue-i18n"

const submitUrl = "https://script.google.com/macros/s/AKfycbxByTjiRX36ufKHQgV1aVRrIcdxjmqEZ0SAm5qkse6CZEyoZVxKW2xmvegxB3o3bGgKOg/exec"
const listUrl = "https://opensheet.elk.sh/1s-dW5trnzg9t93VtLEAxwBTfYEiHXRRZGGaiCgKhl9k/1"
const sponsorBadgeModules = import.meta.glob("@@/assets/images/sponsor/gifs/*.{gif,png,jpg,jpeg,webp,avif}", {
  eager: true,
  import: "default"
}) as Record<string, string>
const sponsorBadgeMap = Object.fromEntries(
  Object.entries(sponsorBadgeModules).map(([path, url]) => {
    const fileName = path.split("/").pop() || ""
    const nickname = fileName.replace(/\.[^.]+$/, "")
    return [nickname, url]
  })
)

interface Sponsor {
  approved?: boolean
  nickname?: string
  platform?: string
  name?: string
  amount?: number
  date?: Date
  [key: string]: any
}

const sponsorList = ref<Sponsor[]>([])
const sponsorLoading = ref(false)
const refForm = ref()
const form = ref<Sponsor>({})
const dialogVisible = ref(false)
const dialogLoading = ref(false)
const { t } = useI18n()
let loadingService: any

const rules = reactive<FormRules>({
  nickname: [{ required: true, message: t("不能为空"), trigger: ["blur", "change"] }],
  platform: [{ required: true, message: t("不能为空"), trigger: ["blur", "change"] }],
  name: [{ required: true, message: t("不能为空"), trigger: ["blur", "change"] }],
  amount: [{ required: true, message: t("不能为空"), trigger: ["blur", "change"] }]
})

const paymentCards = [
  {
    key: "maintainer-wechat",
    owner: "hyhfish",
    ownerClass: "maintainer",
    title: "微信",
    note: "请hyhfish喝杯奶茶",
    imageUrl: logoHyhfishWechat
  },
  {
    key: "author-wechat",
    owner: "luyh7",
    ownerClass: "author",
    title: "微信",
    note: "luyh7",
    imageUrl: logoWechatOrg
  },
  {
    key: "author-alipay",
    owner: "luyh7",
    ownerClass: "author",
    title: "支付宝",
    note: "luyh7",
    imageUrl: logoAlipayOrg
  },
  {
    key: "polokiki-wechat",
    owner: "Polokiki",
    ownerClass: "maintainer",
    title: "微信",
    note: "请Polokiki喝奶茶",
    imageUrl: logoPolokikiWechatPay
  },
  {
    key: "maintainer-alipay-polokiki",
    owner: "Polokiki",
    ownerClass: "maintainer",
    title: "支付宝",
    note: "请polokiki喝奶茶",
    imageUrl: logoPolokikiWechat
  },
]

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

function submit() {
  refForm.value.validate((valid: boolean) => {
    if (!valid) return
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
        ElMessage.success(t("提交成功，请等待审核"))
        dialogVisible.value = false
        loadData()
      })
      .catch((e) => {
        ElMessage.error(e)
      })
      .finally(() => {
        dialogLoading.value = false
      })
  })
}

function loadData() {
  sponsorLoading.value = true
  axios.get(listUrl)
    .then(({ data }) => {
      const keyMap: Record<string, string> = {
        姓名: "name",
        审核状态: "approved",
        昵称: "nickname",
        平台: "platform",
        金额: "amount",
        时间: "date"
      }
      sponsorList.value = data.map((item: any) => {
        const sponsor: Sponsor = {}
        for (const key in item) {
          keyMap[key] && (sponsor[keyMap[key]] = item[key])
        }
        return sponsor
      }).filter((item: Sponsor) => item.approved)

      const map = new Map<string, Sponsor>()
      sponsorList.value.forEach((item: Sponsor) => {
        if (map.has(item.nickname!)) {
          const sponsor = map.get(item.nickname!)
          if (sponsor) {
            sponsor.amount! = +sponsor.amount! + +item.amount!
          }
        } else {
          map.set(item.nickname!, item)
        }
      })
      // 手动添加的赞助者
      const hardcoded: Sponsor[] = [
        { approved: true, nickname: "Laulau01", platform: "微信", amount: 28.88 },
        { approved: true, nickname: "Blue", platform: "微信", amount: 30 },
      ]
      for (const h of hardcoded) {
        const existing = map.get(h.nickname!)
        if (existing) {
          existing.amount = (existing.amount || 0) + (h.amount || 0)
        } else {
          map.set(h.nickname!, h)
        }
      }

      sponsorList.value = Array.from(map.values()).sort((a, b) => (b.amount || 0) - (a.amount || 0))
    })
    .catch((e) => {
      ElMessage.error(e)
    })
    .finally(() => {
      sponsorLoading.value = false
    })
}

function getSponsorBadge(nickname?: string) {
  return nickname ? sponsorBadgeMap[nickname] : undefined
}

loadData()
</script>

<template>
  <div class="sponsor-page">
    <div class="page-head">
      <h1>
        {{ t('打赏页面') }}
      </h1>
      <p class="sub-title">
        {{ t('如果你觉得 Milkonomy 对你有帮助，可以通过下方方式支持后续维护。') }}
      </p>
      <p class="meta-line">
        {{ t('原作者：') }}<span class="author">luyh7</span>、<span class="author">hyhfish</span>
      </p>
      <p class="meta-line">
        {{ t('当前维护者：') }}<span class="maintainer">Polokiki</span> / QQ：<span class="maintainer">1508828092</span>
      </p>
      <p class="meta-line">
        {{ t('请 {0} 喝杯奶茶', ['luyh7、hyhfish、Polokiki']) }}
      </p>
    </div>

    <el-row :gutter="20">
      <el-col :xs="24" :md="11">
        <el-card class="sponsor-list">
          <template #header>
            <div class="card-head">
              <span>{{ t('感谢以下玩家打赏') }}</span>
              <el-button type="primary" @click="dialogVisible = true">
                {{ t('我要上榜') }}
              </el-button>
            </div>
          </template>
          <el-table v-loading="sponsorLoading" :data="sponsorList">
            <el-table-column :label="t('排名')" width="70">
              <template #default="{ $index }">
                <div class="rank-cell">
                  <span>{{ ["🥇", "🥈", "🥉"][$index] || $index + 1 }}</span>
                </div>
              </template>
            </el-table-column>

            <el-table-column prop="nickname" :label="t('昵称')">
              <template #default="{ row }">
                <div :class="{ [row.nickname]: true }" class="nickname-cell">
                  <span>{{ row.nickname }}</span>
                  <img
                    v-if="getSponsorBadge(row.nickname)"
                    class="nickname-badge"
                    :src="getSponsorBadge(row.nickname)"
                    :alt="`${row.nickname} badge`"
                  >
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="amount" :label="t('金额')" width="100">
              <template #default="{ row }">
                <span>¥{{ row.amount }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="13">
        <el-row :gutter="16" class="img-row">
          <el-col v-for="card in paymentCards" :key="card.key" :xs="12" :sm="12" :xl="12">
            <el-card class="payment-card">
              <div class="owner-line">
                <span :class="card.ownerClass">{{ card.owner }}</span>
              </div>
              <div class="placeholder-box">
                <img v-if="card.imageUrl" class="payment-image" :src="card.imageUrl" :alt="`${card.owner}${card.title}`">
                <div v-else class="placeholder-inner">
                  <div class="placeholder-text">
                    二维码待提供
                  </div>
                </div>
              </div>
              <div class="img-alt">
                {{ card.title }}
              </div>
              <div class="img-note">
                {{ card.note }}
              </div>
            </el-card>
          </el-col>
        </el-row>
      </el-col>
    </el-row>

    <el-dialog class="dialog" v-model="dialogVisible" :title="t('我要上榜')" :show-close="false">
      <el-form ref="refForm" :model="form" class="form" :rules="rules" label-width="80px">
        <el-form-item prop="nickname" :label="t('昵称')">
          <el-input v-model="form.nickname" :placeholder="t('打赏者名单上显示的名字')" />
        </el-form-item>
        <el-form-item prop="platform" :label="t('平台')">
          <el-select v-model="form.platform" :placeholder="t('请选择')">
            <el-option :label="t('支付宝')" value="支付宝" />
            <el-option :label="t('微信')" value="微信" />
            <el-option :label="t('Paypal')" value="Paypal" />
          </el-select>
        </el-form-item>
        <el-form-item prop="name" :label="t('姓名')">
          <el-input v-model="form.name" :placeholder="t('您支付时使用的名字')" />
        </el-form-item>
        <el-form-item prop="amount" :label="t('金额')">
          <el-input v-model="form.amount" placeholder="CNY" />
        </el-form-item>
        <div class="form-tip">
          {{ t('提交后请等待作者审核，审核通过后会显示在打赏者名单中') }}
        </div>
      </el-form>

      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="submit">
            {{ t('提交') }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
.sponsor-page {
  padding: 20px;
  text-align: center;
}

.page-head {
  margin-bottom: 24px;
}

.page-head h1 {
  margin: 0 0 12px;
  font-size: 34px;
}

.sub-title,
.tip-line {
  color: #999;
  line-height: 1.8;
}

.meta-line {
  margin: 8px 0;
  font-size: 16px;
}

.author,
.maintainer {
  font-weight: 700;
}

.author {
  background: linear-gradient(to right, #ff4757, #ff6b81, #ffa502, #20bf6b, #01a3d4, #5f27cd, #d252e1);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.maintainer {
  background: linear-gradient(90deg, #16ab1b, #20bf6b, #2ecc71);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.sponsor-list {
  text-align: left;
  :deep(.el-table) {
    .cell {
      overflow: visible !important;
    }
  }
}

.rank-cell,
.dialog-footer {
  display: flex;
  justify-content: center;
}

.nickname-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.nickname-badge {
  width: 36px;
  height: 36px;
  object-fit: contain;
  flex-shrink: 0;
}

.img-row {
  margin: 0 !important;
}

.img-row .el-col {
  margin-bottom: 16px;
}

.payment-card {
  height: 100%;
}

.owner-line {
  margin-bottom: 8px;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
}

.placeholder-box {
  width: 100%;
  max-width: 190px;
  aspect-ratio: 1 / 1;
  padding: 8px;
  margin: 0 auto;
}

.placeholder-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border: 2px dashed #d9b88f;
  border-radius: 14px;
  background:
    linear-gradient(45deg, #faf6ef 25%, transparent 25%), linear-gradient(-45deg, #faf6ef 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #faf6ef 75%), linear-gradient(-45deg, transparent 75%, #faf6ef 75%);
  background-position:
    0 0,
    0 12px,
    12px -12px,
    -12px 0;
  background-size: 24px 24px;
}

.payment-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 14px;
}

.placeholder-text {
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.95);
  color: #b57a2c;
  font-weight: 700;
}

.img-alt {
  margin-top: 10px;
  font-size: 18px;
  font-weight: 700;
}

.img-note {
  margin-top: 6px;
  color: #999;
  line-height: 1.6;
  font-size: 13px;
}

.form {
  margin: 20px;
}

.form-tip {
  margin: 10px 80px;
  line-height: 1.6;
  color: #666;
}

.luyh7 {
  width: 1000px;
  background: linear-gradient(to right, #ff4757, #ff6b81, #ffa502, #20bf6b, #01a3d4, #5f27cd, #d252e1);
  animation: glow-animation 2s ease-in-out infinite alternate;
  -webkit-background-size: 1000px 100%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.Joey {
  font-size: 20px;
  font-family: Roboto, Helvetica, Arial, sans-serif;
  font-weight: 600;
  width: 100%;
  background: linear-gradient(160deg, #fff8c7 30%, #fbd640);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(1px 0 2px rgba(244, 64, 64, 0.6901960784)) drop-shadow(-1px 0 2px rgba(244, 64, 64, 0.6901960784))
    drop-shadow(0 1px 2px rgba(244, 64, 64, 0.6901960784)) drop-shadow(0 -1px 2px rgba(244, 64, 64, 0.6901960784));
}

.BBC233 {
  font-size: 20px;
  font-weight: bold;
  background: linear-gradient(to right, #ff00ff, #00ffff, #ff0000);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: glow-animation 2s ease-in-out infinite alternate;
}

.苏叶叶 {
  font-size: 20px;
  font-weight: bold;
  background-image: -webkit-linear-gradient(left, #d48085, #fff 30%, #d48085 50%);
  -webkit-text-fill-color: transparent;
  -webkit-background-clip: text;
  -webkit-background-size: 200% 100%;
  animation: masked-animation 2s infinite linear;
}

.adudu {
  font-size: 20px;
  font-weight: bold;
  background-image: -webkit-linear-gradient(left, #f29b1d, #fff 10%, #f29b1d 20%);
  -webkit-text-fill-color: transparent;
  -webkit-background-clip: text;
  -webkit-background-size: 200% 100%;
  animation: masked-animation 3s infinite linear;
}

.raintower {
  font-size: 24px;
  font-weight: 600;
  background-image: -webkit-linear-gradient(left, #ff4757, #ff6b81, #ffa502, #20bf6b, #01a3d4, #5f27cd, #d252e1);
  -webkit-text-fill-color: transparent;
  -webkit-background-clip: text;
  -webkit-background-size: 50% 100%;
  -webkit-text-stroke: 0.3px rgba(255, 215, 0, 0.8);
}

.eggyang {
  font-size: 24px;
  font-weight: 900;
  position: relative;
  padding: 15px;
  margin-bottom: 5px;
  padding-left: 0;
  background: linear-gradient(
    45deg,
    #ffd700,
    #ffed4a,
    #f9ca24,
    #f0932b,
    #eb4d4b,
    #6c5ce7,
    #a29bfe,
    #fd79a8,
    #fdcb6e,
    #ffd700
  );
  background-size: 400% 400%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  -webkit-text-stroke: 1px #ffd700;
  animation:
    eggyang-gradient 3s ease-in-out infinite,
    eggyang-pulse 2s ease-in-out infinite alternate,
    eggyang-glow 4s linear infinite;
  filter: drop-shadow(0 0 10px rgba(255, 215, 0, 0.8)) drop-shadow(0 0 20px rgba(255, 215, 0, 0.6))
    drop-shadow(0 0 30px rgba(255, 215, 0, 0.4));
  overflow: visible;
  transform-origin: center;
}

.RyuuSan {
  background: linear-gradient(90deg, #e3858b, #e3858b 3%, #f6d6d8 15%, #f6d6d8 30%, #ecadb1 50%, #e3858b 95%, #e3858b);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

@keyframes glow-animation {
  0% {
    filter: hue-rotate(-360deg);
  }
  100% {
    filter: hue-rotate(360deg);
  }
}

@keyframes masked-animation {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}

@keyframes eggyang-gradient {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

@keyframes eggyang-pulse {
  0% {
    transform: scale(1);
  }
  100% {
    transform: scale(1.05);
  }
}

@keyframes eggyang-glow {
  0% {
    filter: drop-shadow(0 0 10px rgba(255, 215, 0, 0.8)) drop-shadow(0 0 20px rgba(255, 215, 0, 0.6))
      drop-shadow(0 0 30px rgba(255, 215, 0, 0.4)) hue-rotate(0deg);
  }
  25% {
    filter: drop-shadow(0 0 15px rgba(255, 105, 180, 0.8)) drop-shadow(0 0 25px rgba(255, 105, 180, 0.6))
      drop-shadow(0 0 35px rgba(255, 105, 180, 0.4)) hue-rotate(90deg);
  }
  50% {
    filter: drop-shadow(0 0 20px rgba(0, 191, 255, 0.8)) drop-shadow(0 0 30px rgba(0, 191, 255, 0.6))
      drop-shadow(0 0 40px rgba(0, 191, 255, 0.4)) hue-rotate(180deg);
  }
  75% {
    filter: drop-shadow(0 0 15px rgba(50, 205, 50, 0.8)) drop-shadow(0 0 25px rgba(50, 205, 50, 0.6))
      drop-shadow(0 0 35px rgba(50, 205, 50, 0.4)) hue-rotate(270deg);
  }
  100% {
    filter: drop-shadow(0 0 10px rgba(255, 215, 0, 0.8)) drop-shadow(0 0 20px rgba(255, 215, 0, 0.6))
      drop-shadow(0 0 30px rgba(255, 215, 0, 0.4)) hue-rotate(360deg);
  }
}

@media (max-width: 768px) {
  .sponsor-page {
    padding: 16px;
  }

  .page-head h1 {
    font-size: 28px;
  }
}
</style>
