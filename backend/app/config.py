"""
Centralized application configuration.

All environment-specific values (secrets, DB connection, CORS origins, etc.)
are read from environment variables here so that no source file needs to
hard-code credentials. See backend/.env.example for the full list of
variables the application understands.
"""
import os

from dotenv import load_dotenv

load_dotenv()


def _get_required(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(
            f"Required environment variable '{name}' is not set. "
            f"Copy backend/.env.example to backend/.env and fill it in."
        )
    return value


def _split_csv(value: str) -> list[str]:
    return [origin.strip() for origin in value.split(",") if origin.strip()]


# --- Database -----------------------------------------------------------
DATABASE_URL = _get_required("DATABASE_URL")

# --- JWT / Auth -----------------------------------------------------------
SECRET_KEY = _get_required("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

# --- CORS -----------------------------------------------------------------
# Comma-separated list of allowed origins, e.g.
# "http://localhost:5173,https://darukaa-earth.vercel.app"
CORS_ORIGINS = _split_csv(os.getenv("CORS_ORIGINS", "http://localhost:5173"))
