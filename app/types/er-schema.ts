export type Column = {
  name: string
  type: string
}

export type Relation = {
  to: string
  column: string
}

export type Table = {
  name: string
  columns: Column[]
  relations: Relation[]
}

export type ERSchema = {
  tables: Table[]
}

export type ProjectConfig = {
  filter?: {
    exclude?: {
      tables?: string[]
      patterns?: string[]
    }
  }
}
