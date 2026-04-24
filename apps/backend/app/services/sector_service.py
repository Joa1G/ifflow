"""Service de Sector — so leitura no MVP (B-26).

Por que ter um service se a query e tao simples? Duas razoes:
1. Consistencia com o padrao do codebase (routers nunca tocam em `session.exec`
   diretamente).
2. Facilita testes unitarios da logica de ordenacao/filtro sem subir FastAPI.
"""

from sqlmodel import Session, select

from app.models.sector import Sector


def list_sectors(session: Session) -> list[Sector]:
    """Retorna todos os setores, ordenados alfabeticamente por `name`.

    A UI (F-22) usa o name completo para renderizar a opcao do Select e
    acronym como badge curto — ordenar pelo name garante que a lista aparece
    na mesma ordem em que o usuario vai ler.
    """
    statement = select(Sector).order_by(Sector.name.asc())  # type: ignore[attr-defined]
    return list(session.exec(statement).all())
