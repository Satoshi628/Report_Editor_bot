# 週報アシスタント

社内の週報データを活用し、AI（Azure OpenAI）による**文書作成・修正**および**文書作成の教育**を行うWebアプリケーションです。

## 機能

| 機能 | 説明 |
|------|------|
| **文書作成・修正** | 書きたい内容・背景から週報を生成、または完成済み週報の改善提案 |
| **教育** | 過去の指摘コメントを参考に、書き方のフィードバック・アドバイス |
| **リッチテキストエディタ** | Quill.js ベースのCanvas機能で週報を編集 |
| **関連週報検索** | エディタ入力に連動し、TF-IDFで類似する過去の週報を自動検索 |
| **AIチャット** | LangChain + Azure OpenAI による対話型アシスタント |

## UI構成

3カラムレイアウト:

- **左パネル**: 過去の週報一覧（関連・一覧・下書きタブ切替）
- **中央パネル**: Quill リッチテキストエディタ
- **右パネル**: AIチャット

## 技術スタック

- **フロントエンド**: HTML / CSS / JavaScript, [Quill.js](https://quilljs.com/)
- **バックエンド**: Python, [Flask](https://flask.palletsprojects.com/)
- **AI**: [LangChain](https://python.langchain.com/) + Azure OpenAI API (gpt-5mini)
- **検索**: scikit-learn (TF-IDF)
- **文書処理**: python-docx（.docx読み込み）

## セットアップ

### 1. 仮想環境の作成・依存パッケージのインストール

```bash
cd report_webapp
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
```

### 2. 環境変数の設定

`.env.example` をコピーして `.env` を作成し、Azure OpenAI の接続情報を設定してください。

```bash
copy .env.example .env   # Windows
cp .env.example .env     # macOS/Linux
```

`.env` の設定項目:

```env
AZURE_OPENAI_API_KEY=your-api-key-here
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_VERSION=2024-12-01-preview
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-5mini
```

### 3. 週報データの配置

| ディレクトリ | ファイル形式 | 用途 |
|---|---|---|
| `data/completed/` | `.txt` | 完成済み週報（文体学習・関連検索用） |
| `data/drafts/` | `.docx` | 未完成週報（指摘コメント付き、教育用） |

> **未完成週報(.docx)のページ構成**: 最後のページが初版、最初のページが最終原稿。各ページの指摘コメントは次のページの修正に反映されています。

サンプルデータを生成する場合:

```bash
python create_sample_data.py
```

### 4. サーバーの起動

```bash
python app.py
```

ブラウザで http://localhost:5000 にアクセスしてください。

## プロジェクト構造

```
report_webapp/
├── app.py                  # Flask メインアプリ
├── config.py               # 設定管理
├── requirements.txt        # 依存パッケージ
├── .env.example            # 環境変数テンプレート
├── create_sample_data.py   # サンプルデータ生成
├── data/
│   ├── completed/          # 完成済み週報 (.txt)
│   └── drafts/             # 未完成週報 (.docx)
├── services/
│   ├── report_manager.py   # 週報データ管理
│   ├── llm_service.py      # LangChain + Azure OpenAI
│   └── search_service.py   # TF-IDF 関連検索
├── static/
│   ├── css/style.css       # スタイルシート
│   └── js/
│       ├── app.js          # メインロジック
│       ├── editor.js       # Quillエディタ
│       └── chat.js         # チャット機能
└── templates/
    └── index.html          # メインページ
```

## API エンドポイント

| エンドポイント | メソッド | 説明 |
|---|---|---|
| `/` | GET | メインページ |
| `/api/reports/completed` | GET | 完成済み週報の一覧 |
| `/api/reports/completed/<id>` | GET | 完成済み週報の内容 |
| `/api/reports/drafts` | GET | 未完成週報の一覧 |
| `/api/reports/drafts/<id>` | GET | 未完成週報の内容（ページ単位） |
| `/api/search` | POST | 関連週報の検索 |
| `/api/chat` | POST | AIチャット |
| `/api/chat/clear` | POST | チャット履歴クリア |


## プロンプト自動生成

プロンプトは `prompts/` ディレクトリに保存されます。

| ファイル | 用途 |
|---|---|
| `system_prompt_compose.txt` | 文書作成・修正用プロンプト |
| `system_prompt_education.txt` | 教育用プロンプト |

プロンプトを再生成する場合:

```bash
python generate_prompts.py --mode both --input-prompt generate_prompt.json --output-dir prompts
```
