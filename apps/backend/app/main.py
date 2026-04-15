from fastapi import FastAPI

app = FastAPI(
    title="IFFLOW API",
    description="Backend do portal de fluxos de processos da PROAD/IFAM",
    version="0.1.0",
)


@app.get("/health")
def health_check():
    return {"status": "ok"}
