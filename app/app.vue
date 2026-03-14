<script setup lang="ts">
import type { ERSchema, ProjectConfig, Table } from '~/types/er-schema'

const { t } = useI18n()

// フィルタを適用してテーブルを絞り込む
const filterTables = (tables: Table[], config: ProjectConfig | null): Table[] => {
  if (!config?.filter?.exclude) return tables

  const excludeTables = new Set(config.filter.exclude.tables || [])
  const excludePatterns = (config.filter.exclude.patterns || []).map(p => new RegExp(p))

  return tables.filter(table => {
    if (excludeTables.has(table.name)) return false
    for (const pattern of excludePatterns) {
      if (pattern.test(table.name)) return false
    }
    return true
  })
}

const projects = ref<string[]>([])
const selectedProject = ref<string | null>(null)
const schema = ref<ERSchema | null>(null)
const projectConfig = ref<ProjectConfig | null>(null)
const error = ref<string | null>(null)

// 状態一覧
const states = ref<string[]>([])
const selectedState = ref<string | null>(null)

// 選択状態
const selectedTables = ref<Set<string>>(new Set())
const highlightedTables = ref<Set<string>>(new Set())
const showRelations = ref(true)

// サイドバー表示
const showSidebar = ref(true)

// ErdCanvas の参照
const erdCanvasRef = ref<InstanceType<typeof ErdCanvas> | null>(null)

// 保存メッセージ
const saveMessage = ref<string | null>(null)

// お気に入り機能
type Favorites = {
  project: string | null
  states: Record<string, string> // projectName -> stateName
}

const FAVORITES_KEY = 'erd-favorites'

const loadFavorites = (): Favorites => {
  if (typeof window === 'undefined') return { project: null, states: {} }
  const stored = localStorage.getItem(FAVORITES_KEY)
  if (!stored) return { project: null, states: {} }
  try {
    return JSON.parse(stored)
  } catch {
    return { project: null, states: {} }
  }
}

const saveFavorites = (favorites: Favorites) => {
  if (typeof window === 'undefined') return
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites))
}

const favorites = ref<Favorites>(loadFavorites())

const toggleFavoriteProject = (projectName: string) => {
  if (favorites.value.project === projectName) {
    favorites.value.project = null
    saveMessage.value = t('message.favoriteProjectRemoved', { name: projectName })
  } else {
    favorites.value.project = projectName
    saveMessage.value = t('message.favoriteProjectSet', { name: projectName })
  }
  saveFavorites(favorites.value)
  setTimeout(() => {
    saveMessage.value = null
  }, 2000)
}

const toggleFavoriteState = (projectName: string, stateName: string) => {
  if (favorites.value.states[projectName] === stateName) {
    delete favorites.value.states[projectName]
    saveMessage.value = t('message.favoriteStateRemoved', { name: stateName })
  } else {
    favorites.value.states[projectName] = stateName
    saveMessage.value = t('message.favoriteStateSet', { name: stateName })
  }
  saveFavorites(favorites.value)
  setTimeout(() => {
    saveMessage.value = null
  }, 2000)
}

const isFavoriteProject = (projectName: string): boolean => {
  return favorites.value.project === projectName
}

const isFavoriteState = (projectName: string, stateName: string): boolean => {
  return favorites.value.states[projectName] === stateName
}

// フィルタ適用後のテーブル数
const visibleTablesCount = computed(() => {
  if (!schema.value) return 0
  return filterTables(schema.value.tables, projectConfig.value).length
})

// エクスポート用の型定義
type ExportData = {
  version: number
  project: string
  selectedTables: string[]
  highlightedTables: string[]
  showRelations: boolean
  canvas: {
    positions: Record<string, { x: number; y: number }>
    expandedTables: string[]
    zoomLevel: number
  }
}

// プロジェクト一覧を取得
const loadProjects = async () => {
  try {
    const response = await fetch('/storage/projects.json')
    if (response.ok) {
      projects.value = await response.json()
    }
  } catch {
    // projects.json が存在しない場合は空のまま
  }
}

// ストレージ設定の型定義
type StorageConfig = {
  projects: Array<{
    name: string
    schemaPath: string
    filter?: {
      exclude?: {
        tables?: string[]
        patterns?: string[]
      }
    }
  }>
}

// プロジェクト設定を読み込み
const loadProjectConfig = async (projectName: string) => {
  try {
    const response = await fetch('/storage/config.json', {
      cache: 'no-store'
    })
    if (response.ok) {
      const storageConfig: StorageConfig = await response.json()
      const project = storageConfig.projects?.find(p => p.name === projectName)
      if (project?.filter) {
        projectConfig.value = { filter: project.filter }
      } else {
        // デフォルトのフィルタ設定
        projectConfig.value = {
          filter: {
            exclude: {
              tables: ['ar_internal_metadata', 'schema_migrations'],
              patterns: []
            }
          }
        }
      }
    } else {
      projectConfig.value = null
    }
  } catch {
    projectConfig.value = null
  }
}

const loadSchema = async (projectName: string) => {
  error.value = null
  selectedState.value = null
  states.value = []
  projectConfig.value = null

  try {
    const response = await fetch(`/storage/${projectName}/er.json`)
    if (!response.ok) {
      throw new Error(t('message.fileNotFound'))
    }
    schema.value = await response.json()
    selectedProject.value = projectName

    // プロジェクト設定を読み込み
    await loadProjectConfig(projectName)

    // フィルタを適用したテーブルを選択状態に初期化
    const tables = schema.value!.tables
    const filteredTables = filterTables(tables, projectConfig.value)
    selectedTables.value = new Set(filteredTables.map(t => t.name))

    // 状態一覧を取得
    await loadStatesList(projectName)
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('message.loadFailed')
    schema.value = null
  }
}

// 状態一覧を取得（サーバーAPIを使用）
const loadStatesList = async (projectName: string) => {
  try {
    const response = await fetch(`/api/states/list?project=${encodeURIComponent(projectName)}`)
    if (response.ok) {
      const data = await response.json()
      states.value = data.states || []
    } else {
      states.value = []
    }
  } catch {
    states.value = []
  }
}

// 保存された状態を読み込み
const loadState = async (projectName: string, stateName: string) => {
  try {
    const response = await fetch(`/storage/${projectName}/states/${stateName}.json`)
    if (!response.ok) return

    const data = await response.json() as ExportData

    // 状態を復元
    selectedTables.value = new Set(data.selectedTables)
    highlightedTables.value = new Set(data.highlightedTables || [])
    showRelations.value = data.showRelations
    selectedState.value = stateName

    // Canvasの状態を復元（次のティックで実行）
    nextTick(() => {
      if (erdCanvasRef.value) {
        erdCanvasRef.value.setState(data.canvas)
      }
    })
  } catch {
    // 読み込みに失敗しても無視
  }
}

// 状態を選択
const selectState = async (stateName: string) => {
  if (!selectedProject.value) return
  await loadState(selectedProject.value, stateName)
}

// 状態一覧を再読み込み
const reloadStatesList = async () => {
  if (!selectedProject.value) return
  await loadStatesList(selectedProject.value)
}

// 状態を保存（サーバーAPIを使用）
const saveState = async (name: string) => {
  if (!selectedProject.value || !erdCanvasRef.value) return

  const canvasState = erdCanvasRef.value.getState()

  const exportData: ExportData = {
    version: 1,
    project: selectedProject.value,
    selectedTables: Array.from(selectedTables.value),
    highlightedTables: Array.from(highlightedTables.value),
    showRelations: showRelations.value,
    canvas: canvasState,
  }

  try {
    const response = await fetch('/api/states/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: selectedProject.value,
        name,
        data: exportData,
      }),
    })

    if (!response.ok) {
      throw new Error(t('message.saveFailed'))
    }

    const result = await response.json()
    selectedState.value = result.name
    await reloadStatesList()
    error.value = null

    // 保存完了メッセージを表示
    saveMessage.value = t('message.saved')
    setTimeout(() => {
      saveMessage.value = null
    }, 1000)
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('message.saveFailed')
  }
}

// 新規保存（名前入力ダイアログ）
const saveAsNew = async () => {
  const name = prompt(t('message.savePrompt'))
  if (!name) return
  await saveState(name)
}

// 上書き保存
const saveOverwrite = async () => {
  if (!selectedState.value) return
  await saveState(selectedState.value)
}

// SVG エクスポート
const exportAsSvg = () => {
  if (!erdCanvasRef.value) return

  const svgString = erdCanvasRef.value.exportSvg()
  if (!svgString) return

  const blob = new Blob([svgString], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${selectedProject.value || 'erd'}.svg`
  a.click()
  URL.revokeObjectURL(url)
}

// PNG エクスポート
const exportAsPng = async () => {
  if (!erdCanvasRef.value) return

  const blob = await erdCanvasRef.value.exportPng()
  if (!blob) return

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${selectedProject.value || 'erd'}.png`
  a.click()
  URL.revokeObjectURL(url)
}

// Mermaid エクスポート（クリップボードにコピー）
const exportAsMermaid = async () => {
  if (!erdCanvasRef.value) return

  const mermaidText = erdCanvasRef.value.exportMermaid()
  if (!mermaidText) return

  try {
    await navigator.clipboard.writeText(mermaidText)
    // 簡易的な通知（後で改善可能）
    alert(t('message.mermaidCopied'))
  } catch {
    // フォールバック: テキストエリアを使用
    const textarea = document.createElement('textarea')
    textarea.value = mermaidText
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    alert(t('message.mermaidCopied'))
  }
}

onMounted(async () => {
  await loadProjects()

  if (projects.value.length === 0) return

  // お気に入りプロジェクトがあればそれを、なければ最初のプロジェクトを選択
  const favoriteProject = favorites.value.project
  const projectToLoad = favoriteProject && projects.value.includes(favoriteProject)
    ? favoriteProject
    : projects.value[0]

  await loadSchema(projectToLoad)

  if (states.value.length === 0) return

  // お気に入り状態があればそれを、なければ最初の状態を選択
  const favoriteState = favorites.value.states[projectToLoad]
  const stateToLoad = favoriteState && states.value.includes(favoriteState)
    ? favoriteState
    : states.value[0]

  await selectState(stateToLoad)
})
</script>

<template>
  <div class="container">
    <Transition name="toast">
      <div v-if="saveMessage" class="save-message">{{ saveMessage }}</div>
    </Transition>
    <header class="app-header">
      <h1>erd-as-document</h1>
      <div class="app-header-sub">
        <div class="project-selector">
          <select
            :value="selectedProject ?? ''"
            :disabled="projects.length === 0"
            @change="($event.target as HTMLSelectElement).value && loadSchema(($event.target as HTMLSelectElement).value)"
          >
            <option value="" disabled>
              {{ projects.length === 0 ? $t('header.projectNone') : $t('header.projectSelect') }}
            </option>
            <option v-for="project in projects" :key="project" :value="project">
              {{ project }}{{ isFavoriteProject(project) ? ' ⭐' : '' }}
            </option>
          </select>
          <button
            v-if="selectedProject"
            class="favorite-btn"
            :class="{ active: isFavoriteProject(selectedProject) }"
            :title="isFavoriteProject(selectedProject) ? $t('header.favoriteProjectRemove') : $t('header.favoriteProjectAdd')"
            @click="toggleFavoriteProject(selectedProject)"
          >
            {{ isFavoriteProject(selectedProject) ? '★' : '☆' }}
          </button>
        </div>
        <span v-if="schema" class="table-count">
          {{ $t('header.tableCount', { selected: selectedTables.size, total: visibleTablesCount }) }}
        </span>
        <select
          v-if="schema"
          class="state-selector"
          :value="selectedState ?? ''"
          :disabled="states.length === 0"
          @change="($event.target as HTMLSelectElement).value && selectState(($event.target as HTMLSelectElement).value)"
        >
          <option value="" disabled>
            {{ states.length === 0 ? $t('header.erDiagramNone') : $t('header.erDiagramSelect') }}
          </option>
          <option v-for="state in states" :key="state" :value="state">
            {{ state }}{{ selectedProject && isFavoriteState(selectedProject, state) ? ' ⭐' : '' }}
          </option>
        </select>
        <button
          v-if="schema && selectedState && selectedProject"
          class="favorite-btn"
          :class="{ active: isFavoriteState(selectedProject, selectedState) }"
          :title="isFavoriteState(selectedProject, selectedState) ? $t('header.favoriteStateRemove') : $t('header.favoriteStateAdd')"
          @click="toggleFavoriteState(selectedProject, selectedState)"
        >
          {{ isFavoriteState(selectedProject, selectedState) ? '★' : '☆' }}
        </button>
        <button
          v-if="schema && selectedState"
          class="reload-btn"
          :title="$t('header.reload')"
          @click="selectState(selectedState!)"
        >
          ↻
        </button>
        <div v-if="schema" class="schema-actions">
          <button class="action-btn save-btn" @click="saveAsNew">
            {{ $t('header.save') }}
          </button>
          <button
            v-if="selectedState"
            class="action-btn overwrite-btn"
            @click="saveOverwrite"
          >
            {{ $t('header.overwrite') }}
          </button>
          <div class="export-group">
            <button class="action-btn" @click="exportAsSvg">SVG</button>
            <button class="action-btn" @click="exportAsPng">PNG</button>
            <button class="action-btn" @click="exportAsMermaid">Mermaid</button>
          </div>
        </div>
      </div>
    </header>

    <div v-if="error" class="error">
      {{ error }}
    </div>

    <section v-if="projects.length === 0 && !schema" class="empty-state">
      <div class="empty-state-icon">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect x="4" y="8" width="18" height="14" rx="3" stroke="#667eea" stroke-width="2" fill="rgba(102,126,234,0.08)" />
          <rect x="26" y="8" width="18" height="14" rx="3" stroke="#764ba2" stroke-width="2" fill="rgba(118,75,162,0.08)" />
          <rect x="15" y="28" width="18" height="14" rx="3" stroke="#667eea" stroke-width="2" fill="rgba(102,126,234,0.08)" />
          <line x1="13" y1="22" x2="24" y2="28" stroke="#a0aec0" stroke-width="1.5" stroke-dasharray="3 2" />
          <line x1="35" y1="22" x2="24" y2="28" stroke="#a0aec0" stroke-width="1.5" stroke-dasharray="3 2" />
        </svg>
      </div>
      <p class="empty-state-text">{{ $t('welcome.title') }}</p>
      <div class="setup-steps">
        <div class="setup-step">
          <span class="setup-step-number">1</span>
          <div class="setup-step-content">
            <p class="setup-step-title">{{ $t('welcome.step1Title') }}</p>
            <pre><code>{{ $t('welcome.step1Code') }}</code></pre>
          </div>
        </div>
        <div class="setup-step">
          <span class="setup-step-number">2</span>
          <div class="setup-step-content">
            <p class="setup-step-title">{{ $t('welcome.step2Title') }}</p>
          </div>
        </div>
        <div class="setup-step">
          <span class="setup-step-number">3</span>
          <div class="setup-step-content">
            <p class="setup-step-title">{{ $t('welcome.step3Title') }}</p>
          </div>
        </div>
      </div>
    </section>

    <section v-else-if="!schema && projects.length > 0" class="empty-state">
      <div class="empty-state-icon">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect x="6" y="10" width="16" height="12" rx="2" stroke="#667eea" stroke-width="2" fill="rgba(102,126,234,0.08)" />
          <rect x="26" y="10" width="16" height="12" rx="2" stroke="#764ba2" stroke-width="2" fill="rgba(118,75,162,0.08)" />
          <rect x="16" y="28" width="16" height="12" rx="2" stroke="#667eea" stroke-width="2" fill="rgba(102,126,234,0.08)" />
          <line x1="14" y1="22" x2="24" y2="28" stroke="#a0aec0" stroke-width="1.5" stroke-dasharray="3 2" />
          <line x1="34" y1="22" x2="24" y2="28" stroke="#a0aec0" stroke-width="1.5" stroke-dasharray="3 2" />
        </svg>
      </div>
      <p class="empty-state-text">{{ $t('emptyState.text') }}</p>
    </section>

    <section v-if="schema" class="schema-view">
      <button
        class="toggle-sidebar-btn"
        :class="{ 'panel-hidden': !showSidebar }"
        :title="showSidebar ? $t('sidebar.hide') : $t('sidebar.show')"
        @click="showSidebar = !showSidebar"
      >
        {{ showSidebar ? '◀' : '▶' }}
      </button>
      <div class="erd-layout">
        <TableSelector
          v-show="showSidebar"
          :tables="schema.tables"
          :selected-tables="selectedTables"
          :highlighted-tables="highlightedTables"
          :show-relations="showRelations"
          :exclude-filter="projectConfig?.filter?.exclude"
          @update:selected-tables="selectedTables = $event"
          @update:highlighted-tables="highlightedTables = $event"
          @update:show-relations="showRelations = $event"
        />
        <ErdCanvas
          ref="erdCanvasRef"
          :schema="schema"
          :selected-tables="selectedTables"
          :highlighted-tables="highlightedTables"
          :show-relations="showRelations"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0.75rem 1.5rem;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.app-header {
  margin-bottom: 0.75rem;
}

.app-header-sub {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
  flex-wrap: wrap;
}

.app-header-sub .schema-actions {
  margin-left: auto;
}

.table-count {
  font-size: 12px;
  color: #4a5568;
  font-weight: 500;
}

h1 {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

h2 {
  font-size: 0.95rem;
  font-weight: 500;
  margin-bottom: 0.5rem;
  color: #1a1a2e;
}

.project-selector {
  display: flex;
  align-items: center;
  gap: 4px;
}

.project-selector select {
  padding: 6px 28px 6px 12px;
  border: 1px solid rgba(102, 126, 234, 0.3);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  color: #667eea;
  transition: all 0.2s ease;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12'%3E%3Cpath fill='%23667eea' d='M6 8L2 4h8z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  min-width: 150px;
  width: 150px;
  flex-shrink: 1;
}

.project-selector select:hover {
  border-color: rgba(102, 126, 234, 0.5);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
}

.project-selector select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}

.project-selector select:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.project-selector select option {
  background: #fff;
  color: #1a1a2e;
}

.error {
  color: #e53e3e;
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  background: rgba(229, 62, 62, 0.1);
  border-radius: 8px;
  font-size: 0.9rem;
}

.setup-steps {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 480px;
  width: 100%;
}

.setup-step {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.setup-step-number {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
}

.setup-step-content {
  flex: 1;
  min-width: 0;
}

.setup-step-title {
  margin: 0 0 0.4rem 0;
  font-size: 0.85rem;
  color: #4a5568;
  font-weight: 500;
  line-height: 24px;
}

.setup-step pre {
  background: #1a1a2e;
  padding: 0.6rem 0.8rem;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0;
}

.setup-step pre code {
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
  font-size: 0.8rem;
  color: #e2e8f0;
}

.empty-state code {
  background: rgba(102, 126, 234, 0.1);
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
  font-size: 0.85em;
  color: #667eea;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 1rem;
  opacity: 0.8;
}

.empty-state-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-state-text {
  text-align: center;
  color: #718096;
  font-size: 0.9rem;
  line-height: 1.7;
  margin: 0;
}

.schema-view {
  margin-top: 0.5rem;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.schema-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  padding: 6px 14px;
  border: 1px solid rgba(102, 126, 234, 0.3);
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  color: #667eea;
  font-weight: 500;
  transition: all 0.2s ease;
}

.action-btn:hover {
  background: rgba(102, 126, 234, 0.1);
  border-color: rgba(102, 126, 234, 0.5);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
}

.save-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border: none;
}

.save-btn:hover {
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  transform: translateY(-1px);
}

.overwrite-btn {
  background: rgba(102, 126, 234, 0.15);
  color: #667eea;
  border: 1px solid rgba(102, 126, 234, 0.3);
}

.overwrite-btn:hover {
  background: rgba(102, 126, 234, 0.25);
  border-color: rgba(102, 126, 234, 0.5);
}

.save-message {
  position: fixed;
  top: 16px;
  right: 16px;
  padding: 10px 20px;
  background: rgba(72, 187, 120, 0.95);
  color: #fff;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 4px 12px rgba(72, 187, 120, 0.3);
  z-index: 1000;
}

.toast-enter-active {
  animation: toastIn 0.3s ease;
}

.toast-leave-active {
  animation: toastOut 0.3s ease;
}

@keyframes toastIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes toastOut {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(-10px); }
}

.state-selector {
  padding: 6px 28px 6px 12px;
  border: 1px solid rgba(102, 126, 234, 0.3);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  color: #667eea;
  transition: all 0.2s ease;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12'%3E%3Cpath fill='%23667eea' d='M6 8L2 4h8z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  min-width: 180px;
  width: 180px;
}

.state-selector:hover:not(:disabled) {
  border-color: rgba(102, 126, 234, 0.5);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
}

.state-selector:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}

.state-selector:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.state-selector option {
  background: #fff;
  color: #1a1a2e;
}

.reload-btn {
  margin-left: -0.25rem;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid rgba(102, 126, 234, 0.3);
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #667eea;
  transition: all 0.2s ease;
}

.reload-btn:hover {
  background: rgba(102, 126, 234, 0.1);
  border-color: rgba(102, 126, 234, 0.5);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
}

.favorite-btn {
  margin-left: 0;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid rgba(102, 126, 234, 0.3);
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  border-radius: 8px;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ccc;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.favorite-btn:hover {
  background: rgba(255, 215, 0, 0.1);
  border-color: rgba(255, 215, 0, 0.5);
  box-shadow: 0 2px 8px rgba(255, 215, 0, 0.15);
}

.favorite-btn.active {
  color: #ffd700;
  border-color: rgba(255, 215, 0, 0.5);
  background: rgba(255, 215, 0, 0.1);
}

.export-group {
  display: flex;
  gap: 4px;
  padding-left: 8px;
  border-left: 1px solid rgba(102, 126, 234, 0.2);
}

.erd-layout {
  display: flex;
  gap: 1rem;
  align-items: stretch;
  flex: 1;
  overflow: hidden;
}

.toggle-sidebar-btn {
  position: fixed;
  left: 0;
  top: 100px;
  width: 32px;
  height: 36px;
  padding: 0;
  border: 1px solid rgba(102, 126, 234, 0.2);
  border-left: none;
  background: rgba(255, 255, 255, 0.9);
  color: #667eea;
  font-size: 12px;
  cursor: pointer;
  border-radius: 0 6px 6px 0;
  transition: all 0.2s ease;
  z-index: 100;
  box-shadow: 2px 0 8px rgba(102, 126, 234, 0.1);
}

.toggle-sidebar-btn:hover {
  background: rgba(102, 126, 234, 0.1);
  color: #764ba2;
}

.toggle-sidebar-btn.panel-hidden {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border-color: transparent;
}

.erd-layout > :last-child {
  flex: 1;
  overflow: hidden;
}
</style>

<style>
html, body {
  margin: 0;
  padding: 0;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 50%, #e8e4f0 100%);
  height: 100vh;
  overflow: hidden;
}
</style>
