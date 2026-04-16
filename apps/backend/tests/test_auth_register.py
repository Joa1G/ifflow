"""Testes de integracao do endpoint POST /auth/register — B-06.

Usa TestClient com banco SQLite in-memory (via conftest.py).
"""


def _valid_payload(**overrides) -> dict:
    defaults = {
        "name": "Joao da Silva",
        "email": "joao.silva@ifam.edu.br",
        "siape": "1234567",
        "sector": "PROAD",
        "password": "senhasegura123",
        "password_confirmation": "senhasegura123",
    }
    defaults.update(overrides)
    return defaults


class TestRegisterSuccess:
    def test_201_valid_registration(self, client):
        resp = client.post("/auth/register", json=_valid_payload())
        assert resp.status_code == 201
        body = resp.json()
        assert body["status"] == "PENDING"
        assert body["email"] == "joao.silva@ifam.edu.br"
        assert body["name"] == "Joao da Silva"
        assert "id" in body
        assert "message" in body

    def test_response_does_not_contain_password_hash(self, client):
        resp = client.post("/auth/register", json=_valid_payload())
        body = resp.json()
        assert "password_hash" not in body
        assert "password" not in body

    def test_response_does_not_contain_token(self, client):
        resp = client.post("/auth/register", json=_valid_payload())
        body = resp.json()
        assert "access_token" not in body
        assert "token" not in body


class TestRegisterEmailValidation:
    def test_400_non_ifam_email(self, client):
        resp = client.post(
            "/auth/register",
            json=_valid_payload(email="joao@gmail.com"),
        )
        assert resp.status_code == 422
        body = resp.json()
        assert body["error"]["code"] == "VALIDATION_ERROR"


class TestRegisterPasswordValidation:
    def test_400_short_password(self, client):
        resp = client.post(
            "/auth/register",
            json=_valid_payload(password="curta", password_confirmation="curta"),
        )
        assert resp.status_code == 422

    def test_400_mismatched_passwords(self, client):
        resp = client.post(
            "/auth/register",
            json=_valid_payload(
                password="senhasegura123",
                password_confirmation="outrasenha123",
            ),
        )
        assert resp.status_code == 422


class TestRegisterConflict:
    def test_409_duplicate_email(self, client):
        client.post("/auth/register", json=_valid_payload())
        resp = client.post("/auth/register", json=_valid_payload(
            name="Outro",
            siape="9999999",
        ))
        assert resp.status_code == 409
        body = resp.json()
        assert body["error"]["code"] == "EMAIL_ALREADY_EXISTS"


class TestRegisterMissingFields:
    def test_422_missing_required_field(self, client):
        payload = _valid_payload()
        del payload["name"]
        resp = client.post("/auth/register", json=payload)
        assert resp.status_code == 422
