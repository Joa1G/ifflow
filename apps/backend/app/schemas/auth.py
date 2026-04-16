"""Schemas de autenticacao — request/response para /auth/*.

Schemas de ENTRADA nunca incluem role, status, id ou password_hash
(prevencao de mass assignment). Validadores levantam ValueError que o
Pydantic converte em 422, mas validacoes de dominio (email duplicado etc)
ficam nos services.
"""

from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator, model_validator

from app.core.enums import UserRole, UserStatus


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    email: EmailStr
    siape: str
    sector: str
    password: str
    password_confirmation: str

    @field_validator("email")
    @classmethod
    def email_must_be_ifam(cls, v: str) -> str:
        if not v.endswith("@ifam.edu.br"):
            raise ValueError("INVALID_EMAIL_DOMAIN")
        return v

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("WEAK_PASSWORD")
        return v

    @model_validator(mode="after")
    def passwords_match(self) -> "RegisterRequest":
        if self.password != self.password_confirmation:
            raise ValueError("VALIDATION_ERROR")
        return self


class RegisterResponse(BaseModel):
    id: UUID
    name: str
    email: str
    status: UserStatus
    message: str


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: "LoginUserInfo"


class LoginUserInfo(BaseModel):
    id: UUID
    name: str
    email: str
    role: UserRole
    sector: str


class PasswordResetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr


class PasswordResetConfirm(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str
    new_password: str
    new_password_confirmation: str

    @field_validator("new_password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("WEAK_PASSWORD")
        return v

    @model_validator(mode="after")
    def passwords_match(self) -> "PasswordResetConfirm":
        if self.new_password != self.new_password_confirmation:
            raise ValueError("VALIDATION_ERROR")
        return self
