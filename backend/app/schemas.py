"""
Pydantic schemas used for request validation and response serialization.

Keeping these separate from the SQLAlchemy models means we control exactly
what gets sent back to the client (e.g. password_hash is never exposed).
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: EmailStr
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------
# Projects
# --------------------------------------------------------------------------
class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=2000)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Project name cannot be blank")
        return v


class ProjectOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = ""
    created_by: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------
# Sites
# --------------------------------------------------------------------------
class SiteCreate(BaseModel):
    project_id: int
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=2000)
    geometry: dict

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Site name cannot be blank")
        return v

    @field_validator("geometry")
    @classmethod
    def geometry_not_empty(cls, v: dict) -> dict:
        if not v or "type" not in v or "coordinates" not in v:
            raise ValueError("geometry must be a valid GeoJSON object")
        return v


class SiteOut(BaseModel):
    id: int
    project_id: int
    name: str
    description: Optional[str] = ""
    geometry: dict
    created_at: datetime


class SiteCreateOut(BaseModel):
    id: int
    project_id: int
    name: str
    description: Optional[str] = ""
    message: str


# --------------------------------------------------------------------------
# Site metrics / analytics
# --------------------------------------------------------------------------
class MetricCreate(BaseModel):
    year: int = Field(ge=1900, le=2200)
    carbon_tco2e: int = Field(ge=0)
    biodiversity_score: int = Field(ge=0, le=100)


class MetricOut(BaseModel):
    year: int
    carbon_tco2e: int
    biodiversity_score: int


class SiteSummary(BaseModel):
    id: int
    project_id: int
    name: str
    description: Optional[str] = ""


class CurrentMetrics(BaseModel):
    carbon_tco2e: int
    biodiversity_score: int


class SiteAnalyticsOut(BaseModel):
    site: SiteSummary
    area_hectares: float
    current: CurrentMetrics
    history: list[MetricOut]
