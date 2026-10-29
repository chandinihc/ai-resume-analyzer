import io
import json

import pytest
from docx import Document

import app as analyzer


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(analyzer, "DATABASE_PATH", tmp_path / "test.db")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setitem(analyzer.app.config, "SECRET_KEY", "test-session-secret")
    analyzer.init_db()
    analyzer.app.config.update(TESTING=True)
    with analyzer.app.test_client() as test_client:
        yield test_client


def register_user(client, email="student@example.edu", name="Test Student"):
    return client.post(
        "/api/auth/register",
        json={
            "name": name,
            "email": email,
            "password": "CorrectHorseBattery9!",
            "confirm_password": "CorrectHorseBattery9!",
        },
    )


def sample_resume():
    return (
        "Education\nBachelor of Engineering in Computer Science\n"
        "Skills\nPython, JavaScript, React, SQL, Git\n"
        "Projects\nDeveloped a Flask project using Python and SQLite.\n"
        "Experience\nTeamwork and communication."
    )


def test_empty_resume_is_rejected(client):
    register_user(client)
    response = client.post("/api/analyze", json={"resume_text": "  "})
    assert response.status_code == 400
    assert "resume text" in response.get_json()["error"].lower()
    assert client.post("/api/analyze", json=["not", "an object"]).status_code == 400


def test_demo_analysis_returns_scored_evidence_and_saves_history(client):
    register_user(client)
    response = client.post(
        "/api/analyze",
        json={
            "resume_text": sample_resume(),
            "selected_role": "Backend Developer",
            "study_level": "Undergraduate",
            "preferred_domain": "Software development",
            "external_ai_consent": False,
        },
    )
    assert response.status_code == 200
    result = response.get_json()
    assert result["mode"] == "Demo mode"
    assert result["selected_role"] == "Backend Developer"
    assert 0 <= result["resume_score"] <= 100
    assert sum(item["score"] for item in result["score_breakdown"]) == result["resume_score"]
    assert {item["name"] for item in result["skills"]} >= {"Python", "React", "SQL"}
    assert "Python" in result["demonstrated_skills"]
    assert result["recommended_roles"][0]["title"] == "Backend Developer"
    assert result["id"] > 0

    history = client.get("/api/history").get_json()["history"]
    assert len(history) == 1
    assert history[0]["id"] == result["id"]
    detail = client.get(f"/api/history/{result['id']}").get_json()
    assert detail["selected_role"] == "Backend Developer"
    assert sample_resume() not in json.dumps(detail)


def test_unknown_role_and_invalid_preferences_are_rejected(client):
    register_user(client)
    response = client.post(
        "/api/analyze",
        json={
            "resume_text": sample_resume(),
            "selected_role": "Imaginary job",
            "study_level": "Undergraduate",
            "preferred_domain": "Software development",
        },
    )
    assert response.status_code == 400

    response = client.post(
        "/api/analyze",
        json={
            "resume_text": sample_resume(),
            "study_level": "Unsupported",
            "preferred_domain": "Software development",
        },
    )
    assert response.status_code == 400


def test_preferred_domain_ranks_matching_roles_and_explains_match_score(client):
    register_user(client)
    response = client.post(
        "/api/analyze",
        json={
            "resume_text": sample_resume(),
            "study_level": "Undergraduate",
            "preferred_domain": "Data analytics",
        },
    )
    assert response.status_code == 200
    result = response.get_json()
    assert result["selected_role"] == "Data Analyst"
    assert result["recommended_roles"][0]["domain"] == "Data analytics"
    assert "80% core-skill coverage + 20% demonstrated-evidence coverage" in result["recommended_roles"][0]["why"]


def test_consent_requires_configured_provider_key(client):
    register_user(client)
    response = client.post(
        "/api/analyze",
        json={
            "resume_text": sample_resume(),
            "study_level": "Undergraduate",
            "preferred_domain": "Software development",
            "external_ai_consent": True,
        },
    )
    assert response.status_code == 503
    assert "OPENAI_API_KEY" in response.get_json()["error"]


def test_history_can_be_deleted(client):
    register_user(client)
    result = client.post("/api/analyze", json={"resume_text": sample_resume()}).get_json()
    response = client.delete(f"/api/history/{result['id']}")
    assert response.status_code == 200
    assert response.get_json() == {"deleted": True}
    assert client.get("/api/history").get_json()["history"] == []
    assert client.get(f"/api/history/{result['id']}").status_code == 404


def test_unsupported_upload_is_rejected(client):
    register_user(client)
    response = client.post(
        "/api/extract",
        data={"file": (io.BytesIO(b"resume"), "resume.txt")},
        content_type="multipart/form-data",
    )
    assert response.status_code == 400
    assert "PDF or DOCX" in response.get_json()["error"]


def test_invalid_docx_is_rejected(client):
    register_user(client)
    response = client.post(
        "/api/extract",
        data={"file": (io.BytesIO(b"not a document"), "resume.docx")},
        content_type="multipart/form-data",
    )
    assert response.status_code == 400
    assert "valid DOCX" in response.get_json()["error"]


def test_corrupt_pdf_returns_actionable_extraction_error(client):
    register_user(client)
    response = client.post(
        "/api/extract",
        data={"file": (io.BytesIO(b"%PDF-1.4 broken"), "resume.pdf")},
        content_type="multipart/form-data",
    )
    assert response.status_code == 400
    assert "PDF could not be read" in response.get_json()["error"]


def test_oversized_pdf_is_rejected_by_file_size(client):
    register_user(client)
    response = client.post(
        "/api/extract",
        data={"file": (io.BytesIO(b"%PDF-" + b"x" * analyzer.MAX_UPLOAD_BYTES), "resume.pdf")},
        content_type="multipart/form-data",
    )
    assert response.status_code == 400
    assert "5 MB file limit" in response.get_json()["error"]


def make_pdf_with_text():
    content = (
        b"BT /F1 12 Tf 72 720 Td "
        b"(Resume PDF content Education Bachelor Engineering Skills Python SQL Git Projects Developed Python project) Tj ET"
    )
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream",
    ]
    document = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(document))
        document.extend(f"{index} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref_offset = len(document)
    document.extend(f"xref\n0 {len(offsets)}\n".encode())
    document.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        document.extend(f"{offset:010d} 00000 n \n".encode())
    document.extend(
        f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode()
    )
    return bytes(document)


def test_valid_pdf_and_docx_text_can_be_previewed(client):
    register_user(client)
    pdf_response = client.post(
        "/api/extract",
        data={"file": (io.BytesIO(make_pdf_with_text()), "resume.pdf")},
        content_type="multipart/form-data",
    )
    assert pdf_response.status_code == 200
    assert "Resume PDF content" in pdf_response.get_json()["text"]

    document = Document()
    document.add_paragraph("Resume DOCX content")
    docx_file = io.BytesIO()
    document.save(docx_file)
    docx_response = client.post(
        "/api/extract",
        data={"file": (io.BytesIO(docx_file.getvalue()), "resume.docx")},
        content_type="multipart/form-data",
    )
    assert docx_response.status_code == 200
    assert docx_response.get_json()["text"] == "Resume DOCX content"


def test_oversized_resume_is_rejected(client):
    register_user(client)
    response = client.post("/api/analyze", json={"resume_text": "x" * (analyzer.MAX_RESUME_CHARS + 1)})
    assert response.status_code == 400
    assert "characters or fewer" in response.get_json()["error"]


def test_health_and_role_catalog(client):
    assert client.get("/api/health").get_json()["mode"] == "Demo mode"
    register_user(client)
    roles = client.get("/api/roles").get_json()["roles"]
    assert len(roles) >= 8
    assert all(role["required_skills"] for role in roles)


def test_authentication_validates_passwords_hashes_and_persists_session(client):
    assert client.get("/api/history").status_code == 401
    assert client.get("/api/roles").status_code == 401
    assert client.get("/api/auth/me").get_json() == {"user": None, "authenticated": False}
    invalid = client.post(
        "/api/auth/register",
        json={
            "name": "Student",
            "email": "not-an-email",
            "password": "short",
            "confirm_password": "different",
        },
    )
    assert invalid.status_code == 400

    created = register_user(client)
    assert created.status_code == 201
    cookie = created.headers["Set-Cookie"]
    assert "HttpOnly" in cookie
    assert "SameSite=Lax" in cookie
    assert created.get_json()["user"]["email"] == "student@example.edu"
    with analyzer.get_connection() as connection:
        stored = connection.execute(
            "SELECT password_hash FROM users WHERE email = ?", ("student@example.edu",)
        ).fetchone()["password_hash"]
    assert stored != "CorrectHorseBattery9!"
    assert analyzer.check_password_hash(stored, "CorrectHorseBattery9!")
    assert client.get("/api/auth/me").status_code == 200
    assert client.post("/api/auth/logout").get_json()["signed_out"]
    assert client.get("/api/history").status_code == 401


def test_login_rejects_bad_password_and_accepts_valid_credentials(client):
    register_user(client)
    client.post("/api/auth/logout")
    invalid = client.post(
        "/api/auth/login",
        json={"email": "student@example.edu", "password": "wrong password"},
    )
    assert invalid.status_code == 401
    valid = client.post(
        "/api/auth/login",
        json={"email": "STUDENT@example.edu", "password": "CorrectHorseBattery9!"},
    )
    assert valid.status_code == 200
    assert valid.get_json()["user"]["name"] == "Test Student"


def test_profile_can_be_updated(client):
    register_user(client)
    response = client.patch("/api/profile", json={"name": "Updated Student"})
    assert response.status_code == 200
    assert response.get_json()["user"]["name"] == "Updated Student"
    assert client.patch("/api/profile", json={"name": ""}).status_code == 400


def test_duplicate_registration_and_password_confirmation_are_rejected(client):
    register_user(client)
    duplicate = register_user(client)
    assert duplicate.status_code == 409
    mismatch = client.post(
        "/api/auth/register",
        json={
            "name": "Another Student",
            "email": "another@example.edu",
            "password": "CorrectHorseBattery9!",
            "confirm_password": "different",
        },
    )
    assert mismatch.status_code == 400


def test_user_history_is_private_between_accounts(client):
    register_user(client)
    created = client.post("/api/analyze", json={"resume_text": sample_resume()}).get_json()
    client.post("/api/auth/logout")
    register_user(client, email="other@example.edu", name="Other Student")
    assert client.get("/api/history").get_json()["history"] == []
    assert client.get(f"/api/history/{created['id']}").status_code == 404
    assert client.delete(f"/api/history/{created['id']}").status_code == 404


def test_existing_analyses_get_safe_user_id_migration(tmp_path, monkeypatch):
    database = tmp_path / "legacy.db"
    monkeypatch.setattr(analyzer, "DATABASE_PATH", database)
    with analyzer.get_connection() as connection:
        connection.execute(
            """CREATE TABLE analyses (
               id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL,
               selected_role TEXT NOT NULL, resume_score INTEGER NOT NULL,
               mode TEXT NOT NULL, result_json TEXT NOT NULL)"""
        )
        connection.execute(
            "INSERT INTO analyses VALUES (1, '2026-01-01', 'Backend Developer', 20, 'Demo mode', '{}')"
        )
    analyzer.init_db()
    with analyzer.get_connection() as connection:
        row = connection.execute("SELECT id, user_id FROM analyses").fetchone()
    assert row["id"] == 1
    assert row["user_id"] is None
