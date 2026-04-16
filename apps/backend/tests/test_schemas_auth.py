"""Testes dos schemas de auth — B-04.

Valida que os schemas de entrada rejeitam inputs invalidos com os codigos
de erro corretos, e que campos perigosos (role, status, id) sao bloqueados.
"""

import pytest
from pydantic import ValidationError

from app.schemas.auth import RegisterRequest


class TestRegisterRequestValid:
    def test_accepts_valid_input(self):
        req = RegisterRequest(
            name="Joao da Silva",
            email="joao.silva@ifam.edu.br",
            siape="1234567",
            sector="PROAD",
            password="senhasegura123",
            password_confirmation="senhasegura123",
        )
        assert req.email == "joao.silva@ifam.edu.br"
        assert req.name == "Joao da Silva"


class TestRegisterRequestEmailDomain:
    def test_rejects_non_ifam_email(self):
        with pytest.raises(ValidationError) as exc_info:
            RegisterRequest(
                name="Joao",
                email="joao@gmail.com",
                siape="1234567",
                sector="PROAD",
                password="senhasegura123",
                password_confirmation="senhasegura123",
            )
        errors = exc_info.value.errors()
        assert any("INVALID_EMAIL_DOMAIN" in str(e) for e in errors)

    def test_rejects_ifam_without_edu(self):
        with pytest.raises(ValidationError) as exc_info:
            RegisterRequest(
                name="Joao",
                email="joao@ifam.br",
                siape="1234567",
                sector="PROAD",
                password="senhasegura123",
                password_confirmation="senhasegura123",
            )
        errors = exc_info.value.errors()
        assert any("INVALID_EMAIL_DOMAIN" in str(e) for e in errors)


class TestRegisterRequestPassword:
    def test_rejects_short_password(self):
        with pytest.raises(ValidationError) as exc_info:
            RegisterRequest(
                name="Joao",
                email="joao@ifam.edu.br",
                siape="1234567",
                sector="PROAD",
                password="curta",
                password_confirmation="curta",
            )
        errors = exc_info.value.errors()
        assert any("WEAK_PASSWORD" in str(e) for e in errors)

    def test_rejects_mismatched_passwords(self):
        with pytest.raises(ValidationError) as exc_info:
            RegisterRequest(
                name="Joao",
                email="joao@ifam.edu.br",
                siape="1234567",
                sector="PROAD",
                password="senhasegura123",
                password_confirmation="outrasenha123",
            )
        errors = exc_info.value.errors()
        assert any("VALIDATION_ERROR" in str(e) for e in errors)


class TestRegisterRequestMassAssignment:
    def test_rejects_role_field(self):
        with pytest.raises(ValidationError):
            RegisterRequest(
                name="Joao",
                email="joao@ifam.edu.br",
                siape="1234567",
                sector="PROAD",
                password="senhasegura123",
                password_confirmation="senhasegura123",
                role="ADMIN",  # type: ignore[call-arg]
            )

    def test_rejects_status_field(self):
        with pytest.raises(ValidationError):
            RegisterRequest(
                name="Joao",
                email="joao@ifam.edu.br",
                siape="1234567",
                sector="PROAD",
                password="senhasegura123",
                password_confirmation="senhasegura123",
                status="APPROVED",  # type: ignore[call-arg]
            )

    def test_rejects_id_field(self):
        with pytest.raises(ValidationError):
            RegisterRequest(
                name="Joao",
                email="joao@ifam.edu.br",
                siape="1234567",
                sector="PROAD",
                password="senhasegura123",
                password_confirmation="senhasegura123",
                id="some-uuid",  # type: ignore[call-arg]
            )
