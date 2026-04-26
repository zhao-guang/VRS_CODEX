from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "GNSS VRS Backend"
    app_version: str = "0.1.0"
    api_prefix: str = "/api/v1"
    debug: bool = True
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    npi_networks_url: str = "https://metadata.gnss.ga.gov.au/api/corsNetworks"
    npi_sites_url: str = "https://metadata.gnss.ga.gov.au/api/corsSites"

    solver_base_url: str = "http://127.0.0.1:8090/solver/v1"
    request_timeout_seconds: float = 30.0

    backend_dir: Path = Path(__file__).resolve().parents[2]
    project_root: Path = backend_dir.parent
    data_dir: Path = backend_dir / "data"
    database_path: Path = data_dir / "gnss_vrs.db"
    rinex_dir: Path = data_dir / "rinex"

    model_config = SettingsConfigDict(
        env_prefix="GNSS_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
