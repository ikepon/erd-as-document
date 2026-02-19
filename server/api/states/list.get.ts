import { readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const project = query.project as string

  if (!project) {
    throw createError({
      statusCode: 400,
      message: 'project is required',
    })
  }

  const statesDir = join(process.cwd(), 'public', 'storage', project, 'states')

  if (!existsSync(statesDir)) {
    return { states: [] }
  }

  const files = await readdir(statesDir)
  const stateFiles = files
    .filter(f => f.endsWith('.json') && f !== 'index.json')
    .map(f => f.replace('.json', ''))
    .sort()

  return { states: stateFiles }
})
