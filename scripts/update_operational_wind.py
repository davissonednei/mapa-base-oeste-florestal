#!/usr/bin/env python3
"""Gera o vento operacional usando EXCLUSIVAMENTE a API oficial do Painel do Fogo.

Fonte consumida:
  GET https://panorama.sipam.gov.br/painel-do-fogo/api/v1/meteorologia/wrf/vento

A API entrega os dois componentes do vento a 10 m (UGRD/VGRD), convertidos do
GRIB2 para JSON, e informa o horário do prognóstico no header X-Wind-Date.

Regra de segurança operacional: não há fallback meteorológico. Se a API oficial
não estiver disponível, o arquivo é marcado como indisponível e o botão de vento
do mapa deve permanecer desabilitado.
"""
from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

OUT = Path("dados/vento/operational_wind.json")
CENSIPAM_WIND_URL = "https://panorama.sipam.gov.br/painel-do-fogo/api/v1/meteorologia/wrf/vento"
BBOX = {"south": -14.5, "north": -10.0, "west": -47.5, "east": -42.0}
TIMEOUT = 180
MAX_VALID_DELTA_SECONDS = 3 * 60 * 60
UA = "CBMBA-20BBM-operational-wind/2.0 (+https://github.com/davissonednei/mapa-base-oeste-florestal)"

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA, "Accept": "application/json"})


class SourceUnavailable(RuntimeError):
    pass


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_iso(value: str) -> datetime:
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception as e:
        raise SourceUnavailable(f"data/hora inválida na API oficial: {value!r}") from e
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def normalize_lon(lon: float) -> float:
    return lon - 360.0 if lon > 180.0 else lon


def finite_number(value) -> float | None:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if math.isfinite(n) else None


def identify_components(payload: list[dict]) -> tuple[dict, dict]:
    u = v = None
    for obj in payload:
        if not isinstance(obj, dict):
            continue
        h = obj.get("header") or {}
        name = str(h.get("parameterNumberName") or "").lower()
        number = h.get("parameterNumber")
        if "u-component" in name or number == 2:
            u = obj
        elif "v-component" in name or number == 3:
            v = obj
    if u is None or v is None:
        raise SourceUnavailable("a API oficial não retornou simultaneamente UGRD e VGRD")
    return u, v


def validate_grid(u_obj: dict, v_obj: dict) -> dict:
    uh = u_obj.get("header") or {}
    vh = v_obj.get("header") or {}

    required = ["nx", "ny", "lo1", "la1", "lo2", "la2", "dx", "dy", "scanMode", "surface1Value"]
    missing = [k for k in required if k not in uh or k not in vh]
    if missing:
        raise SourceUnavailable(f"metadados de grade ausentes na API oficial: {missing}")

    for k in required:
        if uh.get(k) != vh.get(k):
            raise SourceUnavailable(f"grades U/V divergentes no campo {k}")

    if float(uh["surface1Value"]) != 10.0:
        raise SourceUnavailable("a API oficial não retornou vento a 10 m")
    if str(uh.get("gridDefinitionTemplateName", "")).lower() != "latitude_longitude":
        raise SourceUnavailable("grade oficial não é latitude/longitude regular")

    nx = int(uh["nx"])
    ny = int(uh["ny"])
    if nx <= 0 or ny <= 0:
        raise SourceUnavailable("dimensões inválidas da grade oficial")

    udata = u_obj.get("data")
    vdata = v_obj.get("data")
    if not isinstance(udata, list) or not isinstance(vdata, list):
        raise SourceUnavailable("arrays U/V ausentes na resposta oficial")
    expected = nx * ny
    if len(udata) != expected or len(vdata) != expected:
        raise SourceUnavailable(
            f"tamanho U/V incompatível com a grade: esperado {expected}, recebido {len(udata)}/{len(vdata)}"
        )

    # A API atualmente publica scanMode=64: longitude cresce para leste e latitude cresce para norte.
    # Em caso de mudança estrutural, falha fechado em vez de interpretar a grade de forma arriscada.
    scan_mode = int(uh["scanMode"])
    if scan_mode != 64:
        raise SourceUnavailable(f"scanMode oficial inesperado ({scan_mode}); vento desabilitado por segurança")

    return {
        "nx": nx,
        "ny": ny,
        "lon1": normalize_lon(float(uh["lo1"])),
        "lat1": float(uh["la1"]),
        "lon2": normalize_lon(float(uh["lo2"])),
        "lat2": float(uh["la2"]),
        "dx": abs(float(uh["dx"])),
        "dy": abs(float(uh["dy"])),
        "scan_mode": scan_mode,
        "udata": udata,
        "vdata": vdata,
        "run": parse_iso(uh["refTime"]),
        "forecast_hours": float(uh.get("forecastTime", 0)),
    }


def extract_bbox_points(grid: dict) -> list[dict]:
    nx = grid["nx"]
    ny = grid["ny"]
    lon1 = grid["lon1"]
    lat1 = grid["lat1"]
    dx = grid["dx"]
    dy = grid["dy"]
    udata = grid["udata"]
    vdata = grid["vdata"]

    i0 = max(0, math.ceil((BBOX["west"] - lon1) / dx))
    i1 = min(nx - 1, math.floor((BBOX["east"] - lon1) / dx))
    j0 = max(0, math.ceil((BBOX["south"] - lat1) / dy))
    j1 = min(ny - 1, math.floor((BBOX["north"] - lat1) / dy))

    if i0 > i1 or j0 > j1:
        raise SourceUnavailable("área operacional fora da grade oficial de vento")

    points: list[dict] = []
    for j in range(j0, j1 + 1):
        lat = lat1 + j * dy
        row = j * nx
        for i in range(i0, i1 + 1):
            lng = lon1 + i * dx
            idx = row + i
            u = finite_number(udata[idx])
            v = finite_number(vdata[idx])
            if u is None or v is None:
                continue
            if abs(u) >= 100 or abs(v) >= 100:
                continue
            speed_ms = math.hypot(u, v)
            direction_from = (math.degrees(math.atan2(-u, -v)) + 360.0) % 360.0
            points.append(
                {
                    "lat": round(lat, 5),
                    "lng": round(lng, 5),
                    "u_ms": round(u, 3),
                    "v_ms": round(v, 3),
                    "speed_kmh": round(speed_ms * 3.6, 1),
                    "direction_from_deg": round(direction_from, 1),
                }
            )

    if len(points) < 100:
        raise SourceUnavailable(f"poucos vetores oficiais dentro da área operacional: {len(points)}")
    return points


def official_payload(now: datetime) -> dict:
    try:
        response = SESSION.get(CENSIPAM_WIND_URL, timeout=TIMEOUT)
    except requests.RequestException as e:
        raise SourceUnavailable(f"falha ao acessar API oficial do Painel do Fogo: {e}") from e

    if response.status_code == 404:
        raise SourceUnavailable("dados meteorológicos oficiais de vento não disponíveis (HTTP 404)")
    if response.status_code != 200:
        raise SourceUnavailable(f"API oficial de vento respondeu HTTP {response.status_code}")

    wind_date_raw = response.headers.get("X-Wind-Date") or response.headers.get("x-wind-date")
    if not wind_date_raw:
        raise SourceUnavailable("header X-Wind-Date ausente na resposta oficial")
    valid = parse_iso(wind_date_raw)

    if abs((now - valid).total_seconds()) > MAX_VALID_DELTA_SECONDS:
        raise SourceUnavailable(f"prognóstico oficial fora da janela operacional: {iso(valid)}")

    try:
        payload = response.json()
    except Exception as e:
        raise SourceUnavailable("resposta oficial de vento não é JSON válido") from e

    if not isinstance(payload, list) or len(payload) != 2:
        raise SourceUnavailable("estrutura inesperada da API oficial de vento")

    u_obj, v_obj = identify_components(payload)
    grid = validate_grid(u_obj, v_obj)

    calculated_valid = grid["run"] + __import__("datetime").timedelta(hours=grid["forecast_hours"])
    if abs((calculated_valid - valid).total_seconds()) > 60:
        raise SourceUnavailable(
            f"X-Wind-Date diverge do prognóstico interno do GRIB: {iso(valid)} vs {iso(calculated_valid)}"
        )

    points = extract_bbox_points(grid)

    return {
        "available": True,
        "operational": True,
        "source_priority": "primary",
        "source": "CPTEC/INPE",
        "delivery_source": "CENSIPAM Painel do Fogo API",
        "model": "WRF 7 km",
        "product": "UGRD/VGRD a 10 m",
        "run_utc": iso(grid["run"]),
        "valid_utc": iso(valid),
        "generated_at_utc": iso(now),
        "resolution": f"{grid['dx']:.2f}° (~7 km)",
        "bbox": BBOX,
        "point_count": len(points),
        "source_url": CENSIPAM_WIND_URL,
        "api_x_wind_date": wind_date_raw,
        "note": "Vento obtido diretamente da API oficial usada pelo Painel do Fogo. Sem fallback meteorológico.",
        "points": points,
    }


def current_file_is_still_usable(now: datetime) -> bool:
    if not OUT.exists():
        return False
    try:
        data = json.loads(OUT.read_text(encoding="utf-8"))
        if not data.get("available") or not data.get("operational"):
            return False
        if data.get("source_url") != CENSIPAM_WIND_URL:
            return False
        valid = parse_iso(data["valid_utc"])
        return abs((now - valid).total_seconds()) <= MAX_VALID_DELTA_SECONDS
    except Exception:
        return False


def write_json(payload: dict) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def main() -> int:
    now = utcnow()
    try:
        payload = official_payload(now)
        write_json(payload)
        print(
            f"OK Painel do Fogo: {payload['point_count']} vetores oficiais, "
            f"rodada {payload['run_utc']}, válido {payload['valid_utc']}"
        )
        return 0
    except Exception as e:
        error = str(e)
        print(f"Vento oficial indisponível: {error}", file=sys.stderr)

    # Mantém somente um arquivo ANTERIOR da própria API oficial enquanto ele ainda
    # estiver dentro da janela operacional. Nunca reaproveita ECMWF/GFS/outro modelo.
    if current_file_is_still_usable(now):
        print("Mantendo a última leitura da própria API oficial ainda válida.")
        return 0

    write_json(
        {
            "available": False,
            "operational": False,
            "generated_at_utc": iso(now),
            "source_url": CENSIPAM_WIND_URL,
            "reason": "Vento oficial do Painel do Fogo temporariamente indisponível.",
            "error": error,
            "points": [],
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
