# YouTube 自動アップロードスクリプト

YouTube Data API v3 を使って動画を自動でアップロードする Python スクリプトです。

---

## 必要なもの

- Python 3.7 以上
- Google Cloud Console で作成した OAuth2 クライアント ID（`client_secrets.json`）

---

## セットアップ手順

### 1. Google Cloud Console での設定

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. プロジェクトを作成（または既存のものを選択）
3. **APIとサービス → ライブラリ** から「YouTube Data API v3」を有効化
4. **APIとサービス → 認証情報** で「OAuth 2.0 クライアント ID」を作成
   - アプリケーションの種類：**デスクトップアプリ**
5. `client_secrets.json` をダウンロードしてスクリプトと同じフォルダに配置

### 2. 依存パッケージのインストール

```bash
cd ~/youtube-uploader
pip install -r requirements.txt
```

### 3. ファイル構成

```
~/youtube-uploader/
├── upload.py            # メインスクリプト
├── requirements.txt     # 依存パッケージ一覧
├── client_secrets.json  # Google OAuth2 クライアントシークレット（要配置）
├── token.json           # 認証トークン（初回認証後に自動生成）
└── README.md            # このファイル
```

---

## 使い方

### 基本的なアップロード

```bash
python upload.py --file 動画ファイル.mp4 --title "動画のタイトル"
```

### 全オプション指定

```bash
python upload.py \
  --file 動画ファイル.mp4 \
  --title "動画のタイトル" \
  --description "動画の説明文をここに書きます" \
  --tags "タグ1,タグ2,タグ3" \
  --privacy public
```

### オプション一覧

| オプション      | 必須 | 説明                                              | デフォルト |
|----------------|------|---------------------------------------------------|-----------|
| `--file`       | ✅   | アップロードする動画ファイルのパス                 | —         |
| `--title`      | ✅   | 動画のタイトル                                    | —         |
| `--description`| —    | 動画の説明文                                      | （空）    |
| `--tags`       | —    | タグ（カンマ区切りで複数指定可）                   | （なし）  |
| `--privacy`    | —    | 公開設定（`public` / `private` / `unlisted`）     | `private` |

### 公開設定について

| 値         | 意味     |
|-----------|----------|
| `public`   | 公開     |
| `private`  | 非公開   |
| `unlisted` | 限定公開 |

---

## 初回認証

初回実行時はブラウザが自動で開き、Google アカウントでの認証が求められます。

```
YouTube 自動アップロードスクリプト
==================================================
ブラウザで認証を行います...
```

認証完了後、`token.json` が自動生成されます。
**2回目以降は自動的にこのトークンが使用されるため、ブラウザ認証は不要です。**

---

## 注意事項

- `client_secrets.json` と `token.json` は **絶対に公開リポジトリにアップロードしない**でください
- `.gitignore` に以下を追加することを推奨します:
  ```
  client_secrets.json
  token.json
  ```
- YouTube Data API v3 には1日あたりのクォータ制限（10,000ユニット）があります
- 動画アップロードには約1,600ユニット消費されます

---

## トラブルシューティング

### `client_secrets.json が見つかりません` エラー

→ Google Cloud Console から `client_secrets.json` をダウンロードし、スクリプトと同じフォルダに配置してください。

### `トークンの更新に失敗しました` エラー

→ `token.json` を削除して再認証してください:
```bash
rm token.json
python upload.py --file 動画.mp4 --title "タイトル"
```

### アップロードが途中で止まる

→ スクリプトは自動でリトライします（最大10回）。ネットワーク接続を確認してください。
