"""Testes do fluxo de proposta de edicao de processo PUBLISHED (B-30).

Cobre:
- POST /processes/{id}/propose-edit: criacao + idempotencia + autorizacao
- Bloqueio de update/archive/step-CRUD do ORIGINAL com proposta pendente
  (decisao 6A: PROCESS_HAS_PENDING_PROPOSAL)
- Aprovacao de proposta com merge ID-preserving (decisao 5B): step ids
  preservados quando ha cloned_from match; novos sao inseridos; sem-match
  no original sao deletados
- Defesa em profundidade no submit/approve quando o original deixa de
  estar PUBLISHED (PROPOSAL_BASE_NOT_PUBLISHED)
- Archive da proposta (rejeicao) libera o slot do unique partial index
  para uma nova proposta no mesmo original
"""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.enums import ProcessStatus, UserRole, UserStatus
from app.core.security import create_access_token, hash_password
from app.models.flow_step import FlowStep
from app.models.process import Process
from app.models.sector import Sector
from app.models.user import User


def _create_user(
    session: Session,
    *,
    email: str,
    role: UserRole = UserRole.USER,
) -> User:
    user = User(
        name=f"User {email}",
        email=email,
        siape="7777777",
        sector="PROAD",
        password_hash=hash_password("senhaForte123"),
        role=role,
        status=UserStatus.APPROVED,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _create_sector(session: Session, *, acronym: str = "PROAD") -> Sector:
    sector = Sector(name=f"Setor {acronym}", acronym=acronym)
    session.add(sector)
    session.commit()
    session.refresh(sector)
    return sector


def _auth_headers(user: User) -> dict[str, str]:
    token = create_access_token(user.id, user.role)
    return {"Authorization": f"Bearer {token}"}


def _create_draft(client: TestClient, headers: dict, **overrides) -> dict:
    payload = {
        "title": "Solicitacao de Capacitacao",
        "short_description": "Curta",
        "full_description": "Longa",
        "category": "RH",
        "estimated_time": "30 dias",
        "requirements": ["Estagio probatorio concluido"],
    }
    payload.update(overrides)
    response = client.post("/processes", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _create_step(
    client: TestClient,
    process_id: str,
    sector_id: UUID,
    headers: dict,
    **overrides,
) -> dict:
    payload = {
        "sector_id": str(sector_id),
        "order": 1,
        "title": "Etapa A",
        "description": "Descricao A",
        "responsible": "Solicitante",
        "estimated_time": "1 dia",
    }
    payload.update(overrides)
    response = client.post(
        f"/processes/{process_id}/steps", json=payload, headers=headers
    )
    assert response.status_code == 201, response.text
    return response.json()


def _create_resource(
    client: TestClient,
    process_id: str,
    step_id: str,
    headers: dict,
    **overrides,
) -> dict:
    payload = {
        "type": "DOCUMENT",
        "title": "Formulario",
        "url": "https://example.com/form.pdf",
        "content": None,
    }
    payload.update(overrides)
    response = client.post(
        f"/processes/{process_id}/steps/{step_id}/resources",
        json=payload,
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def _publish(
    client: TestClient,
    process_id: str,
    *,
    author_headers: dict,
    admin_headers: dict,
) -> dict:
    """DRAFT -> IN_REVIEW (autor) -> PUBLISHED (admin). Retorna a view final."""
    submit = client.post(
        f"/processes/{process_id}/submit-for-review", headers=author_headers
    )
    assert submit.status_code == 200, submit.text
    approve = client.post(
        f"/admin/processes/{process_id}/approve", headers=admin_headers
    )
    assert approve.status_code == 200, approve.text
    return approve.json()


def _setup_published(
    client: TestClient,
    session: Session,
    *,
    author_email: str = "autor@ifam.edu.br",
    admin_email: str = "admin@ifam.edu.br",
) -> tuple[User, User, Sector, dict, dict, dict]:
    """Setup base: cria autor (USER), admin, setor, e um processo PUBLISHED
    com 1 etapa e 1 recurso. Retorna (autor, admin, setor, processo,
    etapa, recurso) — todos os dicts ja sao a versao serializada das views.
    """
    author = _create_user(session, email=author_email, role=UserRole.USER)
    admin = _create_user(session, email=admin_email, role=UserRole.ADMIN)
    sector = _create_sector(session)
    process = _create_draft(client, _auth_headers(author))
    step = _create_step(client, process["id"], sector.id, _auth_headers(author))
    resource = _create_resource(
        client, process["id"], step["id"], _auth_headers(author)
    )
    published = _publish(
        client,
        process["id"],
        author_headers=_auth_headers(author),
        admin_headers=_auth_headers(admin),
    )
    return author, admin, sector, published, step, resource


# ---------- POST /processes/{id}/propose-edit ----------


def test_propose_edit_caminho_feliz(client: TestClient, session: Session):
    """Autor de processo PUBLISHED cria proposta. Deve vir DRAFT, com
    proposed_change_for = original.id, e copia de metadados + steps."""
    author, _admin, _sector, published, step, resource = _setup_published(
        client, session
    )

    response = client.post(
        f"/processes/{published['id']}/propose-edit",
        headers=_auth_headers(author),
    )

    assert response.status_code == 201, response.text
    proposal = response.json()
    assert proposal["status"] == "DRAFT"
    assert proposal["proposed_change_for"] == published["id"]
    assert proposal["pending_proposal_id"] is None
    assert proposal["created_by"] == str(author.id)
    assert proposal["title"] == published["title"]
    # Id e diferente do original — e um clone, nao o mesmo registro.
    assert proposal["id"] != published["id"]

    # E as etapas foram clonadas com cloned_from_step_id apontando pra
    # etapa do original (visivel via /flow autenticado).
    flow = client.get(
        f"/processes/{proposal['id']}/flow",
        headers=_auth_headers(author),
    )
    assert flow.status_code == 200, flow.text
    proposal_steps = flow.json()["steps"]
    assert len(proposal_steps) == 1
    # /flow nao expoe cloned_from_step_id (e detalhe interno) — vamos
    # verificar via session.
    proposal_step_id = UUID(proposal_steps[0]["id"])
    cloned_step = session.get(FlowStep, proposal_step_id)
    assert cloned_step is not None
    assert cloned_step.cloned_from_step_id == UUID(step["id"])
    assert cloned_step.id != UUID(step["id"])  # id novo, ref antigo

    # Resource clonado tambem aponta cloned_from_resource_id.
    [cloned_res] = cloned_step.resources
    assert cloned_res.cloned_from_resource_id == UUID(resource["id"])
    assert cloned_res.id != UUID(resource["id"])


def test_propose_edit_retorna_pending_id_no_original_apos_criar(
    client: TestClient, session: Session
):
    """Apos criar proposta, GET /processes/{originalId}/management mostra
    pending_proposal_id apontando pra ela — economiza round-trip no front."""
    author, _admin, _sector, published, _step, _resource = _setup_published(
        client, session
    )

    proposal = client.post(
        f"/processes/{published['id']}/propose-edit",
        headers=_auth_headers(author),
    ).json()

    response = client.get(
        f"/processes/{published['id']}/management",
        headers=_auth_headers(author),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["pending_proposal_id"] == proposal["id"]
    assert body["proposed_change_for"] is None  # original em si nao e proposta


def test_propose_edit_idempotente(client: TestClient, session: Session):
    """Segunda chamada devolve a MESMA proposta (mesmo id), nao cria nova."""
    author, _admin, _sector, published, _step, _resource = _setup_published(
        client, session
    )

    first = client.post(
        f"/processes/{published['id']}/propose-edit",
        headers=_auth_headers(author),
    )
    second = client.post(
        f"/processes/{published['id']}/propose-edit",
        headers=_auth_headers(author),
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] == second.json()["id"]


def test_propose_edit_processo_draft_retorna_409(client: TestClient, session: Session):
    """So PUBLISHED aceita proposta. DRAFT -> 409 PROCESS_NOT_PUBLISHED."""
    author = _create_user(session, email="autor.d@ifam.edu.br")
    process = _create_draft(client, _auth_headers(author))

    response = client.post(
        f"/processes/{process['id']}/propose-edit",
        headers=_auth_headers(author),
    )

    assert response.status_code == 409
    body = response.json()
    assert body["error"]["code"] == "PROCESS_NOT_PUBLISHED"
    assert body["error"]["details"]["current_status"] == "DRAFT"


def test_propose_edit_processo_archived_retorna_409(
    client: TestClient, session: Session
):
    """ARCHIVED tambem nao aceita — 409 PROCESS_NOT_PUBLISHED."""
    author, admin, _sector, published, _step, _resource = _setup_published(
        client, session
    )
    archive = client.delete(
        f"/processes/{published['id']}", headers=_auth_headers(admin)
    )
    assert archive.status_code == 200

    response = client.post(
        f"/processes/{published['id']}/propose-edit",
        headers=_auth_headers(author),
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PROCESS_NOT_PUBLISHED"


def test_propose_edit_nao_autor_retorna_403(client: TestClient, session: Session):
    """USER que nao e dono do original -> 403 PROCESS_NOT_OWNED."""
    _author, _admin, _sector, published, _step, _resource = _setup_published(
        client, session
    )
    outro = _create_user(session, email="outro@ifam.edu.br", role=UserRole.USER)

    response = client.post(
        f"/processes/{published['id']}/propose-edit",
        headers=_auth_headers(outro),
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "PROCESS_NOT_OWNED"


def test_propose_edit_admin_nao_autor_retorna_403(client: TestClient, session: Session):
    """Admin tambem recebe 403 — admin edita o original direto, nao usa
    propose-edit. So o autor original tem direito a esse endpoint."""
    _author, _admin, _sector, published, _step, _resource = _setup_published(
        client, session
    )
    outro_admin = _create_user(
        session, email="admin.outro@ifam.edu.br", role=UserRole.ADMIN
    )

    response = client.post(
        f"/processes/{published['id']}/propose-edit",
        headers=_auth_headers(outro_admin),
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "PROCESS_NOT_OWNED"


def test_propose_edit_sem_auth_retorna_401(client: TestClient, session: Session):
    _author, _admin, _sector, published, _step, _resource = _setup_published(
        client, session
    )

    response = client.post(f"/processes/{published['id']}/propose-edit")

    assert response.status_code == 401


def test_propose_edit_processo_inexistente_retorna_404(
    client: TestClient, session: Session
):
    author = _create_user(session, email="autor.404@ifam.edu.br")

    response = client.post(
        f"/processes/{uuid4()}/propose-edit",
        headers=_auth_headers(author),
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROCESS_NOT_FOUND"


# ---------- Bloqueio de mutacoes no ORIGINAL com proposta pendente (6A) ----------


def test_update_processo_com_proposta_pendente_retorna_409(
    client: TestClient, session: Session
):
    """Decisao 6A: admin tentando PATCH no original deve receber 409 com
    o id da proposta nos details, pra UI mostrar 'ver proposta'."""
    author, admin, _sector, published, _step, _resource = _setup_published(
        client, session
    )
    proposal = client.post(
        f"/processes/{published['id']}/propose-edit",
        headers=_auth_headers(author),
    ).json()

    response = client.patch(
        f"/processes/{published['id']}",
        json={"title": "Outro titulo"},
        headers=_auth_headers(admin),
    )

    assert response.status_code == 409
    body = response.json()
    assert body["error"]["code"] == "PROCESS_HAS_PENDING_PROPOSAL"
    assert body["error"]["details"]["proposal_id"] == proposal["id"]


def test_archive_processo_com_proposta_pendente_retorna_409(
    client: TestClient, session: Session
):
    author, admin, _sector, published, _step, _resource = _setup_published(
        client, session
    )
    client.post(
        f"/processes/{published['id']}/propose-edit",
        headers=_auth_headers(author),
    )

    response = client.delete(
        f"/processes/{published['id']}", headers=_auth_headers(admin)
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PROCESS_HAS_PENDING_PROPOSAL"


def test_step_create_no_original_com_proposta_pendente_retorna_409(
    client: TestClient, session: Session
):
    """Tentativa de criar step direto no original (admin) tambem e bloqueada."""
    author, admin, sector, published, _step, _resource = _setup_published(
        client, session
    )
    client.post(
        f"/processes/{published['id']}/propose-edit",
        headers=_auth_headers(author),
    )

    response = client.post(
        f"/processes/{published['id']}/steps",
        json={
            "sector_id": str(sector.id),
            "order": 99,
            "title": "Nova etapa",
            "description": "x",
            "responsible": "y",
            "estimated_time": "1d",
        },
        headers=_auth_headers(admin),
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PROCESS_HAS_PENDING_PROPOSAL"


def test_proposta_em_si_pode_ser_editada(client: TestClient, session: Session):
    """A proposta e DRAFT — autor edita ela normalmente. O bloqueio 6A
    so vale pro original."""
    author, _admin, _sector, published, _step, _resource = _setup_published(
        client, session
    )
    proposal = client.post(
        f"/processes/{published['id']}/propose-edit",
        headers=_auth_headers(author),
    ).json()

    response = client.patch(
        f"/processes/{proposal['id']}",
        json={"title": "Titulo editado na proposta"},
        headers=_auth_headers(author),
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Titulo editado na proposta"
    # Original intocado.
    original = client.get(
        f"/processes/{published['id']}/management",
        headers=_auth_headers(author),
    )
    assert original.json()["title"] == published["title"]


def test_archive_da_proposta_libera_slot_para_nova_proposta(
    client: TestClient, session: Session
):
    """Rejeicao = archive_process(proposta). O service limpa
    proposed_change_for, liberando o unique partial index para uma nova
    proposta."""
    author, _admin, _sector, published, _step, _resource = _setup_published(
        client, session
    )
    first_proposal = client.post(
        f"/processes/{published['id']}/propose-edit",
        headers=_auth_headers(author),
    ).json()

    archive = client.delete(
        f"/processes/{first_proposal['id']}",
        headers=_auth_headers(author),
    )
    assert archive.status_code == 200
    assert archive.json()["status"] == "ARCHIVED"

    # Original deve estar livre pra receber proposta nova agora.
    second_proposal = client.post(
        f"/processes/{published['id']}/propose-edit",
        headers=_auth_headers(author),
    )
    assert second_proposal.status_code == 201
    assert second_proposal.json()["id"] != first_proposal["id"]


# ---------- Submit/approve da proposta ----------


def test_submit_proposta_base_arquivada_retorna_409(
    client: TestClient, session: Session
):
    """Se o original for arquivado entre criar e submeter a proposta, o
    submit falha com PROPOSAL_BASE_NOT_PUBLISHED. Como decisao 6A bloqueia
    o archive normal, o teste forca o status do original via session pra
    simular o cenario.
    """
    author, _admin, _sector, published, _step, _resource = _setup_published(
        client, session
    )
    proposal = client.post(
        f"/processes/{published['id']}/propose-edit",
        headers=_auth_headers(author),
    ).json()

    # Bypass do guard 6A: muta direto via session pra simular race.
    original_row = session.get(Process, UUID(published["id"]))
    assert original_row is not None
    original_row.status = ProcessStatus.ARCHIVED
    original_row.updated_at = datetime.now(timezone.utc)
    session.add(original_row)
    session.commit()

    response = client.post(
        f"/processes/{proposal['id']}/submit-for-review",
        headers=_auth_headers(author),
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PROPOSAL_BASE_NOT_PUBLISHED"


def test_approve_proposta_com_base_arquivada_retorna_409(
    client: TestClient, session: Session
):
    """Defesa em profundidade no approve. Cenario: proposta ja foi para
    IN_REVIEW (admin nao bloqueou ainda) e depois o original some — o
    approve nao pode silenciosamente apagar o que sobrou."""
    author, admin, _sector, published, _step, _resource = _setup_published(
        client, session
    )
    proposal = client.post(
        f"/processes/{published['id']}/propose-edit",
        headers=_auth_headers(author),
    ).json()
    submitted = client.post(
        f"/processes/{proposal['id']}/submit-for-review",
        headers=_auth_headers(author),
    )
    assert submitted.status_code == 200

    # Forca o original pra ARCHIVED via session pra simular race.
    original_row = session.get(Process, UUID(published["id"]))
    assert original_row is not None
    original_row.status = ProcessStatus.ARCHIVED
    original_row.updated_at = datetime.now(timezone.utc)
    session.add(original_row)
    session.commit()

    response = client.post(
        f"/admin/processes/{proposal['id']}/approve",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PROPOSAL_BASE_NOT_PUBLISHED"


# ---------- Merge ID-preserving (decisao 5B) ----------


def test_merge_id_preserving_completo(client: TestClient, session: Session):
    """Ciclo completo do merge: 1 step preservado (renomeado), 1 deletado
    da proposta, 1 novo na proposta. Apos approve, o original tem step
    preservado com o MESMO id (chave do user_progress sobrevive), sem o
    deletado, com o novo (id gerado).
    """
    author, admin, sector, published, step_a, _resource = _setup_published(
        client, session
    )
    # Adiciona step B e step C ao original via withdraw -> edit -> publish
    # ciclo seria longo. Em vez disso, mutamos via session pra inserir
    # mais 2 steps no original publicado (no MVP, admin tambem poderia
    # adicionar steps direto via /processes/{id}/steps em PUBLISHED apos
    # F-27, mas este teste foca no merge — o setup e detalhe).
    original_id = UUID(published["id"])
    step_b_row = FlowStep(
        process_id=original_id,
        sector_id=sector.id,
        order_index=2,
        title="Etapa B",
        description="vai sumir",
        responsible="x",
        estimated_time="1d",
    )
    step_c_row = FlowStep(
        process_id=original_id,
        sector_id=sector.id,
        order_index=3,
        title="Etapa C",
        description="vai ficar",
        responsible="x",
        estimated_time="1d",
    )
    session.add(step_b_row)
    session.add(step_c_row)
    session.commit()
    session.refresh(step_b_row)
    session.refresh(step_c_row)

    original_step_a_id = UUID(step_a["id"])
    original_step_b_id = step_b_row.id
    original_step_c_id = step_c_row.id

    # Cria proposta — vai clonar A, B e C com cloned_from_step_id setado.
    proposal = client.post(
        f"/processes/{published['id']}/propose-edit",
        headers=_auth_headers(author),
    ).json()

    # Lista os steps clonados na proposta (ja com novos ids, mas com
    # cloned_from apontando pros originais).
    proposal_steps = list(
        session.exec(
            select(FlowStep).where(FlowStep.process_id == UUID(proposal["id"]))
        )
    )
    by_clone = {s.cloned_from_step_id: s for s in proposal_steps}
    prop_step_a = by_clone[original_step_a_id]
    prop_step_b = by_clone[original_step_b_id]
    prop_step_c = by_clone[original_step_c_id]
    _ = prop_step_c  # nao mexemos nele

    # Edita: renomeia A na proposta.
    rename = client.patch(
        f"/processes/{proposal['id']}/steps/{prop_step_a.id}",
        json={"title": "Etapa A (renomeada)"},
        headers=_auth_headers(author),
    )
    assert rename.status_code == 200

    # Deleta B da proposta.
    delete_b = client.delete(
        f"/processes/{proposal['id']}/steps/{prop_step_b.id}",
        headers=_auth_headers(author),
    )
    assert delete_b.status_code == 204

    # Adiciona D nova na proposta.
    new_d = client.post(
        f"/processes/{proposal['id']}/steps",
        json={
            "sector_id": str(sector.id),
            "order": 99,
            "title": "Etapa D (nova)",
            "description": "novo",
            "responsible": "x",
            "estimated_time": "1d",
        },
        headers=_auth_headers(author),
    )
    assert new_d.status_code == 201

    # Submete + admin aprova.
    submit = client.post(
        f"/processes/{proposal['id']}/submit-for-review",
        headers=_auth_headers(author),
    )
    assert submit.status_code == 200
    approve = client.post(
        f"/admin/processes/{proposal['id']}/approve",
        headers=_auth_headers(admin),
    )
    assert approve.status_code == 200, approve.text
    final = approve.json()

    # Aprovacao retorna o ORIGINAL (mesmo id), que continua PUBLISHED.
    assert final["id"] == published["id"]
    assert final["status"] == "PUBLISHED"
    assert final["approved_by"] == str(admin.id)
    assert final["proposed_change_for"] is None
    assert final["pending_proposal_id"] is None

    # Proposta foi hard-deletada.
    assert session.get(Process, UUID(proposal["id"])) is None

    # Steps do original: A preservado (mesmo id, novo titulo), C
    # preservado (mesmo id), D adicionado (id novo), B deletado.
    final_steps = list(
        session.exec(select(FlowStep).where(FlowStep.process_id == original_id))
    )
    final_ids = {s.id for s in final_steps}
    assert original_step_a_id in final_ids  # preservou A
    assert original_step_c_id in final_ids  # preservou C
    assert original_step_b_id not in final_ids  # deletou B
    assert len(final_steps) == 3  # A + C + D
    a_after = next(s for s in final_steps if s.id == original_step_a_id)
    assert a_after.title == "Etapa A (renomeada)"
    d_after = next(
        s for s in final_steps if s.id not in {original_step_a_id, original_step_c_id}
    )
    assert d_after.title == "Etapa D (nova)"


def test_merge_preserva_progresso_pessoal(client: TestClient, session: Session):
    """O ponto-chave da decisao 5B: progresso de servidores acompanhando
    o processo nao reseta apos aprovacao da proposta, porque o id da etapa
    e preservado quando ha cloned_from match.
    """
    author, admin, _sector, published, step, _resource = _setup_published(
        client, session
    )
    # Outro USER acompanha o processo e marca a etapa como COMPLETED.
    follower = _create_user(session, email="follower@ifam.edu.br")
    patch_progress = client.patch(
        f"/progress/{published['id']}/steps/{step['id']}",
        json={"status": "COMPLETED"},
        headers=_auth_headers(follower),
    )
    assert patch_progress.status_code == 200, patch_progress.text

    # Autor propoe edicao alterando o titulo da unica etapa (mesmo id no
    # merge — cloned_from_step_id == step['id']).
    proposal = client.post(
        f"/processes/{published['id']}/propose-edit",
        headers=_auth_headers(author),
    ).json()
    [prop_step] = list(
        session.exec(
            select(FlowStep).where(FlowStep.process_id == UUID(proposal["id"]))
        )
    )
    rename = client.patch(
        f"/processes/{proposal['id']}/steps/{prop_step.id}",
        json={"title": "Titulo novo"},
        headers=_auth_headers(author),
    )
    assert rename.status_code == 200
    client.post(
        f"/processes/{proposal['id']}/submit-for-review",
        headers=_auth_headers(author),
    )
    approve = client.post(
        f"/admin/processes/{proposal['id']}/approve",
        headers=_auth_headers(admin),
    )
    assert approve.status_code == 200

    # Apos aprovacao, o GET /progress do follower deve continuar com
    # COMPLETED para a mesma chave de step (id preservado).
    progress = client.get(
        f"/progress/{published['id']}",
        headers=_auth_headers(follower),
    )
    assert progress.status_code == 200
    body = progress.json()
    assert body["step_statuses"][step["id"]] == "COMPLETED"
