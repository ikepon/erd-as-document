#!/usr/bin/env npx tsx

import * as fs from "node:fs";
import * as path from "node:path";
import type { Table, Column, Relation, ERSchema } from "./types.js";

/**
 * schema.rb パーサー
 * Rails の schema.rb を解析して ER JSON を生成する
 */

/**
 * create_table を解析してテーブル名とブロック内容を抽出
 */
function parseCreateTables(content: string): Array<{ name: string; body: string }> {
  const tables: Array<{ name: string; body: string }> = [];

  // create_table "テーブル名" ... do |t| ... end のパターンを抽出
  const regex = /create_table\s+"([^"]+)"[^]*?do\s+\|t\|([\s\S]*?)^\s*end/gm;

  let match;
  while ((match = regex.exec(content)) !== null) {
    const name = match[1];
    const body = match[2];
    if (name && body) {
      tables.push({ name, body });
    }
  }

  return tables;
}

/**
 * テーブルのブロック内容からカラムを解析
 */
function parseColumns(body: string): Column[] {
  const columns: Column[] = [];

  // t.型 "カラム名" のパターンを抽出
  const regex = /t\.(\w+)\s+"([^"]+)"/g;

  let match;
  while ((match = regex.exec(body)) !== null) {
    const type = match[1];
    const name = match[2];
    if (type && name) {
      columns.push({ name, type });
    }
  }

  return columns;
}

/**
 * 単語を複数形に変換（Rails の inflector 相当の簡易版）
 */
function pluralize(word: string): string {
  // 不規則変化
  const irregulars: Record<string, string> = {
    person: "people",
    child: "children",
    man: "men",
    woman: "women",
  };

  if (irregulars[word]) {
    return irregulars[word];
  }

  // -y で終わる場合 → -ies (子音 + y の場合)
  if (word.endsWith("y") && word.length > 1) {
    const beforeY = word[word.length - 2];
    const vowels = ["a", "e", "i", "o", "u"];
    if (beforeY && !vowels.includes(beforeY)) {
      return word.slice(0, -1) + "ies";
    }
  }

  // -s, -x, -z, -ch, -sh で終わる場合 → -es
  if (
    word.endsWith("s") ||
    word.endsWith("x") ||
    word.endsWith("z") ||
    word.endsWith("ch") ||
    word.endsWith("sh")
  ) {
    return word + "es";
  }

  // その他 → -s
  return word + "s";
}

/**
 * カラムから外部キー関係を抽出
 * xxx_id カラムから xxx テーブルへの関連を推測
 */
function extractRelations(columns: Column[]): Relation[] {
  const relations: Relation[] = [];

  for (const column of columns) {
    if (column.name.endsWith("_id")) {
      // user_id → users のように変換
      const singular = column.name.slice(0, -3);
      const tableName = pluralize(singular);
      relations.push({
        to: tableName,
        column: column.name,
      });
    }
  }

  return relations;
}

/**
 * コマンドライン引数を解析
 */
function parseArgs(args: string[]): { schemaPath: string; projectName: string } | null {
  let schemaPath: string | undefined;
  let projectName: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--name" && i + 1 < args.length) {
      projectName = args[i + 1];
      i++;
    } else if (!arg?.startsWith("--")) {
      schemaPath = arg;
    }
  }

  if (!schemaPath || !projectName) {
    return null;
  }

  return { schemaPath, projectName };
}

function main(): void {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  if (!parsed) {
    console.error("Usage: npx tsx scripts/parse-schema.ts <schema.rb> --name <project-name>");
    process.exit(1);
  }

  const { schemaPath, projectName } = parsed;

  if (!fs.existsSync(schemaPath)) {
    console.error(`Error: File not found: ${schemaPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(schemaPath, "utf-8");
  const rawTables = parseCreateTables(content);

  // ERSchema を構築
  const tables: Table[] = rawTables.map((rawTable) => {
    const columns = parseColumns(rawTable.body);
    const relations = extractRelations(columns);
    return {
      name: rawTable.name,
      columns,
      relations,
    };
  });

  const schema: ERSchema = { tables };

  // public/storage/{project-name}/er.json に出力
  const storageDir = path.join("public", "storage");
  const outputDir = path.join(storageDir, projectName);
  const outputPath = path.join(outputDir, "er.json");

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2));

  // config.json を作成（存在しない場合のみ）
  const configPath = path.join(outputDir, "config.json");
  if (!fs.existsSync(configPath)) {
    const defaultConfig = {
      filter: {
        exclude: {
          tables: ["ar_internal_metadata", "schema_migrations"],
          patterns: []
        }
      }
    };
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log(`Generated: ${configPath}`);
  }

  // projects.json を更新
  const projectsPath = path.join(storageDir, "projects.json");
  let projects: string[] = [];

  if (fs.existsSync(projectsPath)) {
    const content = fs.readFileSync(projectsPath, "utf-8");
    projects = JSON.parse(content) as string[];
  }

  if (!projects.includes(projectName)) {
    projects.push(projectName);
    projects.sort();
    fs.writeFileSync(projectsPath, JSON.stringify(projects, null, 2));
  }

  console.log(`Generated: ${outputPath}`);
}

main();
