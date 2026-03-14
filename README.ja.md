# erd-as-document

[English README](README.md)

`erd-as-document` は、Rails アプリケーションの `schema.rb` を入力として DB 構造を可視化し、**ERD を「眺める図」から「考える道具」へ**と変えるための OSS ツールです。

- 大規模 DB 構造の理解コストを下げる
- 必要なテーブル・関係だけを抜き出して文脈ごとに整理する
- 配置や視点を調整しながら Rails アプリの設計を読み解く補助線になる

---

## コンセプト

- ERD は「成果物」ではなく「思考の途中経過」
- ERD は自動生成されるものではなく、**取捨選択・配置されるもの**
- DB の全体像ではなく、**理解したい文脈ごとの構造**を表現する

---

## 想定ユースケース

- 既存 Rails アプリの DB 構造を理解したい
- `schema.rb` から ER 図を生成したい
- 画面・機能単位で関係するテーブルだけを見たい
- テーブル数が多く、通常の ERD では把握できない
- 「なぜこの構造なのか」を考えるための補助がほしい

---

## このツールがやらないこと

- DB を持たない
- ERD を自動レイアウトだけで完結させない
- 利用者のデータを Git 管理しない

---

## 全体構成

    erd-as-document/
    ├── app/                        # Nuxt ソースディレクトリ
    │   ├── app.vue
    │   ├── components/
    │   │   ├── ErdCanvas.vue       # ERD 描画
    │   │   ├── TableNode.vue       # テーブル描画
    │   │   └── TableSelector.vue   # テーブル選択 UI
    │   └── types/
    │       └── er-schema.ts        # 型定義
    ├── scripts/
    │   ├── parse-schema.ts         # schema.rb → ER JSON
    │   └── types.ts                # 型定義
    ├── server/
    │   ├── api/states/             # 状態保存・取得 API
    │   │   ├── list.get.ts
    │   │   └── save.post.ts
    │   └── plugins/
    │       └── schema-watcher.ts   # schema.rb 変更時の自動再生成
    ├── public/
    │   └── storage/
    │       └── config.json.example # 設定テンプレート
    ├── nuxt.config.ts
    ├── tsconfig.json
    ├── package.json
    ├── .gitignore
    ├── CLAUDE.md
    ├── README.md
    └── README.ja.md

---

## 利用フロー

### 1. セットアップと起動

```bash
# 1. 設定ファイルを作成
cp public/storage/config.json.example public/storage/config.json
```

`public/storage/config.json` を編集して `schemaPath` を設定（絶対パス、またはプロジェクトルートからの相対パスで指定）:

```json
{
  "projects": [
    {
      "name": "my-project",
      "schemaPath": "/path/to/rails-app/db/schema.rb"
    }
  ]
}
```

```bash
# 2. Web アプリを起動（ER JSON が自動生成されます）
npm run dev
# → http://localhost:3000 でアクセス
```

起動時に ER JSON が自動生成され、以降は `schema.rb` の変更を検知して自動再生成されます。

> **手動で生成する場合:**
> ```bash
> npx tsx scripts/parse-schema.ts path/to/schema.rb --name my-project
> ```

---

### 2. ER JSON を読み込む

Web アプリ上で、プロジェクトを選択して ER JSON を読み込みます。

---

### 3. 表示するテーブル・関係を選択する

UI 上で以下を操作できます。

- 表示するテーブル（チェックボックス）
- 関連を表示（ON / OFF）
- テーブルのハイライト（★ボタンでオレンジ色に強調）
- 「選択中のみ」ボタンで選択済みテーブルだけを表示

**テーブル検索機能**により、大量のテーブルから目的のものを素早く見つけられます。
部分列マッチで曖昧検索が可能です（例: `usrord` → `user_orders`）。

ウィンドウ左端のボタンで選択パネルを非表示にし、ERD 表示エリアを広く使うこともできます。

チェックボックス操作により、
**理解したい文脈だけを切り出した ERD** を作成できます。

---

### 4. 配置を手動で調整する

表示されたテーブルは、
ドラッグ & ドロップで自由に配置できます。

- 自動配置に依存しません
- 配置も「理解・意図」の一部として扱います
- ズーム機能で全体像と詳細を切り替え可能
- テーブルごとにカラム表示の ON/OFF を切り替え可能

---

### 5. ER図を保存する

調整した ERD の状態（選択テーブル、ハイライト、配置、ズームレベル等）を保存できます。

- **保存**: 名前を入力して新規保存
- **上書き保存**: 選択中の ER図 を上書き

保存した ER図 は UI 上のドロップダウンから選択して切り替えられます。

**ユースケース例:**
- `overview` - 全体像を俯瞰する配置
- `user-management` - ユーザー管理機能に関連するテーブルだけを表示
- `order-flow` - 注文フローに関連するテーブルの配置

**プロジェクト間での states 共有:**
同じ `schema.rb` を参照するプロジェクト間で state ファイルを共有できます。state ファイル（例: `states/overview.json`）を別のプロジェクトの `states/` ディレクトリにコピーするだけで利用できます。

---

### 6. プロジェクトとステートのお気に入り機能

プロジェクトと ER図 の状態をお気に入りに設定して、作業をスムーズに進められます。

**機能:**
- **起動時の自動選択**: お気に入りに設定したプロジェクトとステートがアプリ起動時に自動的に読み込まれます
- **クイックアクセス**: プロジェクト/ステートの選択欄横にある ★/☆ ボタンをクリックしてお気に入りを切り替え
- **視覚的フィードバック**: お気に入りの設定・解除時にトースト通知で確認できます
- **1つずつ設定**: プロジェクトとステート（プロジェクトごと）はそれぞれ1つだけお気に入りに設定できます

**使い方:**
1. ドロップダウンからプロジェクトを選択
2. 選択欄横の ☆ ボタンをクリックしてお気に入りに設定（★ に変わります）
3. 次回アプリを開いたときに、このプロジェクトが自動選択されます
4. 保存した ER図 の状態も同様に設定できます

お気に入りはブラウザの localStorage に保存されるため、セッションをまたいで保持されます。

---

### 7. 表示テーブルをフィルタリングする

`public/storage/config.json` の `filter` で特定のテーブルを非表示にできます。

```json
// public/storage/config.json
{
  "projects": [
    {
      "name": "my-project",
      "schemaPath": "/path/to/schema.rb",
      "filter": {
        "exclude": {
          "tables": ["ar_internal_metadata", "schema_migrations"],
          "patterns": ["^tmp_", "^backup_"]
        }
      }
    }
  ]
}
```

- **tables**: 除外するテーブル名の配列
- **patterns**: 除外する正規表現パターンの配列

設定変更後はブラウザをリロードしてください。

---

### 8. 非標準的な外部キーの関連設定

Rails の命名規則と異なる外部キーカラム（例: `send_user_id` → `users`）がある場合、`config.json` の `relationships` で明示的に指定できます。

```json
// public/storage/config.json
{
  "projects": [
    {
      "name": "my-project",
      "schemaPath": "/path/to/schema.rb",
      "relationships": {
        "messages": {
          "send_user_id": "users",
          "receiver_user_id": "users"
        },
        "payments": {
          "payer_company_id": "companies",
          "payee_company_id": "companies"
        }
      }
    }
  ]
}
```

**動作の優先順位:**
1. `relationships` に定義があればそれを使用（最優先）
2. 設定がない場合は自動推測（`user_id` → `users` など）

設定変更後は `npm run dev` を再起動してください。

---

### 9. ER JSON の自動再生成について

`npm run dev` 起動中、`schema.rb` の変更を検知すると自動で `er.json` が再生成されます。

- 開発環境でのみ動作します
- 再生成後はブラウザのリロードが必要です
- 複数プロジェクトも `config.json` の `projects` 配列に追加するだけで対応できます

---

## public/storage ディレクトリについて

`public/storage/` はローカル作業用の一時領域です。

    public/storage/
    ├── config.json          # プロジェクト設定（ユーザーが作成）
    ├── config.json.example  # テンプレートファイル
    ├── projects.json        # プロジェクト一覧（自動生成）
    ├── my-project/
    │   ├── er.json          # ER JSON（自動生成）
    │   └── states/          # 複数の保存状態
    │       ├── index.json   # 状態一覧（自動生成）
    │       ├── overview.json
    │       └── user-flow.json
    ├── another-app/
    │   └── er.json
    └── ...

プロジェクトごとにディレクトリが作成され、
生成された ER JSON と保存した状態ファイルを保持します。
`projects.json` にはプロジェクト一覧が自動で追記されます。

**これらはすべて中間生成物**であり、Git 管理対象ではありません。

そのため、`public/storage/` は `.gitignore` に含まれます。

---

## 開発環境のセットアップ

### 必要な環境

- Node.js v25.4.0 以上（`.node-version` で指定）

### インストール

```bash
npm install
```

### 起動方法

```bash
# 1. テンプレートをコピーして編集
cp public/storage/config.json.example public/storage/config.json
# config.json を編集して schemaPath を設定

# 2. Web アプリを起動（ER JSON は自動生成されます）
npm run dev
# → http://localhost:3000 でアクセス
```

**代替: 手動生成**
```bash
npm run parse-schema -- path/to/schema.rb --name my-project
```

---

## 技術スタック

### スクリプト

- TypeScript
- schema.rb 解析（テキストパース）
- 実行: `npx tsx`

### Frontend

- Nuxt 4
- Vue 3
- SVG ベース描画
- Drag & Drop UI

---

## ライセンス

MIT License
