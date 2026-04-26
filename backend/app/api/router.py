from fastapi import APIRouter

from app.api import analytics, networks, rinex_files, sites, solve_jobs, system

api_router = APIRouter()
api_router.include_router(system.router)
api_router.include_router(networks.router)
api_router.include_router(sites.router)
api_router.include_router(rinex_files.router)
api_router.include_router(analytics.router)
api_router.include_router(solve_jobs.router)
