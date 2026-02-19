import { watch } from 'chokidar'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

type Column = {
  name: string
  type: string
}

type Relation = {
  to: string
  column: string
}

type Table = {
  name: string
  columns: Column[]
  relations: Relation[]
}

type ERSchema = {
  tables: Table[]
}

type ProjectEntry = {
  name: string
  schemaPath: string
  filter?: {
    exclude?: {
      tables?: string[]
      patterns?: string[]
    }
  }
}

type StorageConfig = {
  projects: ProjectEntry[]
}

// parse-schema.ts から移植したパーサー関数
function parseCreateTables(content: string): Array<{ name: string; body: string }> {
  const tables: Array<{ name: string; body: string }> = []
  const regex = /create_table\s+"([^"]+)"[^]*?do\s+\|t\|([\s\S]*?)^\s*end/gm

  let match
  while ((match = regex.exec(content)) !== null) {
    const name = match[1]
    const body = match[2]
    if (name && body) {
      tables.push({ name, body })
    }
  }

  return tables
}

function parseColumns(body: string): Column[] {
  const columns: Column[] = []
  const regex = /t\.(\w+)\s+"([^"]+)"/g

  let match
  while ((match = regex.exec(body)) !== null) {
    const type = match[1]
    const name = match[2]
    if (type && name) {
      columns.push({ name, type })
    }
  }

  return columns
}

function pluralize(word: string): string {
  const irregulars: Record<string, string> = {
    person: 'people',
    child: 'children',
    man: 'men',
    woman: 'women',
  }

  if (irregulars[word]) {
    return irregulars[word]
  }

  if (word.endsWith('y') && word.length > 1) {
    const beforeY = word[word.length - 2]
    const vowels = ['a', 'e', 'i', 'o', 'u']
    if (beforeY && !vowels.includes(beforeY)) {
      return word.slice(0, -1) + 'ies'
    }
  }

  if (
    word.endsWith('s') ||
    word.endsWith('x') ||
    word.endsWith('z') ||
    word.endsWith('ch') ||
    word.endsWith('sh')
  ) {
    return word + 'es'
  }

  return word + 's'
}

function extractRelations(columns: Column[]): Relation[] {
  const relations: Relation[] = []

  for (const column of columns) {
    if (column.name.endsWith('_id')) {
      const singular = column.name.slice(0, -3)
      const tableName = pluralize(singular)
      relations.push({
        to: tableName,
        column: column.name,
      })
    }
  }

  return relations
}

function parseSchemaFile(schemaPath: string): ERSchema {
  const content = readFileSync(schemaPath, 'utf-8')
  const rawTables = parseCreateTables(content)

  const tables: Table[] = rawTables.map((rawTable) => {
    const columns = parseColumns(rawTable.body)
    const relations = extractRelations(columns)
    return {
      name: rawTable.name,
      columns,
      relations,
    }
  })

  return { tables }
}

function updateProjectsList(storageDir: string, newProjectNames: string[]): void {
  const projectsPath = join(storageDir, 'projects.json')

  // 既存のディレクトリをスキャンして er.json があるものを収集
  const existingProjects: string[] = []
  try {
    const dirs = readdirSync(storageDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)

    for (const dir of dirs) {
      const erJsonPath = join(storageDir, dir, 'er.json')
      if (existsSync(erJsonPath)) {
        existingProjects.push(dir)
      }
    }
  } catch {
    // ディレクトリ読み込みに失敗した場合は無視
  }

  // 既存と新規をマージして重複を除去
  const merged = [...new Set([...existingProjects, ...newProjectNames])]
  const sorted = merged.sort()

  writeFileSync(projectsPath, JSON.stringify(sorted, null, 2))
  console.log(`[schema-watcher] Updated projects.json`)
}

function ensureProjectDir(storageDir: string, projectName: string): void {
  const projectDir = join(storageDir, projectName)
  if (!existsSync(projectDir)) {
    mkdirSync(projectDir, { recursive: true })
    console.log(`[schema-watcher] Created directory: ${projectDir}`)
  }
}

function regenerateErJson(projectName: string, schemaPath: string, storageDir: string): void {
  try {
    if (!existsSync(schemaPath)) {
      console.log(`[schema-watcher] Schema file not found: ${schemaPath}`)
      return
    }

    const schema = parseSchemaFile(schemaPath)
    const outputPath = join(storageDir, projectName, 'er.json')
    writeFileSync(outputPath, JSON.stringify(schema, null, 2))
    console.log(`[schema-watcher] Generated: ${outputPath}`)
  } catch (error) {
    console.error(`[schema-watcher] Error generating ${projectName}:`, error)
  }
}

export default defineNitroPlugin(() => {
  // 開発環境のみで動作
  if (process.env.NODE_ENV === 'production') {
    return
  }

  const storageDir = join(process.cwd(), 'public', 'storage')
  const configPath = join(storageDir, 'config.json')

  // config.json が存在しない場合はスキップ
  if (!existsSync(configPath)) {
    console.log('[schema-watcher] No config.json found in public/storage/, skipping watch setup')
    return
  }

  // config.json を読み込む
  let config: StorageConfig
  try {
    config = JSON.parse(readFileSync(configPath, 'utf-8'))
  } catch (error) {
    console.error('[schema-watcher] Failed to parse config.json:', error)
    return
  }

  if (!config.projects || config.projects.length === 0) {
    console.log('[schema-watcher] No projects defined in config.json')
    return
  }

  // 監視対象を収集
  const watchTargets: Map<string, string> = new Map() // schemaPath -> projectName
  const projectNames: string[] = []

  for (const project of config.projects) {
    if (!project.name || !project.schemaPath) {
      console.log(`[schema-watcher] Skipping invalid project entry: ${JSON.stringify(project)}`)
      continue
    }

    if (!existsSync(project.schemaPath)) {
      console.log(`[schema-watcher] Schema file not found: ${project.schemaPath}`)
      continue
    }

    projectNames.push(project.name)

    // プロジェクトディレクトリを作成
    ensureProjectDir(storageDir, project.name)

    // er.json を生成
    const erJsonPath = join(storageDir, project.name, 'er.json')
    if (!existsSync(erJsonPath)) {
      console.log(`[schema-watcher] Initial generation for: ${project.name}`)
      regenerateErJson(project.name, project.schemaPath, storageDir)
    }

    watchTargets.set(project.schemaPath, project.name)
    console.log(`[schema-watcher] Watching: ${project.schemaPath} -> ${project.name}`)
  }

  if (projectNames.length === 0) {
    console.log('[schema-watcher] No valid projects to watch')
    return
  }

  // projects.json を更新
  updateProjectsList(storageDir, projectNames)

  // chokidar で監視開始
  const watcher = watch(Array.from(watchTargets.keys()), {
    persistent: true,
    ignoreInitial: true,
  })

  watcher.on('change', (filePath) => {
    const projectName = watchTargets.get(filePath)
    if (projectName) {
      console.log(`[schema-watcher] Detected change: ${filePath}`)
      regenerateErJson(projectName, filePath, storageDir)
    }
  })

  console.log(`[schema-watcher] Started watching ${watchTargets.size} schema file(s)`)
})
