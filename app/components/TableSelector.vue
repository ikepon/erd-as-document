<script setup lang="ts">
import type { Table } from '~/types/er-schema'

type ExcludeFilter = {
  tables?: string[]
  patterns?: string[]
}

type Props = {
  tables: Table[]
  selectedTables: Set<string>
  highlightedTables: Set<string>
  showRelations: boolean
  excludeFilter?: ExcludeFilter
}

type Emits = {
  'update:selectedTables': [value: Set<string>]
  'update:highlightedTables': [value: Set<string>]
  'update:showRelations': [value: boolean]
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// スクロールコンテナの参照
const scrollContainerRef = ref<HTMLElement | null>(null)

// 検索クエリ
const searchQuery = ref('')

// 選択中のみ表示
const showSelectedOnly = ref(false)

// 選択状態のセットをリアクティブに参照するためのcomputed
const selectedTableSet = computed(() => new Set(props.selectedTables))

// 除外フィルタを適用したテーブル一覧
const visibleTables = computed(() => {
  if (!props.excludeFilter) return props.tables

  const excludeTables = new Set(props.excludeFilter.tables || [])
  const excludePatterns = (props.excludeFilter.patterns || []).map(p => new RegExp(p))

  return props.tables.filter(table => {
    // テーブル名による除外
    if (excludeTables.has(table.name)) return false

    // パターンによる除外
    for (const pattern of excludePatterns) {
      if (pattern.test(table.name)) return false
    }

    return true
  })
})

// 表示されているテーブルのうち選択されているものの数
const visibleSelectedCount = computed(() => {
  const visibleTableNames = new Set(visibleTables.value.map(t => t.name))
  let count = 0
  for (const tableName of props.selectedTables) {
    if (visibleTableNames.has(tableName)) {
      count++
    }
  }
  return count
})

// 部分列マッチ（Subsequence matching）
const matchSubsequence = (query: string, target: string): boolean => {
  if (!query) return true
  const lowerQuery = query.toLowerCase()
  const lowerTarget = target.toLowerCase()
  let qi = 0
  for (const char of lowerTarget) {
    if (char === lowerQuery[qi]) qi++
    if (qi === lowerQuery.length) return true
  }
  return false
}

// フィルタリングされたテーブル
const filteredTables = computed(() => {
  let tables = visibleTables.value

  // 選択中のみ表示
  if (showSelectedOnly.value) {
    tables = tables.filter(table => selectedTableSet.value.has(table.name))
  }

  // 検索フィルタ
  if (searchQuery.value) {
    tables = tables.filter(table => matchSubsequence(searchQuery.value, table.name))
  }

  return tables
})

const toggleTable = (tableName: string) => {
  const newSet = new Set(props.selectedTables)
  if (newSet.has(tableName)) {
    newSet.delete(tableName)
  } else {
    newSet.add(tableName)
  }
  emit('update:selectedTables', newSet)
}

// チェックボックスクリック時にスクロール位置を維持
const handleCheckboxClick = (tableName: string) => {
  // スクロール位置を保存
  const scrollLeft = scrollContainerRef.value?.scrollLeft ?? 0
  const scrollTop = scrollContainerRef.value?.scrollTop ?? 0

  toggleTable(tableName)

  // 次のティックでスクロール位置を復元
  nextTick(() => {
    if (scrollContainerRef.value) {
      scrollContainerRef.value.scrollLeft = scrollLeft
      scrollContainerRef.value.scrollTop = scrollTop
    }
  })
}

const selectAll = () => {
  // フィルタリングされたテーブルのみ選択
  const newSet = new Set(props.selectedTables)
  for (const table of filteredTables.value) {
    newSet.add(table.name)
  }
  emit('update:selectedTables', newSet)
}

const deselectAll = () => {
  // フィルタリングされたテーブルのみ解除
  const newSet = new Set(props.selectedTables)
  for (const table of filteredTables.value) {
    newSet.delete(table.name)
  }
  emit('update:selectedTables', newSet)
}

const toggleRelations = () => {
  emit('update:showRelations', !props.showRelations)
}

const toggleHighlight = (tableName: string, event: MouseEvent) => {
  event.stopPropagation()
  const newSet = new Set(props.highlightedTables)
  if (newSet.has(tableName)) {
    newSet.delete(tableName)
  } else {
    newSet.add(tableName)
  }
  emit('update:highlightedTables', newSet)
}
</script>

<template>
  <div class="table-selector">
    <div class="display-options">
      <h3>表示オプション</h3>
      <label class="option-item">
        <input
          type="checkbox"
          :checked="showRelations"
          @change="toggleRelations"
        >
        関連を表示
      </label>
    </div>

    <div class="table-list-section">
      <div class="search-box">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="テーブル検索（例: usrord）"
          class="search-input"
        >
      </div>
      <div class="table-list-header">
        <h3>テーブル ({{ visibleSelectedCount }}/{{ visibleTables.length }})</h3>
        <div class="bulk-actions">
          <button type="button" @click="selectAll">全選択</button>
          <button type="button" @click="deselectAll">全解除</button>
          <button
            type="button"
            :class="{ active: showSelectedOnly }"
            @click="showSelectedOnly = !showSelectedOnly"
          >
            選択中のみ
          </button>
        </div>
      </div>
      <div v-if="filteredTables.length === 0" class="no-results">
        {{ showSelectedOnly ? '選択中のテーブルがありません' : '一致するテーブルがありません' }}
      </div>
      <div ref="scrollContainerRef" class="table-list-scroll">
        <ul class="table-list">
          <li v-for="table in filteredTables" :key="table.name">
            <div class="table-item">
              <label>
                <input
                  type="checkbox"
                  :checked="selectedTableSet.has(table.name)"
                  @change="handleCheckboxClick(table.name)"
                >
                <span :class="{ 'highlighted-name': highlightedTables.has(table.name) }">
                  {{ table.name }}
                </span>
                <span v-if="table.relations.length > 0" class="relation-count">
                  ({{ table.relations.length }})
                </span>
              </label>
              <button
                class="highlight-btn"
                :class="{ active: highlightedTables.has(table.name) }"
                title="ハイライト"
                @click="toggleHighlight(table.name, $event)"
              >
                ★
              </button>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.table-selector {
  width: 280px;
  height: 100%;
  border: 1px solid rgba(102, 126, 234, 0.2);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 24px rgba(102, 126, 234, 0.1);
}

h3 {
  font-size: 13px;
  font-weight: 600;
  margin: 0;
  color: #1a1a2e;
}

.display-options {
  padding: 14px 16px;
  border-bottom: 1px solid rgba(102, 126, 234, 0.1);
  background: rgba(102, 126, 234, 0.03);
}

.display-options h3 {
  margin-bottom: 10px;
  color: #667eea;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  cursor: pointer;
  font-size: 13px;
  color: #4a5568;
  transition: color 0.2s ease;
}

.option-item:hover {
  color: #1a1a2e;
}

.option-item input[type="checkbox"] {
  accent-color: #667eea;
}

.table-list-section {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.search-box {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(102, 126, 234, 0.1);
}

.search-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid rgba(102, 126, 234, 0.2);
  border-radius: 10px;
  font-size: 13px;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.8);
  transition: all 0.2s ease;
}

.search-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.search-input::placeholder {
  color: #a0aec0;
}

.no-results {
  padding: 16px;
  color: #a0aec0;
  font-size: 13px;
  text-align: center;
}

.table-list-header {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(102, 126, 234, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.bulk-actions {
  display: flex;
  gap: 6px;
}

.bulk-actions button {
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid rgba(102, 126, 234, 0.3);
  background: rgba(255, 255, 255, 0.8);
  border-radius: 6px;
  cursor: pointer;
  color: #667eea;
  transition: all 0.2s ease;
}

.bulk-actions button:hover {
  background: rgba(102, 126, 234, 0.1);
  border-color: rgba(102, 126, 234, 0.5);
}

.bulk-actions button.active {
  background: rgba(102, 126, 234, 0.15);
  border-color: #667eea;
  color: #667eea;
}

.table-list-scroll {
  overflow: auto;
  flex: 1;
}

.table-list {
  list-style: none;
  padding: 0;
  margin: 0;
  min-width: 100%;
  width: max-content;
}

.table-list li {
  border-bottom: 1px solid rgba(102, 126, 234, 0.06);
}

.table-list li:last-child {
  border-bottom: none;
}

.table-list label {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
  color: #4a5568;
  transition: all 0.15s ease;
}

.table-list label:hover {
  background: rgba(102, 126, 234, 0.05);
  color: #1a1a2e;
}

.table-list label input[type="checkbox"] {
  accent-color: #667eea;
}

.relation-count {
  color: #a0aec0;
  font-size: 11px;
}

.table-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: 8px;
}

.table-item label {
  flex: 1;
}

.highlighted-name {
  color: #e67e22;
  font-weight: 600;
}

.highlight-btn {
  padding: 2px 6px;
  font-size: 12px;
  border: none;
  background: transparent;
  color: #cbd5e0;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.highlight-btn:hover {
  color: #e67e22;
  background: rgba(230, 126, 34, 0.1);
}

.highlight-btn.active {
  color: #e67e22;
}
</style>
