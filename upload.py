#!/usr/bin/env python3
"""YouTube 自動アップロードスクリプト"""

import argparse
import os
import sys
import json
import time

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

# YouTube Data API v3 のスコープ
SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]

# 認証情報ファイルのパス
CLIENT_SECRETS_FILE = os.path.join(os.path.dirname(__file__), "client_secrets.json")
TOKEN_FILE = os.path.join(os.path.dirname(__file__), "token.json")

# アップロードのリトライ設定
MAX_RETRIES = 10
RETRIABLE_STATUS_CODES = [500, 502, 503, 504]


def authenticate():
    """OAuth2認証を行い、YouTubeサービスを返す。
    初回はブラウザ認証、2回目以降はtoken.jsonを自動読込。
    """
    creds = None

    # 既存のトークンがあれば読み込む
    if os.path.exists(TOKEN_FILE):
        try:
            creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
            print("既存の認証情報を読み込みました。")
        except Exception as e:
            print(f"トークンの読み込みに失敗しました: {e}")
            creds = None

    # トークンが無効または期限切れの場合は更新・再認証
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                print("アクセストークンを更新しています...")
                creds.refresh(Request())
                print("アクセストークンを更新しました。")
            except Exception as e:
                print(f"トークンの更新に失敗しました: {e}")
                creds = None

        if not creds:
            if not os.path.exists(CLIENT_SECRETS_FILE):
                print(f"エラー: クライアントシークレットファイルが見つかりません: {CLIENT_SECRETS_FILE}")
                print("Google Cloud Console から client_secrets.json をダウンロードし、")
                print(f"スクリプトと同じディレクトリに配置してください: {os.path.dirname(CLIENT_SECRETS_FILE)}")
                sys.exit(1)

            print("ブラウザで認証を行います...")
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRETS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
            print("認証が完了しました。")

        # トークンを保存
        with open(TOKEN_FILE, "w") as token:
            token.write(creds.to_json())
        print(f"認証情報を保存しました: {TOKEN_FILE}")

    return build("youtube", "v3", credentials=creds)


def upload_video(youtube, args):
    """動画をYouTubeにアップロードする。"""
    if not os.path.exists(args.file):
        print(f"エラー: 動画ファイルが見つかりません: {args.file}")
        sys.exit(1)

    # タグの処理（カンマ区切りをリストに変換）
    tags = None
    if args.tags:
        tags = [tag.strip() for tag in args.tags.split(",")]

    body = {
        "snippet": {
            "title": args.title,
            "description": args.description or "",
            "tags": tags or [],
            "categoryId": "22",  # デフォルト: People & Blogs
        },
        "status": {
            "privacyStatus": args.privacy,
        },
    }

    print(f"アップロード準備中: {args.file}")
    print(f"  タイトル    : {args.title}")
    print(f"  説明        : {args.description or '（なし）'}")
    print(f"  タグ        : {', '.join(tags) if tags else '（なし）'}")
    print(f"  公開設定    : {args.privacy}")
    print()

    media = MediaFileUpload(
        args.file,
        chunksize=1024 * 1024,  # 1MB チャンク
        resumable=True,
    )

    request = youtube.videos().insert(
        part=",".join(body.keys()),
        body=body,
        media_body=media,
    )

    response = None
    error = None
    retry = 0

    print("アップロードを開始します...")
    while response is None:
        try:
            status, response = request.next_chunk()
            if status:
                progress = int(status.progress() * 100)
                print(f"\r進捗: {progress}%", end="", flush=True)
        except HttpError as e:
            if e.resp.status in RETRIABLE_STATUS_CODES:
                error = f"HTTPエラー {e.resp.status}: {e.content}"
            else:
                print(f"\nエラー: アップロード中にHTTPエラーが発生しました: {e.resp.status}")
                print(f"詳細: {e.content.decode('utf-8', errors='replace')}")
                sys.exit(1)
        except Exception as e:
            error = f"予期しないエラー: {e}"

        if error:
            retry += 1
            if retry > MAX_RETRIES:
                print(f"\nエラー: 最大リトライ回数 ({MAX_RETRIES}) を超えました。")
                print(f"最後のエラー: {error}")
                sys.exit(1)
            wait_time = 2 ** retry
            print(f"\n{error}")
            print(f"{wait_time}秒後にリトライします... ({retry}/{MAX_RETRIES})")
            time.sleep(wait_time)
            error = None

    print("\n")
    video_id = response.get("id")
    print("=" * 50)
    print("アップロードが完了しました！")
    print(f"  動画ID  : {video_id}")
    print(f"  URL     : https://www.youtube.com/watch?v={video_id}")
    print("=" * 50)
    return video_id


def parse_args():
    """コマンドライン引数を解析する。"""
    parser = argparse.ArgumentParser(
        description="YouTube 自動アップロードスクリプト",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用例:
  python upload.py --file video.mp4 --title "動画タイトル"
  python upload.py --file video.mp4 --title "タイトル" --description "説明文" --tags "タグ1,タグ2" --privacy public
        """,
    )
    parser.add_argument(
        "--file",
        required=True,
        help="アップロードする動画ファイルのパス",
    )
    parser.add_argument(
        "--title",
        required=True,
        help="動画のタイトル",
    )
    parser.add_argument(
        "--description",
        default="",
        help="動画の説明文（省略可）",
    )
    parser.add_argument(
        "--tags",
        default="",
        help="タグ（カンマ区切りで複数指定可、例: タグ1,タグ2,タグ3）",
    )
    parser.add_argument(
        "--privacy",
        default="private",
        choices=["public", "private", "unlisted"],
        help="公開設定: public（公開）/ private（非公開）/ unlisted（限定公開）（デフォルト: private）",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    print("=" * 50)
    print("YouTube 自動アップロードスクリプト")
    print("=" * 50)
    print()

    try:
        youtube = authenticate()
        upload_video(youtube, args)
    except KeyboardInterrupt:
        print("\nアップロードがキャンセルされました。")
        sys.exit(0)
    except Exception as e:
        print(f"\n予期しないエラーが発生しました: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
