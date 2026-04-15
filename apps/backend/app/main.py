from fastapi import FastAPI

# Importar settings no nível do módulo faz o startup falhar imediatamente
# (com mensagem amigável apontando o caminho do .env) caso variáveis
# obrigatórias estejam faltando.
from app.config import settings  # noqa: F401

app = FastAPI(
    title="IFFLOW API",
    description="Backend do portal de fluxos de processos da PROAD/IFAM",
    version="0.1.0",
)


@app.get("/health")
def health_check():
    return {"status": "ok"}
