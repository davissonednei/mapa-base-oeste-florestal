#!/usr/bin/env python3
"""Gera dados de vento para o mapa operacional.

Política de fonte:
1) CPTEC/INPE WRF 7 km (mesma família de produto usada pelo Painel do Fogo),
   extraído dos GRIB2 públicos do CPTEC por HTTP Range.
2) ECMWF IFS 0,25° Open Data, somente como fallback explícito.
3) Se nenhuma fonte passar nos critérios de atualidade, não publica dado novo.

O navegador nunca consulta modelos externos diretamente: ele lê apenas o JSON gerado
por este job, que contém fonte, rodada e horário válido para auditoria operacional.
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

import numpy as np
import requests

OUT = Path("dados/vento/operational_wind.json")
CPTEC_BASE = "https://dataserver.cptec.inpe.br/dataserver_modelos/wrf/ams_07km/brutos"
BBOX = {"south": -14.5, "north": -10.0, "west": -47.5, "east": -42.0}
MAX_POINTS = 3500
TIMEOUT = 30
UA = "CBMBA-20BBM-operational-wind/1.0 (+https://github.com/davissonednei/mapa-base-oeste-florestal)"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA})


@dataclass
class Field:
    lat: np.ndarray
    lon: np.ndarray
    val: np.ndarray


class SourceUnavailable(RuntimeError):
    pass


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def http_get(url: str, *, stream: bool = False, headers: dict | None = None) -> requests.Response:
    r = SESSION.get(url, timeout=TIMEOUT, stream=stream, headers=headers)
    return r


def list_cptec_files(dir_url: str) -> list[tuple[str, datetime, datetime]]:
    try:
        r = http_get(dir_url)
    except requests.RequestException as e:
        raise SourceUnavailable(f"falha HTTP no diretório CPTEC: {e}") from e
    if r.status_code != 200:
        raise SourceUnavailable(f"diretório CPTEC HTTP {r.status_code}")
    out: list[tuple[str, datetime, datetime]] = []
    pattern = re.compile(
        r'href=["\'](WRF_cpt_07KM_(\d{10})_(\d{10})\.grib2\.inv)["\']',
        re.I,
    )
    for fname, run_s, valid_s in pattern.findall(r.text):
        try:
            run = datetime.strptime(run_s, "%Y%m%d%H").replace(tzinfo=timezone.utc)
            valid = datetime.strptime(valid_s, "%Y%m%d%H").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        out.append((fname, run, valid))
    return out


def choose_cptec_candidate(now: datetime) -> tuple[str, str, datetime, datetime]:
    candidates: list[tuple[float, float, str, str, datetime, datetime]] = []
    # O WRF costuma ter 00 UTC e, em alguns dias, 12 UTC. Procura hoje e até 2 dias atrás.
    for back in range(0, 3):
        day = (now - timedelta(days=back)).date()
        for run_hour in (12, 0):
            dir_url = f"{CPTEC_BASE}/{day:%Y/%m/%d}/{run_hour:02d}/"
            try:
                files = list_cptec_files(dir_url)
            except SourceUnavailable:
                continue
            for inv_name, run, valid in files:
                run_age_h = (now - run).total_seconds() / 3600
                valid_delta_h = abs((valid - now).total_seconds()) / 3600
                if run_age_h < -1 or run_age_h > 42:
                    continue
                if valid_delta_h > 2.1:
                    continue
                # Primeiro aproxima o horário válido do momento atual; em empate, prefere rodada mais nova.
                candidates.append((valid_delta_h, run_age_h, dir_url, inv_name, run, valid))
    if not candidates:
        raise SourceUnavailable("nenhum WRF 7 km CPTEC recente com horário válido próximo do momento atual")
    candidates.sort(key=lambda x: (x[0], x[1]))
    _, _, dir_url, inv_name, run, valid = candidates[0]
    return dir_url, inv_name, run, valid


def parse_idx(text: str, grib_url: str) -> dict[str, tuple[int, int]]:
    rows: list[tuple[int, str]] = []
    for line in text.splitlines():
        # Índice padrão wgrib2: numero:byte:d=...:VAR:nivel:...
        m = re.match(r"^\s*\d+:(\d+):(.*)$", line)
        if not m:
            continue
        rows.append((int(m.group(1)), m.group(2)))
    if not rows:
        raise SourceUnavailable("índice GRIB2 CPTEC sem offsets reconhecíveis")

    content_length = None
    try:
        h = SESSION.head(grib_url, timeout=TIMEOUT, allow_redirects=True)
        if h.ok and h.headers.get("Content-Length"):
            content_length = int(h.headers["Content-Length"])
    except Exception:
        pass

    found: dict[str, tuple[int, int]] = {}
    for i, (start, desc) in enumerate(rows):
        up = desc.upper()
        is_10m = bool(re.search(r"(?:^|:)10\s*M(?:\s+ABOVE\s+GROUND)?(?:[:]|$)", up)) or "10 M ABOVE GROUND" in up
        if not is_10m:
            continue
        key = None
        if ":UGRD:" in f":{up}:" or re.search(r"(?:^|:)10U(?:[:]|$)", up):
            key = "u"
        elif ":VGRD:" in f":{up}:" or re.search(r"(?:^|:)10V(?:[:]|$)", up):
            key = "v"
        if not key:
            continue
        if i + 1 < len(rows):
            end = rows[i + 1][0] - 1
        elif content_length:
            end = content_length - 1
        else:
            raise SourceUnavailable("não foi possível determinar o fim da mensagem GRIB2 de vento")
        found[key] = (start, end)
    if set(found) != {"u", "v"}:
        raise SourceUnavailable(f"índice CPTEC não contém U/V a 10 m reconhecíveis: {sorted(found)}")
    return found


def ranged_download(url: str, start: int, end: int, target: Path) -> None:
    headers = {"Range": f"bytes={start}-{end}"}
    try:
        r = http_get(url, stream=True, headers=headers)
    except requests.RequestException as e:
        raise SourceUnavailable(f"falha ao baixar faixa GRIB2: {e}") from e
    if r.status_code != 206:
        r.close()
        raise SourceUnavailable(f"servidor CPTEC não honrou Range (HTTP {r.status_code})")
    with target.open("wb") as f:
        for chunk in r.iter_content(chunk_size=1024 * 256):
            if chunk:
                f.write(chunk)


def read_grib_fields(path: Path) -> list[tuple[str, Field]]:
    try:
        from eccodes import (
            codes_get,
            codes_get_array,
            codes_grib_new_from_file,
            codes_release,
        )
    except Exception as e:
        raise SourceUnavailable(f"ecCodes Python indisponível: {e}") from e

    fields: list[tuple[str, Field]] = []
    with path.open("rb") as f:
        while True:
            gid = codes_grib_new_from_file(f)
            if gid is None:
                break
            try:
                short = str(codes_get(gid, "shortName"))
                lats = np.asarray(codes_get_array(gid, "latitudes"), dtype=float)
                lons = np.asarray(codes_get_array(gid, "longitudes"), dtype=float)
                vals = np.asarray(codes_get_array(gid, "values"), dtype=float)
                lons = np.where(lons > 180.0, lons - 360.0, lons)
                fields.append((short, Field(lats, lons, vals)))
            finally:
                codes_release(gid)
    if not fields:
        raise SourceUnavailable(f"nenhuma mensagem GRIB2 decodificada em {path}")
    return fields


def only_field(path: Path) -> Field:
    fields = read_grib_fields(path)
    # Arquivos por range devem conter uma única mensagem; se houver mais, usa a primeira.
    return fields[0][1]


def extract_points(u: Field, v: Field, *, max_points: int = MAX_POINTS) -> list[dict]:
    if not (len(u.val) == len(v.val) == len(u.lat) == len(v.lat) == len(u.lon) == len(v.lon)):
        raise SourceUnavailable("grades U/V têm tamanhos diferentes")
    if len(u.val) == 0:
        raise SourceUnavailable("grade de vento vazia")
    # Mesma grade é requisito para combinar vetores.
    if np.nanmax(np.abs(u.lat - v.lat)) > 1e-4 or np.nanmax(np.abs(u.lon - v.lon)) > 1e-4:
        raise SourceUnavailable("grades U/V não coincidem")

    mask = (
        np.isfinite(u.lat)
        & np.isfinite(u.lon)
        & np.isfinite(u.val)
        & np.isfinite(v.val)
        & (u.lat >= BBOX["south"])
        & (u.lat <= BBOX["north"])
        & (u.lon >= BBOX["west"])
        & (u.lon <= BBOX["east"])
        & (np.abs(u.val) < 100)
        & (np.abs(v.val) < 100)
    )
    idx = np.flatnonzero(mask)
    if len(idx) < 20:
        raise SourceUnavailable(f"poucos pontos de vento dentro da área operacional: {len(idx)}")
    if len(idx) > max_points:
        step = math.ceil(len(idx) / max_points)
        idx = idx[::step]

    out: list[dict] = []
    for i in idx:
        uu = float(u.val[i])
        vv = float(v.val[i])
        speed_ms = math.hypot(uu, vv)
        direction_from = (math.degrees(math.atan2(-uu, -vv)) + 360.0) % 360.0
        out.append(
            {
                "lat": round(float(u.lat[i]), 5),
                "lng": round(float(u.lon[i]), 5),
                "u_ms": round(uu, 3),
                "v_ms": round(vv, 3),
                "speed_kmh": round(speed_ms * 3.6, 1),
                "direction_from_deg": round(direction_from, 1),
            }
        )
    return out


def cptec_payload(now: datetime) -> dict:
    dir_url, inv_name, run, valid = choose_cptec_candidate(now)
    inv_url = dir_url + inv_name
    grib_name = inv_name.removesuffix(".inv")
    grib_url = dir_url + grib_name

    try:
        r = http_get(inv_url)
    except requests.RequestException as e:
        raise SourceUnavailable(f"falha ao baixar inventário CPTEC: {e}") from e
    if r.status_code != 200:
        raise SourceUnavailable(f"inventário CPTEC HTTP {r.status_code}")
    offsets = parse_idx(r.text, grib_url)

    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        upath = td / "u10.grib2"
        vpath = td / "v10.grib2"
        ranged_download(grib_url, *offsets["u"], upath)
        ranged_download(grib_url, *offsets["v"], vpath)
        u = only_field(upath)
        v = only_field(vpath)
        points = extract_points(u, v)

    return {
        "available": True,
        "operational": True,
        "source_priority": "primary",
        "source": "CPTEC/INPE",
        "model": "WRF 7 km",
        "product": "vento a 10 m",
        "run_utc": iso(run),
        "valid_utc": iso(valid),
        "generated_at_utc": iso(now),
        "resolution": "7 km",
        "bbox": BBOX,
        "point_count": len(points),
        "source_url": grib_url,
        "note": "Previsão numérica CPTEC/INPE. Fonte primária do painel operacional.",
        "points": points,
    }


def ecmwf_payload(now: datetime, cptec_error: str) -> dict:
    try:
        from ecmwf.opendata import Client
    except Exception as e:
        raise SourceUnavailable(f"cliente ECMWF Open Data indisponível: {e}") from e

    client = Client(source="ecmwf", model="ifs", resol="0p25")
    try:
        latest = client.latest(type="fc", step=0, param=["10u", "10v"])
    except Exception as e:
        raise SourceUnavailable(f"falha ao consultar rodada ECMWF: {e}") from e
    if latest is None:
        raise SourceUnavailable("ECMWF não informou rodada disponível")
    if latest.tzinfo is None:
        run = latest.replace(tzinfo=timezone.utc)
    else:
        run = latest.astimezone(timezone.utc)
    run_age_h = (now - run).total_seconds() / 3600
    if run_age_h < -1 or run_age_h > 18:
        raise SourceUnavailable(f"rodada ECMWF fora da janela operacional ({run_age_h:.1f} h)")

    # IFS HRES aberto usa passos de 3 h no curto prazo; pega o horário válido mais próximo de agora.
    raw_step = max(0.0, (now - run).total_seconds() / 3600)
    step = int(round(raw_step / 3.0) * 3)
    step = max(0, min(step, 90))
    valid = run + timedelta(hours=step)
    if abs((valid - now).total_seconds()) > 2.1 * 3600:
        raise SourceUnavailable("ECMWF sem passo válido suficientemente próximo do momento atual")

    with tempfile.TemporaryDirectory() as td:
        target = Path(td) / "ecmwf.grib2"
        try:
            result = client.retrieve(
                date=run.strftime("%Y%m%d"),
                time=run.hour,
                type="fc",
                step=step,
                param=["10u", "10v"],
                target=str(target),
            )
        except Exception as e:
            raise SourceUnavailable(f"falha ao baixar ECMWF 10m: {e}") from e
        fields = read_grib_fields(target)

    u = v = None
    for short, field in fields:
        s = short.lower()
        if s in {"10u", "u10"}:
            u = field
        elif s in {"10v", "v10"}:
            v = field
    if u is None or v is None:
        raise SourceUnavailable(f"ECMWF não retornou 10u/10v; campos: {[x[0] for x in fields]}")
    points = extract_points(u, v, max_points=1500)

    result_dt = getattr(result, "datetime", None)
    if isinstance(result_dt, datetime):
        result_run = result_dt.replace(tzinfo=timezone.utc) if result_dt.tzinfo is None else result_dt.astimezone(timezone.utc)
        run = result_run
        valid = run + timedelta(hours=step)

    return {
        "available": True,
        "operational": True,
        "source_priority": "fallback",
        "source": "ECMWF Open Data",
        "model": "IFS 0.25°",
        "product": "vento a 10 m",
        "run_utc": iso(run),
        "valid_utc": iso(valid),
        "generated_at_utc": iso(now),
        "resolution": "0.25° (~28 km)",
        "bbox": BBOX,
        "point_count": len(points),
        "source_url": "https://data.ecmwf.int/forecasts/",
        "note": "Fallback explícito. Não é o WRF do Painel do Fogo; usado somente quando o CPTEC está indisponível ou fora da janela operacional.",
        "primary_source_error": cptec_error,
        "points": points,
    }


def current_file_is_still_usable(now: datetime) -> bool:
    if not OUT.exists():
        return False
    try:
        data = json.loads(OUT.read_text(encoding="utf-8"))
        if not data.get("available") or not data.get("operational"):
            return False
        valid = datetime.fromisoformat(data["valid_utc"].replace("Z", "+00:00"))
        generated = datetime.fromisoformat(data["generated_at_utc"].replace("Z", "+00:00"))
        return abs((now - valid).total_seconds()) <= 3 * 3600 and (now - generated).total_seconds() <= 3 * 3600
    except Exception:
        return False


def write_json(payload: dict) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def main() -> int:
    now = utcnow()
    cptec_error = ""
    try:
        payload = cptec_payload(now)
        write_json(payload)
        print(f"OK CPTEC: {payload['point_count']} pontos, válido {payload['valid_utc']}")
        return 0
    except Exception as e:
        cptec_error = str(e)
        print(f"CPTEC indisponível: {cptec_error}", file=sys.stderr)

    try:
        payload = ecmwf_payload(now, cptec_error)
        write_json(payload)
        print(f"OK ECMWF fallback: {payload['point_count']} pontos, válido {payload['valid_utc']}")
        return 0
    except Exception as e:
        ecmwf_error = str(e)
        print(f"ECMWF indisponível: {ecmwf_error}", file=sys.stderr)

    # Não substitui um arquivo ainda utilizável por erro transitório. O front-end possui
    # sua própria janela de validade e desabilita automaticamente quando ficar antigo.
    if current_file_is_still_usable(now):
        print("Mantendo último arquivo ainda dentro da janela operacional.")
        return 0

    write_json(
        {
            "available": False,
            "operational": False,
            "generated_at_utc": iso(now),
            "reason": "Nenhuma fonte validada disponível dentro da janela operacional.",
            "cptec_error": cptec_error,
            "ecmwf_error": ecmwf_error,
            "points": [],
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
