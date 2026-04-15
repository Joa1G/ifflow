from datetime import datetime, timedelta, timezone
from uuid import uuid4

import jwt
import pytest

from app.config import settings
from app.core.enums import UserRole
from app.core.exceptions import UnauthenticatedError
from app.core.security import (
    JWT_ALGORITHM,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


class TestPasswordHashing:
    def test_hash_and_verify_roundtrip(self):
        hashed = hash_password("minhasenha123")
        assert hashed != "minhasenha123"
        assert verify_password("minhasenha123", hashed) is True

    def test_verify_rejects_wrong_password(self):
        hashed = hash_password("minhasenha123")
        assert verify_password("senha-errada", hashed) is False

    def test_hash_uses_argon2(self):
        # Identificador padrao do argon2id em formato PHC.
        hashed = hash_password("qualquer-senha")
        assert hashed.startswith("$argon2")

    def test_two_hashes_of_same_password_differ(self):
        # Salt aleatorio deve produzir hashes diferentes.
        assert hash_password("abc") != hash_password("abc")


class TestJWT:
    def test_encode_decode_roundtrip(self):
        user_id = uuid4()
        token = create_access_token(user_id, UserRole.ADMIN)
        payload = decode_access_token(token)
        assert payload.user_id == user_id
        assert payload.role == UserRole.ADMIN
        assert payload.exp > payload.iat

    def test_decode_expired_token_raises_unauthenticated(self):
        # Gera token ja expirado manualmente.
        past = datetime.now(timezone.utc) - timedelta(hours=1)
        token = jwt.encode(
            {
                "user_id": str(uuid4()),
                "role": UserRole.USER.value,
                "iat": int((past - timedelta(hours=1)).timestamp()),
                "exp": int(past.timestamp()),
            },
            settings.jwt_secret,
            algorithm=JWT_ALGORITHM,
        )
        with pytest.raises(UnauthenticatedError) as exc_info:
            decode_access_token(token)
        assert exc_info.value.code == "UNAUTHENTICATED"

    def test_decode_malformed_token_raises_invalid_token(self):
        with pytest.raises(UnauthenticatedError) as exc_info:
            decode_access_token("isso-nao-eh-um-jwt")
        assert exc_info.value.code == "INVALID_TOKEN"

    def test_decode_wrong_signature_raises_invalid_token(self):
        token = jwt.encode(
            {
                "user_id": str(uuid4()),
                "role": UserRole.USER.value,
                "iat": int(datetime.now(timezone.utc).timestamp()),
                "exp": int(
                    (datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()
                ),
            },
            "outro-secret-completamente-diferente-do-real",
            algorithm=JWT_ALGORITHM,
        )
        with pytest.raises(UnauthenticatedError) as exc_info:
            decode_access_token(token)
        assert exc_info.value.code == "INVALID_TOKEN"

    def test_decode_missing_required_claims_raises_invalid_token(self):
        # Token sem `exp` nem `iat`.
        token = jwt.encode(
            {"user_id": str(uuid4()), "role": UserRole.USER.value},
            settings.jwt_secret,
            algorithm=JWT_ALGORITHM,
        )
        with pytest.raises(UnauthenticatedError) as exc_info:
            decode_access_token(token)
        assert exc_info.value.code == "INVALID_TOKEN"

    def test_decode_extra_field_in_payload_raises_invalid_token(self):
        # extra="forbid" no TokenPayload bloqueia injecao de claims extras.
        now = datetime.now(timezone.utc)
        token = jwt.encode(
            {
                "user_id": str(uuid4()),
                "role": UserRole.USER.value,
                "iat": int(now.timestamp()),
                "exp": int((now + timedelta(hours=1)).timestamp()),
                "is_god_mode": True,
            },
            settings.jwt_secret,
            algorithm=JWT_ALGORITHM,
        )
        with pytest.raises(UnauthenticatedError) as exc_info:
            decode_access_token(token)
        assert exc_info.value.code == "INVALID_TOKEN"

    def test_decode_invalid_role_raises_invalid_token(self):
        now = datetime.now(timezone.utc)
        token = jwt.encode(
            {
                "user_id": str(uuid4()),
                "role": "GOD",
                "iat": int(now.timestamp()),
                "exp": int((now + timedelta(hours=1)).timestamp()),
            },
            settings.jwt_secret,
            algorithm=JWT_ALGORITHM,
        )
        with pytest.raises(UnauthenticatedError) as exc_info:
            decode_access_token(token)
        assert exc_info.value.code == "INVALID_TOKEN"
