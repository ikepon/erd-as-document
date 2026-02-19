<script setup lang="ts">
import type { ERSchema, Table } from '~/types/er-schema'

type Props = {
  schema: ERSchema
  selectedTables: Set<string>
  highlightedTables: Set<string>
  showRelations?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showRelations: true,
})

type TablePosition = {
  table: Table
  x: number
  y: number
  width: number
  height: number
}

const TABLE_WIDTH = 250
const SNAP_THRESHOLD = 8

type SnapGuide = {
  type: 'horizontal' | 'vertical'
  position: number
}

const snapGuides = ref<SnapGuide[]>([])

// ズームレベル（%）
const zoomLevel = ref(100)
const ZOOM_MIN = 25
const ZOOM_MAX = 200
const ZOOM_STEP = 25

const zoomIn = () => {
  zoomLevel.value = Math.min(ZOOM_MAX, zoomLevel.value + ZOOM_STEP)
}

const zoomOut = () => {
  zoomLevel.value = Math.max(ZOOM_MIN, zoomLevel.value - ZOOM_STEP)
}

const zoomReset = () => {
  zoomLevel.value = 100
}

// 手動で設定された位置を保持
const manualPositions = ref<Map<string, { x: number; y: number }>>(new Map())

// テーブルごとのカラム表示状態（デフォルトは非表示）
const expandedTables = ref<Set<string>>(new Set())

const toggleTableColumns = (tableName: string) => {
  const newSet = new Set(expandedTables.value)
  if (newSet.has(tableName)) {
    newSet.delete(tableName)
  } else {
    newSet.add(tableName)
  }
  expandedTables.value = newSet
}

const isTableExpanded = (tableName: string): boolean => {
  return expandedTables.value.has(tableName)
}

// 選択されたテーブルのみをフィルタリング
const filteredTables = computed(() => {
  return props.schema.tables.filter(table => props.selectedTables.has(table.name))
})

// 選択解除されたテーブルのキャッシュをクリア
watch(() => props.selectedTables, (newSelected, oldSelected) => {
  if (!oldSelected) return

  // 選択解除されたテーブルのキャッシュを削除
  for (const name of oldSelected) {
    if (!newSelected.has(name)) {
      initialPositionCache.value.delete(name)
    }
  }
  if (initialPositionCache.value.size !== oldSelected.size) {
    initialPositionCache.value = new Map(initialPositionCache.value)
  }

  // 非表示にされたテーブルをキャンバス選択から除去
  let changed = false
  const newCanvasSelected = new Set(canvasSelectedTables.value)
  for (const name of canvasSelectedTables.value) {
    if (!newSelected.has(name)) {
      newCanvasSelected.delete(name)
      changed = true
    }
  }
  if (changed) {
    canvasSelectedTables.value = newCanvasSelected
  }
}, { deep: true })

// テーブル名の行数を計算
const MAX_CHARS_PER_LINE = 20

const getTableNameLineCount = (name: string): number => {
  if (name.length <= MAX_CHARS_PER_LINE) return 1
  const parts = name.split('_')
  let lineCount = 0
  let currentLine = ''
  for (const part of parts) {
    const separator = currentLine ? '_' : ''
    if ((currentLine + separator + part).length <= MAX_CHARS_PER_LINE) {
      currentLine = currentLine + separator + part
    } else {
      if (currentLine) lineCount++
      currentLine = part
    }
  }
  if (currentLine) lineCount++
  return lineCount
}

// ヘッダーの高さを計算
const getHeaderHeight = (table: Table): number => {
  const lineCount = getTableNameLineCount(table.name)
  return Math.max(32, 20 + lineCount * 16)
}

// テーブルの高さを計算
const getTableHeight = (table: Table): number => {
  const headerHeight = getHeaderHeight(table)
  const showColumns = isTableExpanded(table.name)
  return showColumns ? headerHeight + 8 + table.columns.length * 24 : headerHeight
}

// テーブルごとの初期位置をキャッシュ（選択変更で位置が変わらないように）
const initialPositionCache = ref<Map<string, { x: number; y: number }>>(new Map())

// 初期配置を計算（グリッドレイアウト、キャッシュ付き）
const calculateInitialPosition = (table: Table): { x: number; y: number } => {
  // キャッシュがあればそれを返す
  const cached = initialPositionCache.value.get(table.name)
  if (cached) return cached

  const cols = 4
  const marginX = 40
  const marginY = 40
  const baseHeight = 48 // デフォルトの高さ

  // すでに配置されているテーブルの位置を収集（選択中のテーブルのみ）
  const occupiedPositions = new Set<string>()
  for (const [name, pos] of manualPositions.value) {
    if (!props.selectedTables.has(name)) continue
    const col = Math.round((pos.x - 20) / (TABLE_WIDTH + marginX))
    const row = Math.round((pos.y - 20) / (baseHeight + marginY))
    occupiedPositions.add(`${col},${row}`)
  }
  for (const [name, pos] of initialPositionCache.value) {
    if (!props.selectedTables.has(name)) continue
    const col = Math.round((pos.x - 20) / (TABLE_WIDTH + marginX))
    const row = Math.round((pos.y - 20) / (baseHeight + marginY))
    occupiedPositions.add(`${col},${row}`)
  }

  // 空いている位置を探す
  let col = 0
  let row = 0
  while (occupiedPositions.has(`${col},${row}`)) {
    col++
    if (col >= cols) {
      col = 0
      row++
    }
  }

  const position = {
    x: 20 + col * (TABLE_WIDTH + marginX),
    y: 20 + row * (baseHeight + marginY),
  }

  // キャッシュに保存
  initialPositionCache.value.set(table.name, position)
  initialPositionCache.value = new Map(initialPositionCache.value)

  return position
}

// テーブルの位置を取得（手動位置があればそれを使用）
const tablePositions = computed<TablePosition[]>(() => {
  return filteredTables.value.map((table) => {
    const manual = manualPositions.value.get(table.name)
    const pos = manual || calculateInitialPosition(table)

    return {
      table,
      x: pos.x,
      y: pos.y,
      width: TABLE_WIDTH,
      height: getTableHeight(table),
    }
  })
})

// カラム展開中のテーブルを前面に表示するためにソート
const sortedTablePositions = computed<TablePosition[]>(() => {
  return [...tablePositions.value].sort((a, b) => {
    const aExpanded = isTableExpanded(a.table.name)
    const bExpanded = isTableExpanded(b.table.name)
    // 展開中のテーブルを後ろ（前面）に
    if (aExpanded && !bExpanded) return 1
    if (!aExpanded && bExpanded) return -1
    return 0
  })
})

// コンテンツの境界を計算（ズームなし）
const contentBounds = computed(() => {
  if (tablePositions.value.length === 0) {
    return { minX: 0, minY: 0, w: 800, h: 600 }
  }

  const minX = Math.min(0, ...tablePositions.value.map(p => p.x)) - 40
  const minY = Math.min(0, ...tablePositions.value.map(p => p.y)) - 40
  const maxX = Math.max(...tablePositions.value.map(p => p.x + p.width)) + 40
  const maxY = Math.max(...tablePositions.value.map(p => p.y + p.height)) + 40

  return {
    minX,
    minY,
    w: Math.max(800, maxX - minX),
    h: Math.max(600, maxY - minY),
  }
})

// SVG のビューボックス（座標系のみ、ズームはSVG要素サイズで表現）
const viewBox = computed(() => {
  const { minX, minY, w, h } = contentBounds.value
  return `${minX} ${minY} ${w} ${h}`
})

// SVG 要素の物理サイズ（ズームを反映）
const svgStyle = computed(() => {
  const { w, h } = contentBounds.value
  const z = zoomLevel.value / 100
  return {
    width: `${w * z}px`,
    height: `${h * z}px`,
  }
})

// viewBox のパース済み値
const viewBoxParsed = computed(() => {
  const [x, y, w, h] = viewBox.value.split(' ').map(Number)
  return { x, y, w, h }
})

// テーブル名から位置を取得するマップ
const tablePositionMap = computed(() => {
  const map = new Map<string, TablePosition>()
  tablePositions.value.forEach(pos => {
    map.set(pos.table.name, pos)
  })
  return map
})

// 関連線のパスを計算
type RelationLine = {
  key: string
  from: string
  to: string
  path: string
}

// 2点間の接続点とパスを計算（ヘッダー部分のみに接続）
const calculateConnectionPath = (
  from: TablePosition,
  to: TablePosition
): { fromX: number; fromY: number; toX: number; toY: number; path: string } => {
  // ヘッダー高さを取得（カラム展開状態に依存しない固定値）
  const fromHeaderHeight = getHeaderHeight(from.table)
  const toHeaderHeight = getHeaderHeight(to.table)

  // ヘッダー中心を基準に計算
  const fromCenterX = from.x + from.width / 2
  const fromCenterY = from.y + fromHeaderHeight / 2
  const toCenterX = to.x + to.width / 2
  const toCenterY = to.y + toHeaderHeight / 2

  const dx = Math.abs(toCenterX - fromCenterX)
  const dy = Math.abs(toCenterY - fromCenterY)

  let fromX: number, fromY: number, toX: number, toY: number

  // 横方向の距離が大きい場合は左右から接続
  if (dx > dy) {
    if (fromCenterX < toCenterX) {
      fromX = from.x + from.width
      toX = to.x
    } else {
      fromX = from.x
      toX = to.x + to.width
    }
    fromY = fromCenterY
    toY = toCenterY

    // 水平方向のベジェ曲線
    const midX = (fromX + toX) / 2
    const path = `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`
    return { fromX, fromY, toX, toY, path }
  } else {
    // 縦方向の距離が大きい場合は上下から接続
    if (fromCenterY < toCenterY) {
      fromY = from.y + fromHeaderHeight
      toY = to.y
    } else {
      fromY = from.y
      toY = to.y + toHeaderHeight
    }
    fromX = fromCenterX
    toX = toCenterX

    // 垂直方向のベジェ曲線
    const midY = (fromY + toY) / 2
    const path = `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`
    return { fromX, fromY, toX, toY, path }
  }
}

const relationLines = computed<RelationLine[]>(() => {
  if (!props.showRelations) return []

  const lines: RelationLine[] = []

  tablePositions.value.forEach(pos => {
    pos.table.relations.forEach(relation => {
      const toPos = tablePositionMap.value.get(relation.to)
      if (!toPos) return

      const { path } = calculateConnectionPath(pos, toPos)

      lines.push({
        key: `${pos.table.name}-${relation.to}-${relation.column}`,
        from: pos.table.name,
        to: relation.to,
        path,
      })
    })
  })

  return lines
})

// 矩形選択 & 複数テーブル選択
const canvasSelectedTables = ref<Set<string>>(new Set())

type RectangleSelection = {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

const rectangleSelection = ref<RectangleSelection | null>(null)

// 矩形選択の描画用プロパティ
const selectionRect = computed(() => {
  if (!rectangleSelection.value) return null
  const { startX, startY, currentX, currentY } = rectangleSelection.value
  return {
    x: Math.min(startX, currentX),
    y: Math.min(startY, currentY),
    width: Math.abs(currentX - startX),
    height: Math.abs(currentY - startY),
  }
})

// ドラッグ処理
const svgRef = ref<SVGSVGElement | null>(null)

// クライアント座標をSVG座標に変換（ズーム対応）
const clientToSvgCoords = (clientX: number, clientY: number): { x: number; y: number } => {
  if (!svgRef.value) return { x: clientX, y: clientY }
  const ctm = svgRef.value.getScreenCTM()
  if (!ctm) return { x: clientX, y: clientY }
  const inv = ctm.inverse()
  return {
    x: inv.a * clientX + inv.c * clientY + inv.e,
    y: inv.b * clientX + inv.d * clientY + inv.f,
  }
}

const dragging = ref<{
  tableName: string
  startX: number
  startY: number
  lastMouseX: number
  lastMouseY: number
} | null>(null)

// ドラッグ中のスナップ前の「生の位置」を保持（スナップの吸い付きをスムーズにするため）
const dragRawPositions = ref<Map<string, { x: number; y: number }>>(new Map())

// スナップ判定: ドラッグ中の矩形と他テーブルの基準線を比較
type SnapResult = {
  correctedX: number
  correctedY: number
  guides: SnapGuide[]
}

const calculateSnap = (
  dragRect: { x: number; y: number; width: number; height: number },
  excludeNames: Set<string>,
): SnapResult => {
  // ドラッグ対象の6基準線
  const dragLines = {
    vertical: [dragRect.x, dragRect.x + dragRect.width / 2, dragRect.x + dragRect.width],
    horizontal: [dragRect.y, dragRect.y + dragRect.height / 2, dragRect.y + dragRect.height],
  }

  let snapDx = 0
  let snapDy = 0
  let bestDistX = SNAP_THRESHOLD + 1
  let bestDistY = SNAP_THRESHOLD + 1
  const guides: SnapGuide[] = []

  for (const pos of tablePositions.value) {
    if (excludeNames.has(pos.table.name)) continue

    // 対象テーブルの6基準線
    const targetVertical = [pos.x, pos.x + pos.width / 2, pos.x + pos.width]
    const targetHorizontal = [pos.y, pos.y + pos.height / 2, pos.y + pos.height]

    // 垂直方向（x軸）のスナップ
    for (const dv of dragLines.vertical) {
      for (const tv of targetVertical) {
        const dist = Math.abs(dv - tv)
        if (dist < bestDistX) {
          bestDistX = dist
          snapDx = tv - dv
        }
      }
    }

    // 水平方向（y軸）のスナップ
    for (const dh of dragLines.horizontal) {
      for (const th of targetHorizontal) {
        const dist = Math.abs(dh - th)
        if (dist < bestDistY) {
          bestDistY = dist
          snapDy = th - dh
        }
      }
    }
  }

  // 閾値を超えている場合はスナップしない
  if (bestDistX > SNAP_THRESHOLD) snapDx = 0
  if (bestDistY > SNAP_THRESHOLD) snapDy = 0

  // スナップが発生した基準線をガイドとして収集
  if (snapDx !== 0 || snapDy !== 0 || bestDistX <= SNAP_THRESHOLD || bestDistY <= SNAP_THRESHOLD) {
    const correctedDragLines = {
      vertical: [dragRect.x + snapDx, dragRect.x + snapDx + dragRect.width / 2, dragRect.x + snapDx + dragRect.width],
      horizontal: [dragRect.y + snapDy, dragRect.y + snapDy + dragRect.height / 2, dragRect.y + snapDy + dragRect.height],
    }

    for (const pos of tablePositions.value) {
      if (excludeNames.has(pos.table.name)) continue

      const targetVertical = [pos.x, pos.x + pos.width / 2, pos.x + pos.width]
      const targetHorizontal = [pos.y, pos.y + pos.height / 2, pos.y + pos.height]

      if (bestDistX <= SNAP_THRESHOLD) {
        for (const cv of correctedDragLines.vertical) {
          for (const tv of targetVertical) {
            if (Math.abs(cv - tv) < 0.5) {
              guides.push({ type: 'vertical', position: tv })
            }
          }
        }
      }

      if (bestDistY <= SNAP_THRESHOLD) {
        for (const ch of correctedDragLines.horizontal) {
          for (const th of targetHorizontal) {
            if (Math.abs(ch - th) < 0.5) {
              guides.push({ type: 'horizontal', position: th })
            }
          }
        }
      }
    }
  }

  // 重複ガイドを除去
  const uniqueGuides: SnapGuide[] = []
  const seen = new Set<string>()
  for (const g of guides) {
    const key = `${g.type}:${g.position}`
    if (!seen.has(key)) {
      seen.add(key)
      uniqueGuides.push(g)
    }
  }

  return {
    correctedX: dragRect.x + snapDx,
    correctedY: dragRect.y + snapDy,
    guides: uniqueGuides,
  }
}

const handleDragStart = (tableName: string, event: MouseEvent) => {
  const pos = tablePositionMap.value.get(tableName)
  if (!pos) return

  // 選択されていないテーブルをドラッグ開始 → 選択クリア
  if (!canvasSelectedTables.value.has(tableName)) {
    canvasSelectedTables.value = new Set()
  }

  dragging.value = {
    tableName,
    startX: pos.x,
    startY: pos.y,
    lastMouseX: event.clientX,
    lastMouseY: event.clientY,
  }

  // 生座標を初期化（現在の表示位置をそのまま使う）
  const rawPositions = new Map<string, { x: number; y: number }>()
  if (canvasSelectedTables.value.has(tableName)) {
    for (const name of canvasSelectedTables.value) {
      const p = tablePositionMap.value.get(name)
      if (!p) continue
      rawPositions.set(name, { x: p.x, y: p.y })
    }
  } else {
    rawPositions.set(tableName, { x: pos.x, y: pos.y })
  }
  dragRawPositions.value = rawPositions
}

// キャンバス空白エリアのmousedownで矩形選択を開始
const handleCanvasMouseDown = (event: MouseEvent) => {
  // 左ボタンのみ
  if (event.button !== 0) return

  const svgCoords = clientToSvgCoords(event.clientX, event.clientY)
  rectangleSelection.value = {
    startX: svgCoords.x,
    startY: svgCoords.y,
    currentX: svgCoords.x,
    currentY: svgCoords.y,
  }
}

const handleDragMove = (event: MouseEvent) => {
  // 矩形選択中
  if (rectangleSelection.value) {
    const svgCoords = clientToSvgCoords(event.clientX, event.clientY)
    rectangleSelection.value = {
      ...rectangleSelection.value,
      currentX: svgCoords.x,
      currentY: svgCoords.y,
    }
    return
  }

  if (!dragging.value) return

  // SVG座標系でのマウス移動量を計算（getScreenCTM がズームを自動補正）
  const cur = clientToSvgCoords(event.clientX, event.clientY)
  const prev = clientToSvgCoords(dragging.value.lastMouseX, dragging.value.lastMouseY)
  const deltaX = cur.x - prev.x
  const deltaY = cur.y - prev.y

  // 生座標をデルタ分だけ移動（スナップ前の位置を蓄積）
  for (const [name, raw] of dragRawPositions.value) {
    dragRawPositions.value.set(name, { x: raw.x + deltaX, y: raw.y + deltaY })
  }

  // 選択されたテーブルの一括移動
  if (canvasSelectedTables.value.has(dragging.value.tableName)) {
    // グループ全体のバウンディングボックスを生座標から計算
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const name of canvasSelectedTables.value) {
      const raw = dragRawPositions.value.get(name)
      const pos = tablePositionMap.value.get(name)
      if (!raw || !pos) continue
      minX = Math.min(minX, raw.x)
      minY = Math.min(minY, raw.y)
      maxX = Math.max(maxX, raw.x + pos.width)
      maxY = Math.max(maxY, raw.y + pos.height)
    }

    // バウンディングボックスでスナップ判定
    const snap = calculateSnap(
      { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      canvasSelectedTables.value,
    )
    const groupSnapDx = snap.correctedX - minX
    const groupSnapDy = snap.correctedY - minY
    snapGuides.value = snap.guides

    // スナップ補正を適用（生座標 + スナップ補正 = 表示位置）
    for (const name of canvasSelectedTables.value) {
      const raw = dragRawPositions.value.get(name)
      if (!raw) continue
      manualPositions.value.set(name, { x: raw.x + groupSnapDx, y: raw.y + groupSnapDy })
    }
  } else {
    // 単一テーブルの移動
    const raw = dragRawPositions.value.get(dragging.value.tableName)
    if (!raw) return

    const pos = tablePositionMap.value.get(dragging.value.tableName)
    const width = pos?.width ?? TABLE_WIDTH
    const height = pos?.height ?? 32

    const snap = calculateSnap(
      { x: raw.x, y: raw.y, width, height },
      new Set([dragging.value.tableName]),
    )
    snapGuides.value = snap.guides
    manualPositions.value.set(dragging.value.tableName, { x: snap.correctedX, y: snap.correctedY })
  }

  // 強制的にリアクティブ更新をトリガー
  manualPositions.value = new Map(manualPositions.value)

  // 次回の計算用にマウス位置を更新
  dragging.value.lastMouseX = event.clientX
  dragging.value.lastMouseY = event.clientY
}

const handleDragEnd = () => {
  // 矩形選択の完了処理
  if (rectangleSelection.value) {
    const sel = rectangleSelection.value
    const dx = Math.abs(sel.currentX - sel.startX)
    const dy = Math.abs(sel.currentY - sel.startY)

    // ドラッグ距離が小さい場合はクリック扱い → 選択クリア
    if (dx < 5 && dy < 5) {
      canvasSelectedTables.value = new Set()
    } else {
      // 矩形と重なるテーブルを選択
      const rect = selectionRect.value!
      const selected = new Set<string>()
      for (const pos of tablePositions.value) {
        // 矩形同士の重なり判定
        if (
          pos.x < rect.x + rect.width &&
          pos.x + pos.width > rect.x &&
          pos.y < rect.y + rect.height &&
          pos.y + pos.height > rect.y
        ) {
          selected.add(pos.table.name)
        }
      }
      canvasSelectedTables.value = selected
    }
    rectangleSelection.value = null
    return
  }

  dragging.value = null
  snapGuides.value = []
  dragRawPositions.value = new Map()
}

// 配置リセット
const resetPositions = () => {
  manualPositions.value = new Map()
  initialPositionCache.value = new Map()
  canvasSelectedTables.value = new Set()
}

// エクスポート用の状態取得
type CanvasState = {
  positions: Record<string, { x: number; y: number }>
  expandedTables: string[]
  zoomLevel: number
}

const getState = (): CanvasState => {
  const positions: Record<string, { x: number; y: number }> = {}
  for (const [name, pos] of manualPositions.value) {
    positions[name] = pos
  }
  return {
    positions,
    expandedTables: Array.from(expandedTables.value),
    zoomLevel: zoomLevel.value,
  }
}

// インポート用の状態設定
const setState = (state: CanvasState) => {
  // 位置を復元
  const newPositions = new Map<string, { x: number; y: number }>()
  for (const [name, pos] of Object.entries(state.positions)) {
    newPositions.set(name, pos)
  }
  manualPositions.value = newPositions
  initialPositionCache.value = new Map()

  // 展開状態を復元
  expandedTables.value = new Set(state.expandedTables)

  // ズームレベルを復元
  zoomLevel.value = state.zoomLevel
}

// SVG エクスポート
const exportSvg = (): string => {
  if (!svgRef.value) return ''

  // SVG をクローン
  const clone = svgRef.value.cloneNode(true) as SVGSVGElement

  // スタイルを埋め込み
  const styles = `
    .table-node { cursor: move; }
    .table-shadow { fill: rgba(102, 126, 234, 0.15); }
    .table-bg { fill: rgba(255, 255, 255, 0.95); stroke: rgba(102, 126, 234, 0.2); stroke-width: 1; }
    .table-header { fill: url(#header-gradient); }
    .table-name { fill: #fff; font-size: 13px; font-weight: 600; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
    .toggle-icon { cursor: pointer; }
    .toggle-icon-text { fill: rgba(255, 255, 255, 0.8); font-size: 9px; }
    .column-name { fill: #1a1a2e; font-size: 12px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
    .column-type { fill: #a0aec0; font-size: 11px; font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace; }
    .relation-line { fill: none; stroke: #667eea; stroke-width: 2; opacity: 0.5; }
  `
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  styleEl.textContent = styles
  clone.insertBefore(styleEl, clone.firstChild)

  // xmlns 属性を追加
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

  // 背景を追加
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bg.setAttribute('width', '100%')
  bg.setAttribute('height', '100%')
  bg.setAttribute('fill', '#fff')
  clone.insertBefore(bg, clone.querySelector('defs'))

  return new XMLSerializer().serializeToString(clone)
}

// PNG エクスポート
const exportPng = async (): Promise<Blob | null> => {
  const svgString = exportSvg()
  if (!svgString) return null

  // viewBox からサイズを取得
  const vb = viewBox.value.split(' ').map(Number)
  const width = vb[2] || 800
  const height = vb[3] || 600

  return new Promise((resolve) => {
    const img = new Image()
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)

    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width * 2 // 高解像度
      canvas.height = height * 2
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(null)
        return
      }

      ctx.scale(2, 2)
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url)
        resolve(blob)
      }, 'image/png')
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }

    img.src = url
  })
}

// Mermaid エクスポート
const exportMermaid = (): string => {
  const lines: string[] = ['erDiagram']

  const selectedTableNames = new Set(filteredTables.value.map(t => t.name))

  // カラム表示中のテーブルはカラム定義を出力
  filteredTables.value.forEach(table => {
    if (!expandedTables.value.has(table.name)) return
    lines.push(`    ${table.name} {`)
    table.columns.forEach(col => {
      lines.push(`        ${col.type} ${col.name}`)
    })
    lines.push(`    }`)
  })

  // 関連を出力
  filteredTables.value.forEach(table => {
    table.relations.forEach(relation => {
      // 両方のテーブルが選択されている場合のみ出力
      if (!selectedTableNames.has(relation.to)) return

      // 外部キーを持つ側が「多」側
      // table が xxx_id を持っている → table }o--|| relation.to
      lines.push(`    ${relation.to} ||--o{ ${table.name} : "${relation.column}"`)
    })
  })

  // 関連のない孤立テーブル（カラム定義出力済みのものを除く）
  filteredTables.value.forEach(table => {
    if (expandedTables.value.has(table.name)) return
    const hasRelation = table.relations.some(r => selectedTableNames.has(r.to))
    const isReferenced = filteredTables.value.some(t =>
      t.relations.some(r => r.to === table.name && selectedTableNames.has(t.name))
    )
    if (!hasRelation && !isReferenced) {
      lines.push(`    ${table.name}`)
    }
  })

  return lines.join('\n')
}

defineExpose({ resetPositions, getState, setState, exportSvg, exportPng, exportMermaid })
</script>

<template>
  <div class="erd-container">
    <div class="erd-canvas-wrapper">
      <svg
      ref="svgRef"
      class="erd-canvas"
      :viewBox="viewBox"
      :style="svgStyle"
      @mousedown="handleCanvasMouseDown"
      @mousemove="handleDragMove"
      @mouseup="handleDragEnd"
      @mouseleave="handleDragEnd"
    >
      <!-- グラデーション定義 -->
      <defs>
        <linearGradient id="header-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#667eea" />
          <stop offset="100%" style="stop-color:#764ba2" />
        </linearGradient>
        <linearGradient id="relation-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:#667eea" />
          <stop offset="100%" style="stop-color:#764ba2" />
        </linearGradient>
      </defs>

      <!-- 関連線 -->
      <g class="relations">
        <path
          v-for="line in relationLines"
          :key="line.key"
          :d="line.path"
          class="relation-line"
        />
      </g>

      <!-- テーブル（カラム展開中は前面に表示） -->
      <TableNode
        v-for="pos in sortedTablePositions"
        :key="pos.table.name"
        :table="pos.table"
        :x="pos.x"
        :y="pos.y"
        :show-columns="isTableExpanded(pos.table.name)"
        :highlighted="props.highlightedTables.has(pos.table.name)"
        :canvas-selected="canvasSelectedTables.has(pos.table.name)"
        @dragstart="handleDragStart(pos.table.name, $event)"
        @toggle-columns="toggleTableColumns(pos.table.name)"
      />

      <!-- スナップガイドライン -->
      <line
        v-for="(guide, i) in snapGuides"
        :key="`guide-${i}`"
        :x1="guide.type === 'vertical' ? guide.position : viewBoxParsed.x"
        :y1="guide.type === 'horizontal' ? guide.position : viewBoxParsed.y"
        :x2="guide.type === 'vertical' ? guide.position : viewBoxParsed.x + viewBoxParsed.w"
        :y2="guide.type === 'horizontal' ? guide.position : viewBoxParsed.y + viewBoxParsed.h"
        class="snap-guide"
      />

      <!-- 矩形選択 -->
      <rect
        v-if="selectionRect"
        :x="selectionRect.x"
        :y="selectionRect.y"
        :width="selectionRect.width"
        :height="selectionRect.height"
        class="selection-rect"
      />
    </svg>
    </div>
    <div class="zoom-controls">
      <button class="zoom-btn" :disabled="zoomLevel <= ZOOM_MIN" @click="zoomOut">−</button>
      <button class="zoom-level" :disabled="zoomLevel === 100" @click="zoomReset">{{ zoomLevel }}%</button>
      <button class="zoom-btn" :disabled="zoomLevel >= ZOOM_MAX" @click="zoomIn">+</button>
    </div>
  </div>
</template>

<style scoped>
.erd-container {
  position: relative;
  width: 100%;
  height: 100%;
}

.erd-canvas-wrapper {
  width: 100%;
  height: 100%;
  overflow: auto;
  border: 1px solid rgba(102, 126, 234, 0.2);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(12px);
  box-shadow: 0 4px 24px rgba(102, 126, 234, 0.1);
}

.zoom-controls {
  position: absolute;
  bottom: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(102, 126, 234, 0.2);
  border-radius: 10px;
  padding: 4px 8px;
  z-index: 10;
  box-shadow: 0 2px 12px rgba(102, 126, 234, 0.1);
}

.zoom-btn {
  width: 24px;
  height: 24px;
  border: 1px solid rgba(102, 126, 234, 0.3);
  background: rgba(255, 255, 255, 0.8);
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #667eea;
  font-weight: 500;
  transition: all 0.2s ease;
}

.zoom-btn:hover:not(:disabled) {
  background: rgba(102, 126, 234, 0.1);
  border-color: rgba(102, 126, 234, 0.5);
}

.zoom-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.zoom-level {
  min-width: 40px;
  text-align: center;
  font-size: 11px;
  color: #667eea;
  font-weight: 500;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.zoom-level:hover:not(:disabled) {
  background: rgba(102, 126, 234, 0.1);
}

.zoom-level:disabled {
  cursor: default;
  color: #a0aec0;
}

.erd-canvas {
  min-width: 100%;
  min-height: 600px;
  user-select: none;
}

.relation-line {
  fill: none;
  stroke: #667eea;
  stroke-width: 2;
  opacity: 0.5;
}

.snap-guide {
  stroke: rgba(234, 102, 128, 0.5);
  stroke-width: 0.5;
  stroke-dasharray: 4 3;
  pointer-events: none;
}

.selection-rect {
  fill: rgba(139, 92, 246, 0.08);
  stroke: rgba(139, 92, 246, 0.4);
  stroke-width: 1;
  stroke-dasharray: 6 3;
}
</style>
