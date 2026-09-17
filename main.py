import fastapi
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import re
from services.inference import router as inference_router

app = fastapi.FastAPI()
app.mount("/static", StaticFiles(directory="./static"))
app.include_router(inference_router)

@app.get("/")
async def indexpage():
    with open("./static/_index.html", "r", encoding="utf-8") as f:
        return HTMLResponse(re.sub(r"\n *", "", f.read()))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)