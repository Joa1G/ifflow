"""Seed dos setores institucionais da PROAD/IFAM.

Executar como:  python -m app.scripts.seed_sectors

Idempotente: se um setor com a mesma `acronym` ja existe, preserva o registro
existente (nao sobrescreve `name` nem regenera UUID). Isso evita que
processos ja em andamento referenciem um `sector_id` que foi silenciosamente
trocado por um novo UUID.

A lista abaixo e o minimo para o piloto da capacitacao (F-22 e o processo
inicial MVP). A equipe pode estender conforme novos processos entrarem no
sistema — basta adicionar em INITIAL_SECTORS e rodar o script novamente.

NUNCA e chamado automaticamente no startup. Rodar manualmente apos
`alembic upgrade head` no deploy inicial.
"""

import logging

from sqlmodel import Session, select

from app.database import engine
from app.models.sector import Sector

logger = logging.getLogger(__name__)


# (acronym, name) — acronym e a sigla curta usada nos badges, name e o nome
# institucional completo exibido no Select do editor admin. A tupla mantem a
# ordem de leitura "sigla → nome" que a equipe usa no dia a dia.
INITIAL_SECTORS: list[tuple[str, str]] = [
    ("PROAD", "Pro-Reitoria de Administracao"),
    ("DGP", "Diretoria de Gestao de Pessoas"),
    ("DAP", "Diretoria de Administracao e Planejamento"),
    ("DCF", "Diretoria de Contabilidade e Financas"),
    ("DMP", "Diretoria de Material e Patrimonio"),
]


def seed_sectors() -> None:
    with Session(engine) as session:
        existing_acronyms = {s.acronym for s in session.exec(select(Sector)).all()}

        created = 0
        for acronym, name in INITIAL_SECTORS:
            if acronym in existing_acronyms:
                logger.info("Setor %s ja existe, preservando.", acronym)
                continue
            session.add(Sector(name=name, acronym=acronym))
            created += 1

        if created:
            session.commit()
            logger.info("Setores criados: %d.", created)
        else:
            logger.info("Nenhum setor novo — seed ja aplicado.")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    seed_sectors()
