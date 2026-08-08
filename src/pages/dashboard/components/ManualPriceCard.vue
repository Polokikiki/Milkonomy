<script setup lang="ts">
import type { FormInstance } from "element-plus"
import ItemIcon from "@@/components/ItemIcon/index.vue"
import { Delete, Edit } from "@element-plus/icons-vue"
import { getItemDetailOf, getPriceOf } from "@/common/apis/game"
import { getPriceDataApi } from "@/common/apis/price"
import { useMemory } from "@/common/composables/useMemory"
import { usePagination } from "@/common/composables/usePagination"
import * as Format from "@/common/utils/format"
import { useGameStore } from "@/pinia/stores/game"
import { type StoragePriceItem, usePriceStore } from "@/pinia/stores/price"
import SinglePrice from "./SinglePrice.vue"

const props = defineProps<{
  memoryKey: string
}>()

const priceSearchData = useMemory(`${props.memoryKey}-price-search-data`, {
  name: ""
})

const { paginationData: paginationDataPrice, handleCurrentChange: handleCurrentChangePrice, handleSizeChange: handleSizeChangePrice } = usePagination({}, `${props.memoryKey}-price-pagination`)
const priceData = ref<StoragePriceItem[]>([])

const priceSearchFormRef = ref<FormInstance | null>(null)

const loadingPrice = ref(false)
function getPriceData() {
  loadingPrice.value = true
  getPriceDataApi({
    currentPage: paginationDataPrice.currentPage,
    size: paginationDataPrice.pageSize,
    ...priceSearchData.value
  }).then((data) => {
    console.log("getPriceData", data)
    paginationDataPrice.total = data.total
    priceData.value = data.list
  }).catch(() => {
    priceData.value = []
  }).finally(() => {
    loadingPrice.value = false
    priceData.value.forEach((item: any) => item.selected = false)
  })
}

function handleSearchPrice() {
  paginationDataPrice.currentPage === 1 ? getPriceData() : (paginationDataPrice.currentPage = 1)
}
// 监听分页参数的变化
watch([
  () => paginationDataPrice.currentPage,
  () => paginationDataPrice.pageSize,
  () => useGameStore().marketData,
  () => useGameStore().buyStatus,
  () => useGameStore().sellStatus
], getPriceData, { immediate: true })

watch(() => usePriceStore(), () => {
  getPriceData()
}, { deep: true })

function deletePrice(row: StoragePriceItem) {
  try {
    usePriceStore().deletePrice(row)
  } catch (e: any) {
    ElMessage.error(e.message)
  }
}

function deleteBatch() {
  const selectedRows = priceData.value.filter((row: any) => row.selected)
  for (const row of selectedRows) {
    deletePrice(row)
  }
}
const { t } = useI18n()
</script>

<template>
  <el-card>
    <template #header>
      <el-form class="rank-card" ref="priceSearchFormRef" :inline="true" :model="priceSearchData">
        <div class="title">
          {{ t('自定义价格') }}
        </div>

        <el-form-item>
          <el-switch v-model="usePriceStore().activated" @change="usePriceStore().setActivated" :active-text="t('已开启')" :inactive-text="t('已关闭')" inline-prompt />
        </el-form-item>

        <el-form-item prop="name" :label="t('物品')">
          <el-input style="width:100px" v-model="priceSearchData.name" :placeholder="t('请输入')" clearable @input="handleSearchPrice" />
        </el-form-item>
      </el-form>
    </template>
    <template #default>
      <el-table :data="priceData" v-loading="loadingPrice">
        <el-table-column width="40">
          <template #header>
            <el-link v-if="priceData.some((item:any) => item.selected)" type="danger" :icon=" Delete" @click="deleteBatch">
              <!-- {{ t('删除') }} -->
            </el-link>
          </template>
          <template #default="{ row }">
            <el-checkbox v-model="row.selected" />
          </template>
        </el-table-column>
        <el-table-column width="54">
          <template #default="{ row }">
            <ItemIcon :hrid="row.hrid" />
          </template>
        </el-table-column>
        <el-table-column :label="t('物品')" min-width="120">
          <template #default="{ row }">
            {{ t(getItemDetailOf(row.hrid).name) }}
            {{ row.level ? `+${row.level}` : '' }}
          </template>
        </el-table-column>

        <el-table-column :label="t('市场价格')" min-width="120">
          <template #default="{ row }">
            {{ Format.price(getPriceOf(row.hrid, row.level).ask) }} / {{ Format.price(getPriceOf(row.hrid, row.level).bid) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('自定义价格')" min-width="120">
          <template #default="{ row }">
            <SinglePrice :data="row">
              <el-link>
                <div class="flex flex-wrap items-center">
                  <div>
                    {{ row.ask?.manual ? Format.price(row.ask?.manualPrice) : '-' }} / {{ row.bid?.manual ? Format.price(row.bid?.manualPrice) : '-' }}
                  </div>
                  <el-icon class=" el-icon--right color-[#409EFF] ">
                    <Edit />
                  </el-icon>
                </div>
              </el-link>
            </SinglePrice>
          </template>
        </el-table-column>
        <el-table-column min-width="80">
          <template #default="{ row }">
            <el-link type="danger" :icon=" Delete" @click="deletePrice(row)">
              {{ t('删除') }}
            </el-link>
          </template>
        </el-table-column>
      </el-table>
    </template>
    <template #footer>
      <div class="pager-wrapper">
        <el-pagination
          background
          :layout="paginationDataPrice.layout"
          :page-sizes="paginationDataPrice.pageSizes"
          :total="paginationDataPrice.total"
          :page-size="paginationDataPrice.pageSize"
          :current-page="paginationDataPrice.currentPage"
          @size-change="handleSizeChangePrice"
          @current-change="handleCurrentChangePrice"
        />
      </div>
    </template>
  </el-card>
</template>

<style lang="scss" scoped>
.rank-card {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  .title {
    width: 160px;
    margin-bottom: 12px;
  }
}

.pager-wrapper {
  display: flex;
  justify-content: center;
}
</style>
