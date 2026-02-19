import { writeFile, mkdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

type SaveRequest = {
  project: string
  name: string
  data: object
}

export default defineEventHandler(async (event) => {
  const body = await readBody<SaveRequest>(event)

  if (!body.project || !body.name || !body.data) {
    throw createError({
      statusCode: 400,
      message: 'project, name, data are required',
    })
  }

  // ファイル名のサニタイズ（安全でない文字を除去）
  const safeName = body.name.replace(/[^a-zA-Z0-9_-]/g, '_')
  if (!safeName) {
    throw createError({
      statusCode: 400,
      message: 'Invalid file name',
    })
  }

  const statesDir = join(process.cwd(), 'public', 'storage', body.project, 'states')
  const filePath = join(statesDir, `${safeName}.json`)

  // ディレクトリがなければ作成
  if (!existsSync(statesDir)) {
    await mkdir(statesDir, { recursive: true })
  }

  // 状態ファイルを保存
  await writeFile(filePath, JSON.stringify(body.data, null, 2), 'utf-8')

  // index.json を更新
  await updateIndexJson(statesDir)

  return { success: true, name: safeName }
})

async function updateIndexJson(statesDir: string) {
  const indexPath = join(statesDir, 'index.json')
  const { readdir } = await import('fs/promises')

  const files = await readdir(statesDir)
  const stateFiles = files
    .filter(f => f.endsWith('.json') && f !== 'index.json')
    .map(f => f.replace('.json', ''))
    .sort()

  await writeFile(indexPath, JSON.stringify({ states: stateFiles }, null, 2), 'utf-8')
}
