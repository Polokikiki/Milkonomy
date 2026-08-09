<script lang="ts" setup>
import axios from "axios"
import { ElLoading, type FormRules } from "element-plus"
import { useI18n } from "vue-i18n"

const submitUrl = "https://script.google.com/macros/s/AKfycbylQhGlnoggm6Cjo62sQCMLGeBdl8zHqRGChnBAzrgp0kaHGnK_46eKcttSpj0eHuND3Q/exec"

interface Feedback {
  nickname?: string
  contact?: string
  type?: string
  content?: string
}

const { t } = useI18n()
const refForm = ref()
const form = ref<Feedback>({})
const dialogVisible = ref(false)
const dialogLoading = ref(false)
let loadingService: any

const rules = reactive<FormRules>({
  nickname: [{ required: true, message: t("不能为空"), trigger: ["blur", "change"] }],
  contact: [{ required: true, message: t("不能为空"), trigger: ["blur", "change"] }],
  type: [{ required: true, message: t("不能为空"), trigger: ["blur", "change"] }],
  content: [{ required: true, message: t("不能为空"), trigger: ["blur", "change"] }]
})

const feedbackTypes = [
  { value: "Bug", i18nKey: "Bug 反馈" },
  { value: "Feature", i18nKey: "功能建议" },
  { value: "Other", i18nKey: "其他" },
]

watch(dialogLoading, (val) => {
  if (val) {
    loadingService = ElLoading.service({ lock: true, target: ".dialog" })
  } else {
    loadingService?.close()
  }
})

function submit() {
  refForm.value.validate((valid: boolean) => {
    if (!valid) return
    dialogLoading.value = true
    const payload = {
      ...form.value,
      timestamp: new Date().toISOString()
    }
    // 发后即忘：不等待响应，直接提示成功
    fetch(submitUrl, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      }
    })
    ElMessage.success(t("提交成功，感谢你的反馈！"))
    dialogVisible.value = false
    form.value = {}
    dialogLoading.value = false
  })
}
</script>

<template>
  <div class="feedback-page">
    <div class="page-head">
      <h1>
        {{ t('建议反馈') }}
      </h1>
      <p class="sub-title">
        {{ t('如果你有任何建议或发现了 Bug，欢迎提交反馈。') }}
      </p>
    </div>

    <el-card class="feedback-card">
      <div class="card-inner">
        <p class="card-desc">
          {{ t('你的每一条反馈我都会认真查看，感谢你的帮助！') }}
        </p>
        <el-button type="primary" size="large" @click="dialogVisible = true">
          {{ t('提交反馈') }}
        </el-button>
      </div>
    </el-card>

    <el-dialog class="dialog" v-model="dialogVisible" :title="t('提交反馈')" :show-close="false">
      <el-form ref="refForm" :model="form" class="form" :rules="rules" label-width="100px">
        <el-form-item prop="nickname" :label="t('游戏昵称')">
          <el-input v-model="form.nickname" :placeholder="t('你的游戏内昵称')" />
        </el-form-item>
        <el-form-item prop="contact" :label="t('联系方式')">
          <el-input v-model="form.contact" :placeholder="t('QQ / 微信 / Discord，方便我联系你')" />
        </el-form-item>
        <el-form-item prop="type" :label="t('建议类型')">
          <el-select v-model="form.type" :placeholder="t('请选择')">
            <el-option
              v-for="ft in feedbackTypes"
              :key="ft.value"
              :label="t(ft.i18nKey)"
              :value="ft.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item prop="content" :label="t('建议内容')">
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="5"
            :placeholder="t('请详细描述你的建议或遇到的问题...')"
          />
        </el-form-item>
        <div class="form-tip">
          {{ t('提交后我会尽快查看，感谢你的反馈！') }}
        </div>
      </el-form>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="dialogVisible = false">
            {{ t('取消') }}
          </el-button>
          <el-button type="primary" @click="submit">
            {{ t('提交') }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
.feedback-page {
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

.sub-title {
  color: #999;
  line-height: 1.8;
}

.feedback-card {
  max-width: 500px;
  margin: 0 auto;
}

.card-inner {
  padding: 20px 0;
}

.card-desc {
  color: #666;
  margin-bottom: 20px;
  line-height: 1.6;
}

.form {
  margin: 20px;
}

.form-tip {
  margin: 10px 100px;
  line-height: 1.6;
  color: #666;
}

.dialog-footer {
  display: flex;
  justify-content: center;
  gap: 12px;
}
</style>
