# Importar todos os models aqui para que o Alembic (via env.py) registre as
# tabelas em SQLModel.metadata ao fazer `import app.models`.
from app.models.user import User  # noqa: F401
