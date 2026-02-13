"""プロンプト生成ツール（VLM活用版）。

data/ 配下の週報データの一部をVLMに読み取らせ、
文書作成・修正用と教育用のシステムプロンプトを自動生成する。

Usage:
    python generate_prompts.py [--mode compose|education|both]
"""

import argparse
import json
import sys
from pathlib import Path

from langchain_openai import AzureChatOpenAI
from langchain.schema import HumanMessage, SystemMessage

# プロジェクトルートをパスに追加
sys.path.insert(0, str(Path(__file__).resolve().parent))

import config
from services import report_manager

def load_prompt_from_file(file_path: str, mode: str) -> str:
    """プロンプトをjsonファイルから読み込む。

    Args:
        file_path: プロンプトファイルのパス。
        mode: プロンプトのモード（compose または education）。

    Returns:
        プロンプト本文。
    """
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        return data[mode]

def _get_llm() -> AzureChatOpenAI:
    """VLMインスタンスを取得する。

    Returns:
        AzureChatOpenAI: LLMインスタンス。
    """
    return AzureChatOpenAI(
        azure_deployment=config.AZURE_OPENAI_DEPLOYMENT_NAME,
        azure_endpoint=config.AZURE_OPENAI_ENDPOINT,
        api_key=config.AZURE_OPENAI_API_KEY,
        api_version=config.AZURE_OPENAI_API_VERSION,
        temperature=1.0,
    )


def load_completed_reports() -> list[dict]:
    """完成済み週報を全件読み込む。

    Returns:
        list[dict]: 各要素は id, title, content を含む辞書。
    """
    reports = report_manager.get_completed_reports()
    result = []
    for r in reports:
        content_data = report_manager.get_completed_report_content(r["id"])
        if content_data:
            result.append(content_data)
    return result


def load_draft_reports() -> list[dict]:
    """未完成週報を全件読み込む。

    Returns:
        list[dict]: 各要素は id, filename, pages を含む辞書。
    """
    drafts = report_manager.get_draft_reports()
    result = []
    for d in drafts:
        content_data = report_manager.get_draft_report_content(d["id"])
        if content_data:
            result.append(content_data)
    return result


def _build_report_samples(reports: list[dict], max_count: int = 3) -> str:
    """週報データをVLMに提示するテキストに変換する。

    Args:
        reports: 完成済み週報のリスト。
        max_count: 提示する最大件数。

    Returns:
        str: 整形されたサンプルテキスト。
    """
    samples = []
    for report in reports[:max_count]:
        samples.append(
            f"### {report['title']}\n```\n{report['content']}\n```"
        )
    return "\n\n".join(samples)


def _build_draft_evolution(drafts: list[dict]) -> str:
    """未完成週報の初版→最終版テキストを構築する。

    Args:
        drafts: 未完成週報のリスト。

    Returns:
        str: 初版と最終版の対比テキスト。
    """
    parts = []
    for draft in drafts:
        pages = draft.get("pages", [])
        first_draft = next(
            (p for p in pages if p.get("is_first_draft")), None
        )
        final_draft = next(
            (p for p in pages if p.get("is_final")), None
        )
        if first_draft and final_draft:
            parts.append(
                f"### {draft['filename']}\n"
                f"#### 初版\n```\n{first_draft['content']}\n```\n\n"
                f"#### 最終版（指摘反映後）\n```\n{final_draft['content']}\n```"
            )
    return "\n\n".join(parts)


def generate_compose_prompt(
    reports: list[dict],
    completed_prompt: str,
    llm: AzureChatOpenAI,
) -> str:
    """VLMを用いて文書作成・修正用プロンプトを生成する。

    Args:
        reports: 完成済み週報のリスト。
        llm: LLMインスタンス。

    Returns:
        str: 生成されたシステムプロンプト。
    """
    samples_text = _build_report_samples(reports)

    user_message = (
        f"## 完成済み週報サンプル\n\n{samples_text}"
    )

    messages = [
        SystemMessage(content=completed_prompt),
        HumanMessage(content=user_message),
    ]

    print("  VLMに文書作成・修正用プロンプトの生成を依頼中...")
    response = llm.invoke(messages)
    return response.content


def generate_education_prompt(
    reports: list[dict],
    drafts: list[dict],
    education_prompt: str,
    llm: AzureChatOpenAI,
) -> str:
    """VLMを用いて教育用プロンプトを生成する。

    Args:
        reports: 完成済み週報のリスト。
        drafts: 未完成週報のリスト。
        education_prompt: 教育用プロンプト。
        llm: LLMインスタンス。

    Returns:
        str: 生成されたシステムプロンプト。
    """
    samples_text = _build_report_samples(reports)
    evolution_text = _build_draft_evolution(drafts)

    user_parts = [f"## 完成済み週報サンプル\n\n{samples_text}"]
    if evolution_text:
        user_parts.append(
            f"## 初版→最終版の修正過程\n\n{evolution_text}"
        )

    user_message = "\n\n".join(user_parts)

    messages = [
        SystemMessage(content=education_prompt),
        HumanMessage(content=user_message),
    ]

    print("  VLMに教育用プロンプトの生成を依頼中...")
    response = llm.invoke(messages)
    return response.content


def main():
    """メイン処理。"""
    parser = argparse.ArgumentParser(
        description="VLMを用いて週報データからプロンプトを自動生成する",
    )
    parser.add_argument(
        "--mode",
        choices=["compose", "education", "both"],
        default="both",
        help="生成するプロンプトのモード (default: both)",
    )
    parser.add_argument(
        "--input-prompt",
        type=str,
        default="prompts/system_prompt_compose.json",
        help="プロンプト入力先ディレクトリ (default: prompts)",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="prompts",
        help="プロンプト出力先ディレクトリ (default: prompts)",
    )
    args = parser.parse_args()


    # データ読み込み
    reports = load_completed_reports()
    drafts = load_draft_reports()
    completed_prompt = load_prompt_from_file(args.input_prompt, "compose")
    education_prompt = load_prompt_from_file(args.input_prompt, "education")
    print(f"完成済み週報: {len(reports)}件 読み込み")
    print(f"未完成週報: {len(drafts)}件 読み込み")

    if not reports:
        print("エラー: 完成済み週報が見つかりません。data/completed/ にファイルを配置してください。")
        sys.exit(1)

    # LLM初期化
    llm = _get_llm()
    print()

    # 出力ディレクトリ作成
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    results = {}

    if args.mode in ("compose", "both"):
        prompt = generate_compose_prompt(reports, completed_prompt, llm)
        results["compose"] = prompt

        out_path = output_dir / "system_prompt_compose.txt"
        out_path.write_text(prompt, encoding="utf-8")
        print(f"  → 保存: {out_path} ({len(prompt)}文字)")

    if args.mode in ("education", "both"):
        prompt = generate_education_prompt(reports, drafts, education_prompt, llm)
        results["education"] = prompt

        out_path = output_dir / "system_prompt_education.txt"
        out_path.write_text(prompt, encoding="utf-8")
        print(f"  → 保存: {out_path} ({len(prompt)}文字)")

    json_path = output_dir / "prompts.json"
    json_path.write_text(
        json.dumps(results, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"\nJSON形式で保存: {json_path}")

    print("\n完了!")


if __name__ == "__main__":
    main()
