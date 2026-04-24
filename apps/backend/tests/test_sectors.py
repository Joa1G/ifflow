"""Testes de integracao de GET /sectors (B-26).

Endpoint alimenta o editor admin de processos (F-22) com a lista de setores
disponiveis para escolher em cada etapa. Exige autenticacao basica — qualquer
USER autenticado pode ver a lista, nao e informacao sensivel dentro do portal.
"""

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.enums import UserRole, UserStatus
from app.core.security import create_access_token, hash_password
from app.models.sector import Sector
from app.models.user import User


def _create_user(
    session: Session,
    *,
    email: str = "qualquer@ifam.edu.br",
    role: UserRole = UserRole.USER,
    status: UserStatus = UserStatus.APPROVED,
) -> User:
    user = User(
        name="Usuario Teste",
        email=email,
        siape="3333333",
        sector="PROAD",
        password_hash=hash_password("senhaForte123"),
        role=role,
        status=status,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _auth_headers(user: User) -> dict[str, str]:
    token = create_access_token(user.id, user.role)
    return {"Authorization": f"Bearer {token}"}


def _seed_sectors(session: Session, payload: list[tuple[str, str]]) -> list[Sector]:
    sectors = [Sector(name=name, acronym=acronym) for acronym, name in payload]
    session.add_all(sectors)
    session.commit()
    for s in sectors:
        session.refresh(s)
    return sectors


def test_lista_setores_como_user_autenticado(client: TestClient, session: Session):
    _seed_sectors(
        session,
        [
            ("PROAD", "Pro-Reitoria de Administracao"),
            ("DGP", "Diretoria de Gestao de Pessoas"),
        ],
    )
    user = _create_user(session)

    response = client.get("/sectors", headers=_auth_headers(user))

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert {s["acronym"] for s in body["sectors"]} == {"PROAD", "DGP"}


def test_lista_setores_em_ordem_alfabetica_por_name(
    client: TestClient, session: Session
):
    _seed_sectors(
        session,
        [
            ("PROAD", "Pro-Reitoria de Administracao"),
            ("DAP", "Diretoria de Administracao e Planejamento"),
            ("DCF", "Diretoria de Contabilidade e Financas"),
        ],
    )
    user = _create_user(session)

    response = client.get("/sectors", headers=_auth_headers(user))

    assert response.status_code == 200
    names = [s["name"] for s in response.json()["sectors"]]
    assert names == [
        "Diretoria de Administracao e Planejamento",
        "Diretoria de Contabilidade e Financas",
        "Pro-Reitoria de Administracao",
    ]


def test_lista_setores_tabela_vazia_retorna_estrutura_correta(
    client: TestClient, session: Session
):
    user = _create_user(session)
    response = client.get("/sectors", headers=_auth_headers(user))
    assert response.status_code == 200
    assert response.json() == {"sectors": [], "total": 0}


def test_lista_setores_como_admin_ok(client: TestClient, session: Session):
    """ADMIN tambem pode listar — rota e aberta a qualquer autenticado."""
    _seed_sectors(session, [("PROAD", "Pro-Reitoria de Administracao")])
    admin = _create_user(
        session, email="admin.sectors@ifam.edu.br", role=UserRole.ADMIN
    )

    response = client.get("/sectors", headers=_auth_headers(admin))

    assert response.status_code == 200
    assert response.json()["total"] == 1


def test_lista_setores_sem_auth_retorna_401(client: TestClient, session: Session):
    _seed_sectors(session, [("PROAD", "Pro-Reitoria de Administracao")])

    response = client.get("/sectors")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_lista_setores_schema_contem_apenas_campos_publicos(
    client: TestClient, session: Session
):
    """Regressao de schema — apenas id, name, acronym sao expostos. Timestamps
    internos ou FKs nao devem vazar."""
    _seed_sectors(session, [("PROAD", "Pro-Reitoria de Administracao")])
    user = _create_user(session)

    response = client.get("/sectors", headers=_auth_headers(user))

    allowed_keys = {"id", "name", "acronym"}
    for sector in response.json()["sectors"]:
        assert set(sector.keys()) == allowed_keys
