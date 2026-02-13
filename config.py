"""アプリケーション設定管理モジュール。"""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# ベースディレクトリ
BASE_DIR = Path(__file__).resolve().parent

# データディレクトリ
DATA_DIR = BASE_DIR / "data"
COMPLETED_DIR = DATA_DIR / "completed"
DRAFTS_DIR = DATA_DIR / "drafts"

# Azure OpenAI 設定
AZURE_OPENAI_API_KEY = os.getenv("AZURE_OPENAI_API_KEY", "")
AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT", "")
AZURE_OPENAI_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview")
AZURE_OPENAI_DEPLOYMENT_NAME = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-5mini")

# Flask 設定
FLASK_HOST = os.getenv("FLASK_HOST", "0.0.0.0")
FLASK_PORT = int(os.getenv("FLASK_PORT", "5000"))
FLASK_DEBUG = os.getenv("FLASK_DEBUG", "true").lower() == "true"
