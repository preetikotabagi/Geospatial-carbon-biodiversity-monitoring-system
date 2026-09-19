from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models  # noqa: F401 -- imported for side effect (table registration)
from .auth import router as auth_router
from .config import CORS_ORIGINS
from .database import Base, engine
from .projects import router as project_router
from .sites import router as site_router

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Darukaa.Earth API",
    description=(
        "Geospatial carbon/biodiversity monitoring API for the "
        "Darukaa.Earth hackathon MVP."
    ),
    version="1.0.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth_router)
app.include_router(project_router)
app.include_router(site_router)


@app.get("/")
def root():
    return {"message": "Darukaa.Earth API is running"}


@app.get("/health")
def health():
    return {"status": "ok"}
