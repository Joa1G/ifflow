from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

# Importar settings no nível do módulo faz o startup falhar imediatamente
# (com mensagem amigável apontando o caminho do .env) caso variáveis
# obrigatórias estejam faltando.
from app.config import settings
from app.core.exceptions import IFFLOWError
from app.routers import admin_processes as admin_processes_router
from app.routers import admin_users as admin_users_router
from app.routers import auth as auth_router
from app.routers import processes as processes_router
from app.routers import super_admin_users as super_admin_users_router

app = FastAPI(
    title="IFFLOW API",
    description="Backend do portal de fluxos de processos da PROAD/IFAM",
    version="0.1.0",
)

# CORS: libera a origem do frontend (dev: http://localhost:5173).
# Configuração completa (headers de segurança, trusted hosts, lista de origens
# por ambiente) é escopo da task B-26 — aqui vai o mínimo para destravar o
# fluxo de login em dev.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting: o Limiter vive em routers/auth.py (onde e usado via decorator).
# Precisa estar em app.state para que SlowAPIMiddleware o encontre em cada request.
app.state.limiter = auth_router.limiter
app.add_middleware(SlowAPIMiddleware)


def _error_response(
    *,
    code: str,
    message: str,
    http_status: int,
    details: dict | None = None,
) -> JSONResponse:
    """Monta o body padrao do CONTRACTS.md para qualquer resposta de erro."""
    return JSONResponse(
        status_code=http_status,
        content={
            "error": {
                "code": code,
                "message": message,
                "details": details or {},
            }
        },
    )


@app.exception_handler(IFFLOWError)
async def ifflow_exception_handler(_request: Request, exc: IFFLOWError) -> JSONResponse:
    return _error_response(
        code=exc.code,
        message=exc.message,
        http_status=exc.http_status,
        details=exc.details,
    )


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(
    _request: Request, _exc: RateLimitExceeded
) -> JSONResponse:
    return _error_response(
        code="RATE_LIMITED",
        message="Muitas tentativas. Tente novamente em alguns minutos.",
        http_status=429,
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    # Pydantic gera erros com `ctx` que pode conter objetos nao serializaveis
    # (ex: instancias de excecao). Convertemos para string para garantir JSON.
    safe_errors = []
    for err in exc.errors():
        safe_err = {k: v for k, v in err.items() if k != "ctx"}
        if "ctx" in err:
            safe_err["ctx"] = {k: str(v) for k, v in err["ctx"].items()}
        safe_errors.append(safe_err)

    return _error_response(
        code="VALIDATION_ERROR",
        message="Dados de entrada invalidos.",
        http_status=422,
        details={"errors": safe_errors},
    )


app.include_router(auth_router.router)
app.include_router(admin_users_router.router)
app.include_router(super_admin_users_router.router)
app.include_router(admin_processes_router.router)
app.include_router(processes_router.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
