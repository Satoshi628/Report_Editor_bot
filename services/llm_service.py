"""LLMサービスモジュール。

LangChain + Azure OpenAI によるVLM機能を提供する。
Structured Outputsでチャットと週報内容を分離して出力する。
"""

from pathlib import Path

from pydantic import BaseModel, Field

from langchain_openai import AzureChatOpenAI
from langchain.schema import HumanMessage, SystemMessage, AIMessage

import config


class ChatResponse(BaseModel):
    """VLMの構造化レスポンス。"""

    chat_message: str = Field(
        description="ユーザーへのチャットメッセージ。説明、アドバイス、質問など。"
    )
    report_content: str | None = Field(
        default=None,
        description=(
            "週報のテキスト内容。週報の生成・修正を行った場合のみ設定する。"
            "週報内容がない場合はnullにする。"
        ),
    )


def _get_llm() -> AzureChatOpenAI:
    """AzureChatOpenAI インスタンスを取得する。

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


def _get_structured_llm():
    """Structured Output用LLMインスタンスを取得する。

    Returns:
        Runnable: ChatResponseスキーマでバインドされたLLM。
    """
    llm = _get_llm()
    return llm.with_structured_output(ChatResponse)


# セッションごとの会話履歴を保持
_conversation_histories: dict[str, list] = {}

# プロンプトファイルのパス
_PROMPT_DIR = Path(__file__).resolve().parent.parent / "prompts"


def _load_prompt_file(filename: str) -> str | None:
    """プロンプトファイルを読み込む。

    Args:
        filename: プロンプトファイル名。

    Returns:
        str | None: ファイル内容。存在しない場合は None。
    """
    path = _PROMPT_DIR / filename
    if path.exists():
        return path.read_text(encoding="utf-8")
    return None


def get_system_prompt_compose(reference_texts: list[str]) -> str:
    """文書作成・修正モード用のシステムプロンプトを生成する。

    prompts/system_prompt_compose.txt が存在する場合はそれを使用し、
    参考週報をランタイムで追加する。存在しない場合はフォールバックを使用。

    Args:
        reference_texts: 参考にする過去の完成済み週報テキスト。

    Returns:
        str: システムプロンプト。
    """
    # VLM生成プロンプトの読み込み
    base_prompt = _load_prompt_file("system_prompt_compose.txt")

    if base_prompt is None:
        # フォールバック: ファイルがない場合の最低限プロンプト
        base_prompt = """\
あなたは社内の週報作成を支援するAIアシスタントです。

## あなたの役割
- ユーザーが書きたい内容を入力した場合: 適切な週報文書を生成してください。
- ユーザーが週報を入力した場合: 内容の改善提案や修正を行ってください。

## 出力形式
あなたはJSON形式で応答します:
- `chat_message`: ユーザーへの説明やアドバイス。
- `report_content`: 週報の生成・修正を行った場合のテキスト全文。会話のみの場合はnull。"""

    # 参考週報をランタイムで注入
    if reference_texts:
        refs = "\n\n---\n\n".join(reference_texts[:5])
        base_prompt += f"\n\n## 参考: 過去の週報例\n\n{refs}"

    return base_prompt


def get_system_prompt_education(
    draft_examples: list[dict],
    reference_texts: list[str],
) -> str:
    """教育モード用のシステムプロンプトを生成する。

    prompts/system_prompt_education.txt が存在する場合はそれを使用し、
    参考週報・指摘コメントをランタイムで追加する。
    存在しない場合はフォールバックを使用。

    Args:
        draft_examples: 未完成週報の指摘コメント例。
        reference_texts: 参考にする過去の完成済み週報テキスト。

    Returns:
        str: システムプロンプト。
    """
    # VLM生成プロンプトの読み込み
    base_prompt = _load_prompt_file("system_prompt_education.txt")

    if base_prompt is None:
        # フォールバック
        base_prompt = """\
あなたは社内の週報作成を教育するAIアシスタントです。

## あなたの役割
- ユーザーの週報に対して具体的なフィードバックを提供してください。
- 良い点と改善点の両方を指摘してください。

## 出力形式
あなたはJSON形式で応答します:
- `chat_message`: ユーザーへの教育的フィードバックやアドバイス。
- `report_content`: 修正した週報全文。アドバイスのみの場合はnull。"""

    # 指摘コメント例をランタイムで注入
    if draft_examples:
        examples = []
        for draft in draft_examples[:3]:
            pages = draft.get("pages", [])
            for page in pages:
                for comment in page.get("comments", []):
                    examples.append(
                        f"- 指摘者: {comment['author']}\n  指摘内容: {comment['text']}"
                    )
        if examples:
            base_prompt += (
                "\n\n## 参考: 過去の指摘コメント例\n\n" + "\n".join(examples)
            )

    # 参考週報をランタイムで注入
    if reference_texts:
        refs = "\n\n---\n\n".join(reference_texts[:3])
        base_prompt += f"\n\n## 参考: 完成済み週報例\n\n{refs}"

    return base_prompt


def chat(
    session_id: str,
    user_message: str,
    mode: str,
    editor_content: str,
    reference_texts: list[str],
    draft_examples: list[dict] | None = None,
) -> dict:
    """チャットメッセージを処理してAIレスポンスを返す。

    Structured Outputsにより、チャットメッセージと週報内容を分離して返す。

    Args:
        session_id: セッションID。
        user_message: ユーザーのメッセージ。
        mode: モード（"compose" or "education"）。
        editor_content: エディタの現在の内容。
        reference_texts: 参考にする過去の完成済み週報テキスト。
        draft_examples: 未完成週報の指摘コメント例（教育モード用）。

    Returns:
        dict: chat_message と report_content を含む辞書。
    """
    structured_llm = _get_structured_llm()

    # システムプロンプトの生成
    if mode == "education":
        system_prompt = get_system_prompt_education(
            draft_examples or [], reference_texts
        )
    else:
        system_prompt = get_system_prompt_compose(reference_texts)

    # 会話履歴の取得・初期化
    if session_id not in _conversation_histories:
        _conversation_histories[session_id] = []

    history = _conversation_histories[session_id]

    # メッセージの構築
    messages = [SystemMessage(content=system_prompt)]

    # エディタの内容がある場合はコンテキストとして追加
    if editor_content.strip():
        context_msg = f"【現在のエディタ内容】\n{editor_content}\n\n---\n\n"
    else:
        context_msg = ""

    # 過去の会話履歴を追加
    for msg in history[-10:]:
        if msg["role"] == "user":
            messages.append(HumanMessage(content=msg["content"]))
        else:
            messages.append(AIMessage(content=msg["content"]))

    # 今回のメッセージ
    full_message = f"{context_msg}{user_message}" if context_msg else user_message
    messages.append(HumanMessage(content=full_message))

    # LLM呼び出し（Structured Output）
    response: ChatResponse = structured_llm.invoke(messages)

    # 会話履歴に追加
    history.append({"role": "user", "content": user_message})
    history.append({"role": "assistant", "content": response.chat_message})

    return {
        "chat_message": response.chat_message,
        "report_content": response.report_content,
    }


def apply_comments(
    editor_content: str,
    comments: list[dict],
    reference_texts: list[str],
) -> dict:
    """エディタ上のコメントに基づいて週報を修正する。

    Args:
        editor_content: エディタの現在のテキスト内容。
        comments: コメントのリスト。各要素は text, selected_text を持つ。
        reference_texts: 参考にする過去の完成済み週報テキスト。

    Returns:
        dict: chat_message と report_content を含む辞書。
    """
    structured_llm = _get_structured_llm()

    references = ""
    if reference_texts:
        refs = "\n\n---\n\n".join(reference_texts[:3])
        references = f"\n\n## 参考: 過去の週報例\n\n{refs}"

    system_prompt = f"""あなたは社内の週報を修正するAIアシスタントです。

## あなたの役割
ユーザーが週報のテキストに対してコメント（修正指示）を付けています。
各コメントは、対象テキスト（選択された箇所）と修正指示で構成されています。
すべてのコメントの指示に従って週報を修正してください。

## 出力形式
あなたはJSON形式で応答します:
- `chat_message`: 修正内容の要約。どの箇所をどう変更したかを簡潔に説明。
- `report_content`: 修正後の週報全文テキスト。必ず設定してください。

## 指針
- コメントの指示を忠実に反映してください。
- コメントがない箇所は変更しないでください。
- 全体の文脈に矛盾が生じないよう注意してください。
{references}"""

    # コメント情報を構築
    comment_details = []
    for i, c in enumerate(comments, 1):
        selected = c.get("selected_text", "")
        comment_text = c.get("text", "")
        comment_details.append(
            f"コメント{i}:\n  対象テキスト: 「{selected}」\n  修正指示: {comment_text}"
        )

    comments_str = "\n\n".join(comment_details)

    user_message = f"""以下の週報を、コメントの指示に従って修正してください。

【週報全文】
{editor_content}

【コメント一覧】
{comments_str}"""

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_message),
    ]

    response: ChatResponse = structured_llm.invoke(messages)

    return {
        "chat_message": response.chat_message,
        "report_content": response.report_content,
    }


def clear_history(session_id: str) -> None:
    """セッションの会話履歴をクリアする。

    Args:
        session_id: セッションID。
    """
    if session_id in _conversation_histories:
        del _conversation_histories[session_id]
