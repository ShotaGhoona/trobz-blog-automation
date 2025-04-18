（Next.js × TypeScript × TailwindCSS × OpenAI × Notion API で実装する “全自動 SEO ブログ⽣成アプリ”）

---

## 1. 目的

- **入力：** Notion の *キーワードDB* に登録されたキーワード
- **出力：** 同じワークスペース内の *ブログDB* に
    1. 各キーワードにつき **10 本**のブログタイトル＋目次を保存
    2. その後、各ブログにつき **10 見出し × 最低 3,000 文字**（≒1 記事 30,000 文字超） の本文を生成し、Notion ページにブロックとして書き込む
- 以上を **ボタン 1 クリック**で（Webhook 経由で）自動実行し、コンテンツ制作を人間の校閲だけに絞れる状態にする。

---

## 2. 技術スタック

| 区分 | 採用技術 |
| --- | --- |
| フロント／API | **Next.js 15**（App Router） + **TypeScript** |
| UI | **TailwindCSS** |
| AI | **OpenAI API**（デフォルト : gpt‑4‑turbo〈16k〉） |
| データベース | **Notion** 2 つの DB（キーワードDB・ブログDB） |
| Webhook | Notion → Next.js API Route（`/api/webhook/keyword` & `/api/webhook/blog`） |
| インフラ | Vercel（想定） / `.env` でキー・ID を管理 |

---

## 3. Notion データモデル

### 3.1 キーワードDB

| プロパティ | 型 | 用途 |
| --- | --- | --- |
| `Title` | **title** | 生成対象キーワード（例: “テスラ”） |
| `ID` | **number** | 独自連番（自前で採番） |
| `生成ボタン` | **button** | 見出し生成をトリガー（Webhook POST） |
| `ブログ` | **relation** → ブログDB | 生成済みブログとの関連 |

### 3.2 ブログDB

| プロパティ | 型 | 用途 |
| --- | --- | --- |
| `Title` | **title** | ブログタイトル |
| `H1`〜`H10` | **rich_text** | 10 個の目次見出し |
| `本文生成ボタン` | **button** | 本文生成をトリガー（Webhook POST） |
| `ID` | **number** | 独自連番 |
| `キーワード` | **relation** → キーワードDB | 元キーワード |
| (任意) `Status` | **select** | `draft / generated / error` など |

> 順序：上表通り。Notion API はプロパティ順を保持しないが、UI の可読性確保のためページ側で並べ替え設定。
> 

---

## 4. 処理フロー

### 4.1 見出し生成フロー

1. **ユーザー操作**
    
    キーワードDB のレコードで `生成ボタン` をクリック
    
2. **Webhook (`/api/webhook/keyword`) 受信**
    
    ```json
    { "recordId": "<ページ内部ID>", "customId": <number> }
    ```
    
3. **キーワード取得** – Notion Databases Query (filter by `ID`)
4. **OpenAI 呼び出し**
    - プロンプト：指定フォーマットで「ブログタイトル＋目次 ×10」を出力
    - Model: gpt‑4‑turbo
5. **ブログDB に 10 レコード挿入**
    - `Title`、`H1`〜`H10`、`キーワード` relation、`ID`（独自採番）
6. **レスポンス**：`200 OK`

### 4.2 本文生成フロー

1. **ユーザー操作**
    
    ブログDB のレコードで `本文生成ボタン` をクリック
    
2. **Webhook (`/api/webhook/blog`) 受信**
    
    ```json
    { "recordId": "<ページ内部ID>", "customId": <number> }
    ```
    
3. **ブログ情報取得** – Notion Query (`ID` でフィルタ)
4. **10 見出しをループ**
    1. 各見出しごとに OpenAI へプロンプト送信
        - 目標文字数：**3,000 文字以上 / セクション**
        - PREP 法、H2〜H4 見出し整形ルール遵守
    2. 応答を **20 ブロック単位**で分割し、
        
        `PATCH https://api.notion.com/v1/blocks/{pageId}/children`
        
        に `children` 配列で追加
        
        - 共通ヘッダーは `NotionClient` コンポーネントで再利用
5. **Status 更新**（任意）：`generated`
6. **レスポンス**：`200 OK`

> トラフィック制御：各 OpenAI 呼び出し後 await で 1 秒 sleep。Vercel Edge でも RFC‑conform。
> 

---

## 5. API インタフェース設計

| Route | Method | 役割 | 受信ボディ | 返却 |
| --- | --- | --- | --- | --- |
| `/api/webhook/keyword` | POST | 見出し生成 | `{ recordId, customId }` | `200 / 4xx` |
| `/api/webhook/blog` | POST | 本文生成 | `{ recordId, customId }` | `200 / 4xx` |

共通処理は **`libs/notionClient.ts`** と **`libs/openaiClient.ts`** にカプセル化。

- `notionRequest(method, url, body?)`
- `openaiChat(prompt, model?)`

---

## 6. ディレクトリ構成（例）

```
/src
 ├─ app/
 │   └─ api/
 │       ├─ webhook/
 │       │   ├─ keyword/route.ts
 │       │   └─ blog/route.ts
 ├─ libs/
 │   ├─ notionClient.ts
 │   ├─ openaiClient.ts
 │   └─ utils/
 │       └─ chunkBlocks.ts
 ├─ types/
 │   └─ notion.d.ts
 ├─ components/
 │   └─ (UI が必要になった場合)
 └─ styles/
     └─ globals.css
.env
```

---

## 7. 非機能要件

| 項目 | 要件 |
| --- | --- |
| パフォーマンス | 1 見出し生成 ≤ 6 s、1 セクション生成 ≤ 30 s |
| スケーラビリティ | OpenAI の Rate Limit（~10 RPS）を超えない設計 |
| コスト | gpt‑4‑turbo 16k で見出し 1 req ≒数円、本文 1 req ≒30円 想定 |
| 障害復旧 | 5xx 返却時は Notion `Status = error` へ更新 & 再実行可 |
| セキュリティ | API Key, Notion Token は Vercel 環境変数に保存 |

---

## 8. 今後の拡張余地

- **Cron 連携**：定期的にキーワードDB を走査し、自動生成バッチを実行
- **課金管理**：生成トークン量を計測し、運用コストを可視化
- **多言語対応**：`lang` プロパティを追加し、OpenAI プロンプトを切替

---