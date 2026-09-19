import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from geoalchemy2.shape import from_shape
from shapely.geometry import shape
from sqlalchemy import func
from sqlalchemy.orm import Session

from .auth import get_current_user
from .database import get_db
from .models import Project, Site, SiteMetric, User
from .schemas import (
    MetricCreate,
    MetricOut,
    SiteAnalyticsOut,
    SiteCreate,
    SiteCreateOut,
)

router = APIRouter(prefix="/sites", tags=["Sites"])


def _get_owned_project(db: Session, project_id: int, current_user: User) -> Project:
    """Return the project only if it belongs to the current user."""
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.created_by == current_user.id)
        .first()
    )

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    return project


def _get_owned_site(db: Session, site_id: int, current_user: User) -> Site:
    """Return the site only if its parent project belongs to the current user."""
    site = (
        db.query(Site)
        .join(Project, Site.project_id == Project.id)
        .filter(Site.id == site_id, Project.created_by == current_user.id)
        .first()
    )

    if not site:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Site not found",
        )

    return site


@router.post("/", response_model=SiteCreateOut, status_code=status.HTTP_201_CREATED)
def create_site(
    site_data: SiteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Ownership check: users may only add sites to their own projects.
    _get_owned_project(db, site_data.project_id, current_user)

    # Convert GeoJSON geometry into a Shapely geometry.
    try:
        polygon = shape(site_data.geometry)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid GeoJSON geometry",
        )

    if polygon.geom_type != "Polygon":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Geometry must be a Polygon",
        )

    if not polygon.is_valid or polygon.is_empty:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Geometry is not a valid, non-empty polygon",
        )

    site = Site(
        project_id=site_data.project_id,
        name=site_data.name,
        description=site_data.description,
        geometry=from_shape(polygon, srid=4326),
    )

    db.add(site)
    db.commit()
    db.refresh(site)

    return SiteCreateOut(
        id=site.id,
        project_id=site.project_id,
        name=site.name,
        description=site.description,
        message="Site created successfully",
    )


@router.get("/")
def get_sites(
    project_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List sites belonging to the current user's projects.

    Optionally filter by project_id (also scoped to the current user).
    """
    query = (
        db.query(
            Site.id,
            Site.project_id,
            Site.name,
            Site.description,
            func.ST_AsGeoJSON(Site.geometry).label("geometry"),
            Site.created_at,
        )
        .join(Project, Site.project_id == Project.id)
        .filter(Project.created_by == current_user.id)
    )

    if project_id is not None:
        query = query.filter(Site.project_id == project_id)

    sites = query.order_by(Site.created_at.desc()).all()

    return [
        {
            "id": site.id,
            "project_id": site.project_id,
            "name": site.name,
            "description": site.description,
            "geometry": json.loads(site.geometry),
            "created_at": site.created_at,
        }
        for site in sites
    ]


@router.get("/{site_id}")
def get_site(
    site_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    site = (
        db.query(
            Site.id,
            Site.project_id,
            Site.name,
            Site.description,
            func.ST_AsGeoJSON(Site.geometry).label("geometry"),
            Site.created_at,
        )
        .join(Project, Site.project_id == Project.id)
        .filter(Site.id == site_id, Project.created_by == current_user.id)
        .first()
    )

    if not site:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Site not found",
        )

    return {
        "id": site.id,
        "project_id": site.project_id,
        "name": site.name,
        "description": site.description,
        "geometry": json.loads(site.geometry),
        "created_at": site.created_at,
    }


@router.post("/{site_id}/metrics", response_model=MetricOut, status_code=status.HTTP_201_CREATED)
def add_metric(
    site_id: int,
    metric_data: MetricCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    site = _get_owned_site(db, site_id, current_user)

    existing = (
        db.query(SiteMetric)
        .filter(SiteMetric.site_id == site.id, SiteMetric.year == metric_data.year)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A metric for year {metric_data.year} already exists for this site",
        )

    metric = SiteMetric(
        site_id=site.id,
        year=metric_data.year,
        carbon_tco2e=metric_data.carbon_tco2e,
        biodiversity_score=metric_data.biodiversity_score,
    )

    db.add(metric)
    db.commit()
    db.refresh(metric)

    return metric


@router.put("/{site_id}/metrics/{year}", response_model=MetricOut)
def update_metric(
    site_id: int,
    year: int,
    metric_data: MetricCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    site = _get_owned_site(db, site_id, current_user)

    if metric_data.year != year:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The metric year in the URL and request body must match",
        )

    metric = (
        db.query(SiteMetric)
        .filter(SiteMetric.site_id == site.id, SiteMetric.year == year)
        .first()
    )

    if not metric:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No metric found for year {year} for this site",
        )

    metric.carbon_tco2e = metric_data.carbon_tco2e
    metric.biodiversity_score = metric_data.biodiversity_score

    db.commit()
    db.refresh(metric)

    return metric


@router.get("/{site_id}/analytics", response_model=SiteAnalyticsOut)
def get_site_analytics(
    site_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    site = _get_owned_site(db, site_id, current_user)

    metrics = (
        db.query(SiteMetric)
        .filter(SiteMetric.site_id == site.id)
        .order_by(SiteMetric.year)
        .all()
    )

    # Area is computed in PostGIS: transform to an equal-area projection
    # (EPSG:6933) before measuring, since ST_Area on raw EPSG:4326 degrees
    # is not a meaningful area unit.
    area = db.query(
        func.ST_Area(func.ST_Transform(Site.geometry, 6933))
    ).filter(Site.id == site.id).scalar()

    area_hectares = round((area or 0) / 10000, 2)

    latest_metric = metrics[-1] if metrics else None

    return {
        "site": {
            "id": site.id,
            "project_id": site.project_id,
            "name": site.name,
            "description": site.description,
        },
        "area_hectares": area_hectares,
        "current": {
            "carbon_tco2e": latest_metric.carbon_tco2e if latest_metric else 0,
            "biodiversity_score": (
                latest_metric.biodiversity_score if latest_metric else 0
            ),
        },
        "history": [
            {
                "year": metric.year,
                "carbon_tco2e": metric.carbon_tco2e,
                "biodiversity_score": metric.biodiversity_score,
            }
            for metric in metrics
        ],
    }
