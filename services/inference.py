import fastapi
import openai
from config import DEEPSEEK_KEY, HISTORY_HMAC_KEY
import hmac
import pydantic as pd
import base64
from fastapi.responses import EventSourceResponse
import json
import traceback
from .powcaptcha import verify_challgence

client = openai.AsyncOpenAI(
    api_key=DEEPSEEK_KEY,
    base_url="https://api.deepseek.com/beta",
)

class History(pd.BaseModel):
    user: str
    agent: str
    sign: str

def create_signature(user: str, assistant: str, previous: str = ""):
    dep = b"\x00".join(i.encode("utf-8") for i in (user, assistant, previous))
    return base64.urlsafe_b64encode(hmac.digest(HISTORY_HMAC_KEY, dep, 'sha256')).decode('ascii').replace('=', '')

def compare_signature(sig1: str, sig2: str):
    return hmac.compare_digest(sig1.encode("utf-8"), sig2.encode("utf-8"))

router = fastapi.APIRouter()

class ProofOfWork(pd.BaseModel):
    challgence: str
    response: str

class RequestARD(pd.BaseModel):
    history: list[History]
    question: str
    pow: ProofOfWork

def package_message(msg):
    return b"data: " + json.dumps(msg).encode("utf-8") + b"\n\n"

async def message_predictor(req: RequestARD):
    yield package_message({"type": "hello"})
    if not await verify_challgence(req.pow.challgence, req.pow.response):
        yield package_message({"type": "error", "error": "pow.invalid"})
        return
    # Verify signature
    digest = ""
    for history in req.history:
        digest = create_signature(history.user, history.agent, digest)
        if not compare_signature(digest, history.sign):
            yield package_message({"type": "error", "error": "sign.invalid"})
            return
    # Response
    with open("./PROMPT.md", "r", encoding="utf-8") as f:
        oai_messages: list = [{"role": "system", "content": f.read()}]
    for history in req.history:
        oai_messages.append({"role": "user", "content": history.user})
        oai_messages.append({"role": "assistant", "content": history.agent})
    oai_messages.append({"role": "user", "content": req.question})
    content_record = ""
    # Inference
    while True:
        buffer = ""
        try:
            response = await client.chat.completions.create(
                messages=oai_messages,
                model="deepseek-flash",
                stream=True,
            )
            finish_reason = None
            async for chunk in response:
                choice = chunk.choices[0]
                if choice.delta.content:
                    buffer += choice.delta.content
                    yield package_message({"type": "delta", "content": choice.delta.content})
                if choice.finish_reason:
                    finish_reason = choice.finish_reason
            if len(buffer) > 0:
                content_record += buffer
                if oai_messages[-1]["role"] == "assistant":
                    oai_messages[-1]["content"] = content_record
                else:
                    oai_messages.append({"role": "assistant", "content": content_record, "prefix": True})
            if finish_reason != "length":
                yield package_message({"type": "done", "signature": create_signature(req.question, content_record, digest)})
                return
        except Exception as e:
            traceback.print_exception(e)
            yield package_message({"type": "error", "error": "server.error"})
            return

@router.post("/api/prediction")
async def prediction_message(req: RequestARD):
    return EventSourceResponse(message_predictor(req))
