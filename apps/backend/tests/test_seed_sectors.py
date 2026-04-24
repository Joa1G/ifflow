"""Testes do script de seed de setores iniciais (B-26).

O script popula a tabela `sectors` com os setores institucionais da PROAD/IFAM
necessarios para o editor admin (F-22) funcionar. Precisa ser idempotente —
rodar 2x nao deve duplicar nem estourar por violacao da unique constraint
em `acronym`.
"""

from unittest.mock import patch

from sqlmodel import Session, select

from app.models.sector import Sector
from app.scripts.seed_sectors import INITIAL_SECTORS, seed_sectors


def _run_seed(session: Session) -> None:
    with patch("app.scripts.seed_sectors.engine", session.get_bind()):
        seed_sectors()


def test_seed_cria_todos_os_setores_iniciais(session: Session):
    _run_seed(session)

    sectors = session.exec(select(Sector)).all()
    acronyms = {s.acronym for s in sectors}
    expected_acronyms = {acronym for acronym, _ in INITIAL_SECTORS}
    assert acronyms == expected_acronyms


def test_seed_idempotente_nao_duplica(session: Session):
    _run_seed(session)
    _run_seed(session)

    sectors = list(session.exec(select(Sector)).all())
    assert len(sectors) == len(INITIAL_SECTORS)

    # Cada sigla aparece exatamente uma vez.
    acronyms = [s.acronym for s in sectors]
    assert len(acronyms) == len(set(acronyms))


def test_seed_preserva_setores_ja_existentes_com_mesma_sigla(session: Session):
    """Se um setor ja existe com a sigla (cadastrado manualmente ou por outro
    seed), o script NAO sobrescreve name nem gera UUID novo."""
    pre_existing = Sector(
        name="Nome customizado pelo admin",
        acronym=INITIAL_SECTORS[0][0],
    )
    session.add(pre_existing)
    session.commit()
    session.refresh(pre_existing)
    original_id = pre_existing.id
    original_name = pre_existing.name

    _run_seed(session)

    # O setor pre-existente continua com o mesmo id e name.
    surviving = session.exec(
        select(Sector).where(Sector.acronym == INITIAL_SECTORS[0][0])
    ).one()
    assert surviving.id == original_id
    assert surviving.name == original_name


def test_initial_sectors_tem_pelo_menos_o_minimo_da_task(session: Session):
    """A task B-26 exige no minimo PROAD, DGP, DAP, DCF, DMP."""
    required = {"PROAD", "DGP", "DAP", "DCF", "DMP"}
    available = {acronym for acronym, _ in INITIAL_SECTORS}
    assert required.issubset(available)
