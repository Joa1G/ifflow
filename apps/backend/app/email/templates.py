"""Templates HTML dos emails transacionais do IFFLOW.

Cada funcao retorna uma tupla `(subject, html)` para o chamador passar ao
client. O HTML e minimalista e institucional — sem tracking pixels, sem
imagens externas, sem links alem dos funcionais. Fallback em texto nao e
enviado no MVP (a maioria dos clientes modernos renderiza HTML sem
problemas).

Regras de seguranca:
- `password_reset_email` NUNCA inclui a senha (nem a antiga, nem a nova).
  O link carrega um token aleatorio que e invalidado apos uso.
- Valores dinamicos (nome, motivo) sao escapados para evitar injecao de
  HTML caso algum campo venha com `<script>` (defense in depth — tambem
  validado no cadastro).
"""

from html import escape


def password_reset_email(name: str, reset_url: str) -> tuple[str, str]:
    """Email com link de redefinicao de senha.

    O `reset_url` deve carregar o token que o backend gerou. Expira em 1h.
    """
    safe_name = escape(name)
    safe_url = escape(reset_url, quote=True)
    subject = "IFFLOW — Redefinicao de senha"
    html = f"""
    <p>Ola, {safe_name}.</p>
    <p>Recebemos um pedido para redefinir a senha da sua conta no IFFLOW.
    Para continuar, clique no link abaixo:</p>
    <p><a href="{safe_url}">Redefinir minha senha</a></p>
    <p>Este link expira em 1 hora e so pode ser usado uma vez. Se voce nao
    solicitou a redefinicao, ignore este email — sua senha atual continua
    valida.</p>
    <p>PROAD/IFAM — Portal IFFLOW</p>
    """
    return subject, html.strip()


def account_approved_email(name: str) -> tuple[str, str]:
    """Email avisando que o cadastro foi aprovado pelo admin."""
    safe_name = escape(name)
    subject = "IFFLOW — Cadastro aprovado"
    html = f"""
    <p>Ola, {safe_name}.</p>
    <p>Seu cadastro no Portal IFFLOW foi aprovado. Voce ja pode acessar o
    sistema com o email e senha que cadastrou.</p>
    <p>PROAD/IFAM — Portal IFFLOW</p>
    """
    return subject, html.strip()


def account_rejected_email(name: str, reason: str | None = None) -> tuple[str, str]:
    """Email avisando que o cadastro foi rejeitado pelo admin.

    `reason` e opcional; se ausente, o email usa um texto padrao pedindo
    contato com a administracao.
    """
    safe_name = escape(name)
    subject = "IFFLOW — Cadastro nao aprovado"
    if reason:
        reason_block = (
            f"<p><strong>Motivo:</strong> {escape(reason)}</p>"
            "<p>Entre em contato com a administracao do IFFLOW para mais "
            "informacoes ou para corrigir os dados.</p>"
        )
    else:
        reason_block = (
            "<p>Entre em contato com a administracao do IFFLOW para mais "
            "informacoes.</p>"
        )
    html = f"""
    <p>Ola, {safe_name}.</p>
    <p>Seu cadastro no Portal IFFLOW nao foi aprovado.</p>
    {reason_block}
    <p>PROAD/IFAM — Portal IFFLOW</p>
    """
    return subject, html.strip()
