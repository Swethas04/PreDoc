from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.database import Base, get_db
from app.main import app

# Single shared in-memory SQLite engine with StaticPool for all unit test suites
TEST_DB_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


# Ensure tables exist
Base.metadata.create_all(bind=test_engine)
app.dependency_overrides[get_db] = override_get_db

from app.models.user import User
from app.services.auth import get_current_staff, require_doctor

_test_doctor = User(id=1, username="test_doctor", role="doctor", password_hash="hash")

app.dependency_overrides[get_current_staff] = lambda: _test_doctor
app.dependency_overrides[require_doctor] = lambda: _test_doctor
