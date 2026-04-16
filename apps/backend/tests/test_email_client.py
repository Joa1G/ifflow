"""Testes do cliente de email e dos templates (B-09).

Em `ENVIRONMENT=test` (default da suite, ver conftest.py), `send_email`
grava a chamada em uma lista em memoria. Estes testes verificam:
- captura correta de destinatario/assunto/html/remetente
- que os templates renderizam o nome fornecido
- que o template de reset carrega a URL e NUNCA a senha
- que `from` vem de `settings.email_from`
"""

import pytest

from app.config import settings
from app.email import templates
from app.email.client import clear_sent_emails, get_sent_emails, send_email


@pytest.fixture(autouse=True)
def _clear_emails_between_tests():
    clear_sent_emails()
    yield
    clear_sent_emails()


def test_send_email_em_modo_test_grava_em_memoria():
    send_email(to="alvo@ifam.edu.br", subject="Assunto", html="<p>Corpo</p>")

    sent = get_sent_emails()
    assert len(sent) == 1
    assert sent[0].to == "alvo@ifam.edu.br"
    assert sent[0].subject == "Assunto"
    assert sent[0].html == "<p>Corpo</p>"
    assert sent[0].from_ == settings.email_from


def test_multiplos_envios_sao_acumulados_em_ordem():
    send_email(to="a@ifam.edu.br", subject="S1", html="<p>1</p>")
    send_email(to="b@ifam.edu.br", subject="S2", html="<p>2</p>")

    sent = get_sent_emails()
    assert [e.to for e in sent] == ["a@ifam.edu.br", "b@ifam.edu.br"]


def test_clear_sent_emails_zera_a_lista():
    send_email(to="x@ifam.edu.br", subject="S", html="<p>x</p>")
    clear_sent_emails()
    assert get_sent_emails() == []


def test_get_sent_emails_retorna_copia_e_nao_permite_mutacao_externa():
    send_email(to="x@ifam.edu.br", subject="S", html="<p>x</p>")

    snapshot = get_sent_emails()
    snapshot.clear()

    # A lista interna nao deve ter sido afetada.
    assert len(get_sent_emails()) == 1


def test_template_password_reset_carrega_url_e_nome():
    subject, html = templates.password_reset_email(
        name="Joao da Silva",
        reset_url="https://ifflow.example/reset?token=abc123",
    )

    assert "Redefinicao" in subject or "redefinicao" in subject.lower()
    assert "Joao da Silva" in html
    assert "https://ifflow.example/reset?token=abc123" in html


def test_template_password_reset_nao_inclui_senha():
    """Nunca transmitir senha em claro no email (REQ-070, PR_CHECKLIST seg)."""
    _, html = templates.password_reset_email(
        name="Joao",
        reset_url="https://ifflow.example/reset?token=abc",
    )

    lowered = html.lower()
    assert "senha" in lowered  # menciona a palavra, mas...
    # ...nao expoe a senha de ninguem. Como o template e estatico, basta
    # garantir que nao existe um campo `password=` ou similar no corpo.
    assert "password=" not in lowered
    assert "senha:" not in lowered


def test_template_password_reset_escapa_html_no_nome():
    """Defense in depth: nome com HTML nao vira injecao no corpo."""
    _, html = templates.password_reset_email(
        name="<script>alert(1)</script>",
        reset_url="https://ifflow.example/reset",
    )

    assert "<script>" not in html
    assert "&lt;script&gt;" in html


def test_template_approved_carrega_nome():
    subject, html = templates.account_approved_email(name="Maria Souza")

    assert "aprovado" in subject.lower()
    assert "Maria Souza" in html


def test_template_rejected_com_motivo_renderiza_motivo():
    subject, html = templates.account_rejected_email(
        name="Carlos",
        reason="SIAPE nao confere com os registros.",
    )

    assert "nao aprovado" in subject.lower()
    assert "Carlos" in html
    assert "SIAPE nao confere com os registros." in html


def test_template_rejected_sem_motivo_usa_texto_padrao():
    _, html = templates.account_rejected_email(name="Carlos", reason=None)

    assert "Carlos" in html
    assert "Motivo" not in html  # sem motivo, o bloco nao aparece
    assert "administracao" in html.lower()


def test_template_rejected_escapa_motivo_com_html():
    _, html = templates.account_rejected_email(
        name="Carlos",
        reason="<img src=x onerror=alert(1)>",
    )

    assert "<img" not in html
    assert "&lt;img" in html


def test_send_email_usa_template_e_mantem_dados_corretos():
    """Integracao simples: renderiza template e envia pelo client."""
    subject, html = templates.account_approved_email(name="Ana")
    send_email(to="ana@ifam.edu.br", subject=subject, html=html)

    sent = get_sent_emails()
    assert len(sent) == 1
    assert sent[0].to == "ana@ifam.edu.br"
    assert sent[0].subject == subject
    assert "Ana" in sent[0].html
