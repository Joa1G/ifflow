# Importar todos os models aqui para que o Alembic (via env.py) registre as
# tabelas em SQLModel.metadata ao fazer `import app.models`.
from app.models.flow_step import FlowStep  # noqa: F401
from app.models.password_reset import PasswordResetToken  # noqa: F401
from app.models.process import Process  # noqa: F401
from app.models.sector import Sector  # noqa: F401
from app.models.step_resource import StepResource  # noqa: F401
from app.models.user import User  # noqa: F401
