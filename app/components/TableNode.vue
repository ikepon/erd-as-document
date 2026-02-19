<script setup lang="ts">
import type { Table } from '~/types/er-schema'

type Props = {
  table: Table
  x: number
  y: number
  showColumns?: boolean
  highlighted?: boolean
  canvasSelected?: boolean
}

type Emits = {
  dragstart: [event: MouseEvent]
  toggleColumns: []
}

const props = withDefaults(defineProps<Props>(), {
  showColumns: true,
  highlighted: false,
  canvasSelected: false,
})

const emit = defineEmits<Emits>()

const handleMouseDown = (event: MouseEvent) => {
  event.preventDefault()
  emit('dragstart', event)
}

const handleToggleClick = (event: MouseEvent) => {
  event.stopPropagation()
  event.preventDefault()
  emit('toggleColumns')
}

// テーブル名を適切な長さで分割
const MAX_CHARS_PER_LINE = 26

const tableNameLines = computed(() => {
  const name = props.table.name
  if (name.length <= MAX_CHARS_PER_LINE) {
    return [name]
  }

  // アンダースコアで分割を試みる
  const parts = name.split('_')
  const lines: string[] = []
  let currentLine = ''

  for (const part of parts) {
    const separator = currentLine ? '_' : ''
    if ((currentLine + separator + part).length <= MAX_CHARS_PER_LINE) {
      currentLine = currentLine + separator + part
    } else {
      if (currentLine) {
        lines.push(currentLine)
      }
      currentLine = part
    }
  }
  if (currentLine) {
    lines.push(currentLine)
  }

  return lines
})

// ヘッダーの高さ（行数に応じて調整）
const headerHeight = computed(() => {
  const lineCount = tableNameLines.value.length
  return Math.max(32, 20 + lineCount * 16)
})

// カラム名の最大文字数（型表示との重複を防ぐ）
const MAX_COLUMN_CHARS_PER_LINE = 22

// カラム名を複数行に分割
const splitColumnName = (name: string): string[] => {
  if (name.length <= MAX_COLUMN_CHARS_PER_LINE) {
    return [name]
  }

  // アンダースコアで分割を試みる
  const parts = name.split('_')
  const lines: string[] = []
  let currentLine = ''

  for (const part of parts) {
    const separator = currentLine ? '_' : ''
    if ((currentLine + separator + part).length <= MAX_COLUMN_CHARS_PER_LINE) {
      currentLine = currentLine + separator + part
    } else {
      if (currentLine) {
        lines.push(currentLine)
      }
      // パーツ自体が長い場合は強制的に分割
      if (part.length > MAX_COLUMN_CHARS_PER_LINE) {
        currentLine = part.slice(0, MAX_COLUMN_CHARS_PER_LINE - 1) + '…'
      } else {
        currentLine = part
      }
    }
  }
  if (currentLine) {
    lines.push(currentLine)
  }

  return lines
}

// カラムの行数を計算
const getColumnLineCount = (column: { name: string }): number => {
  return splitColumnName(column.name).length
}

// カラムのY位置を計算（前のカラムの行数を考慮）
const getColumnY = (index: number): number => {
  let y = headerHeight.value + 20
  for (let i = 0; i < index; i++) {
    const lineCount = getColumnLineCount(props.table.columns[i])
    y += Math.max(1, lineCount) * 14 + 10
  }
  return y
}

// テーブル全体の高さを計算
const totalColumnsHeight = computed(() => {
  let height = 0
  for (const column of props.table.columns) {
    const lineCount = getColumnLineCount(column)
    height += Math.max(1, lineCount) * 14 + 10
  }
  return height
})
</script>

<template>
  <g
    :transform="`translate(${x}, ${y})`"
    :class="['table-node', { highlighted: props.highlighted }]"
    @mousedown.stop="handleMouseDown"
  >
    <!-- シャドウ -->
    <rect
      :class="['table-shadow', { highlighted: props.highlighted }]"
      :width="250"
      :height="props.showColumns ? headerHeight + 8 + totalColumnsHeight : headerHeight"
      rx="12"
      ry="12"
      x="2"
      y="2"
    />
    <rect
      :class="['table-bg', { highlighted: props.highlighted }]"
      :width="250"
      :height="props.showColumns ? headerHeight + 8 + totalColumnsHeight : headerHeight"
      rx="12"
      ry="12"
    />
    <rect
      :class="['table-header', { highlighted: props.highlighted }]"
      :width="250"
      :height="headerHeight"
      rx="12"
      ry="12"
    />
    <text :class="['table-name', { 'canvas-selected': props.canvasSelected }]" x="115" text-anchor="middle">
      <tspan
        v-for="(line, index) in tableNameLines"
        :key="index"
        x="115"
        :y="tableNameLines.length === 1 ? 22 : 18 + index * 16"
      >
        {{ line }}
      </tspan>
    </text>
    <!-- カラム展開トグルアイコン -->
    <g
      class="toggle-icon"
      @click="handleToggleClick"
      @mousedown.stop
    >
      <rect
        x="226"
        :y="(headerHeight - 16) / 2"
        width="16"
        height="16"
        fill="transparent"
      />
      <text
        x="234"
        :y="headerHeight / 2 + 5"
        text-anchor="middle"
        class="toggle-icon-text"
      >
        {{ props.showColumns ? '▼' : '▶' }}
      </text>
    </g>
    <g v-if="props.showColumns" class="columns">
      <g v-for="(column, index) in table.columns" :key="column.name">
        <text
          class="column-name"
          x="8"
          :y="getColumnY(index)"
        >
          <tspan
            v-for="(line, lineIndex) in splitColumnName(column.name)"
            :key="lineIndex"
            x="8"
            :dy="lineIndex === 0 ? 0 : 14"
          >
            {{ line }}
          </tspan>
          <title>{{ column.name }}</title>
        </text>
        <text
          class="column-type"
          x="242"
          :y="getColumnY(index)"
          text-anchor="end"
        >
          {{ column.type }}
        </text>
      </g>
    </g>
  </g>
</template>

<style scoped>
.table-node {
  cursor: move;
}

.table-shadow {
  fill: rgba(102, 126, 234, 0.15);
  filter: blur(8px);
}

.table-bg {
  fill: rgba(255, 255, 255, 0.95);
  stroke: rgba(102, 126, 234, 0.2);
  stroke-width: 1;
}

.table-header {
  fill: url(#header-gradient);
}


.table-name {
  fill: #fff;
  font-size: 13px;
  font-weight: 600;
  pointer-events: none;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

.toggle-icon {
  cursor: pointer;
}

.toggle-icon-text {
  fill: rgba(255, 255, 255, 0.8);
  font-size: 9px;
}

.column-name {
  fill: #1a1a2e;
  font-size: 12px;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

.column-type {
  fill: #a0aec0;
  font-size: 11px;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
}

/* キャンバス選択状態 */
.table-name.canvas-selected {
  fill: #fef08a;
}

/* ハイライト状態 */
.table-shadow.highlighted {
  fill: rgba(230, 126, 34, 0.25);
}

.table-bg.highlighted {
  stroke: rgba(230, 126, 34, 0.5);
  stroke-width: 2;
}

.table-header.highlighted {
  fill: #e67e22;
}
</style>
