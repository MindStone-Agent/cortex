#!/usr/bin/env python3
"""Cortex — contained Ollama collector.

Some apps run their own Ollama inside a container with no host port (an internal
Docker network), so Cortex can't reach it over HTTP. This collector runs as the Cortex
user (who must be in the `docker` group), reads each `containedOllama` entry in
cortex-config.json with `docker exec <container> ollama ps` (every few seconds) and
`ollama list` (every 30 s), and writes one JSON snapshot per entry to
~/.cache/cortex/contained/<id>.json, atomically. The Cortex web process only reads
those files; it never talks to Docker.

Nothing user-controlled reaches a shell: container names come from cortex-config.json,
are validated, and are passed as an argv list.

A configured container that doesn't exist on this box (Docker answered, and it isn't listed) is
written as present=false, and the dashboard hides it, so one config can ship to boxes with and
without the app. If Docker itself can't be asked (daemon down, no access), every runtime shows that
error instead: a broken instrument never reads as "not installed".

Usage: cortex-contained-ollama.py [--once]
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(os.environ.get("CORTEX_DIR", Path(__file__).resolve().parent.parent))
OUT = Path(os.environ.get("CORTEX_CONTAINED_DIR", Path.home() / ".cache" / "cortex" / "contained"))
INTERVAL = 3.0
LIST_EVERY = 30.0
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")


def targets():
    for name in ("cortex-config.json", "cortex-config.example.json"):
        f = ROOT / name
        if f.exists():
            try:
                cfg = json.loads(f.read_text())
            except (OSError, ValueError):
                continue
            out = []
            for c in cfg.get("containedOllama") or []:
                if (isinstance(c, dict) and ID_RE.match(str(c.get("id", "")))
                        and NAME_RE.match(str(c.get("container", "")))
                        and isinstance(c.get("label"), str) and 0 < len(c["label"]) <= 80):
                    out.append({k: c[k] for k in ("id", "label", "container", "note") if k in c})
            return out
    return []


def parse_table(text):
    """Ollama's CLI tables: a header row, then rows, columns separated by 2+ spaces."""
    lines = [l.rstrip() for l in text.splitlines() if l.strip()]
    if not lines:
        return []
    keys = [k.strip().lower() for k in re.split(r"\s{2,}", lines[0].strip())]
    rows = []
    for line in lines[1:]:
        cells = re.split(r"\s{2,}", line.strip())
        if len(cells) >= 2:
            rows.append(dict(zip(keys, cells)))
    return rows


def container_states():
    """{name: state} for every container on this box. Raises if Docker can't be asked, so a
    broken Docker (daemon down, lost group) shows as an error, never as "not installed"."""
    r = subprocess.run(["docker", "ps", "-a", "--format", "{{.Names}}\t{{.State}}"],
                       capture_output=True, text=True, timeout=10)
    if r.returncode != 0:
        msg = (r.stderr or r.stdout or "").strip().splitlines()
        raise RuntimeError((msg[0] if msg else f"docker ps exit {r.returncode}")[:200])
    states = {}
    for line in r.stdout.splitlines():
        name, _, state = line.partition("\t")
        if name:
            states[name] = state.strip()
    return states


def ollama(container, *args):
    r = subprocess.run(["docker", "exec", container, "ollama", *args],
                       capture_output=True, text=True, timeout=10)
    if r.returncode != 0:
        msg = (r.stderr or r.stdout or "").strip().splitlines()
        raise RuntimeError((msg[0] if msg else f"exit {r.returncode}")[:200])
    return parse_table(r.stdout)


def write(snapshot):
    OUT.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=OUT, prefix=".tmp-")
    with os.fdopen(fd, "w") as f:
        json.dump(snapshot, f)
    os.replace(tmp, OUT / f"{snapshot['id']}.json")


def main():
    once = "--once" in sys.argv
    models, listed_at = {}, {}
    while True:
        now = time.time()
        try:
            states, docker_error = container_states(), None
        except (RuntimeError, subprocess.TimeoutExpired, OSError) as e:
            states, docker_error = None, str(e)[:200] or type(e).__name__
        for t in targets():
            snap = {**t, "checkedAt": now, "present": True, "ok": True, "error": None, "loaded": [],
                    "models": models.get(t["id"], [])}
            try:
                if states is None:
                    raise RuntimeError(f"cannot list containers: {docker_error}")
                if t["container"] not in states:
                    # Not installed on this box (Docker answered, and it isn't there): hidden.
                    snap.update(present=False, ok=False, models=[])
                    write(snap)
                    continue
                if states[t["container"]] != "running":
                    raise RuntimeError(f"container {t['container']} is {states[t['container']] or 'not running'}")
                snap["loaded"] = [
                    {"name": r.get("name", ""), "size": r.get("size", ""), "processor": r.get("processor", ""),
                     "context": r.get("context", ""), "until": r.get("until", "")}
                    for r in ollama(t["container"], "ps")]
                if now - listed_at.get(t["id"], 0) >= LIST_EVERY:
                    models[t["id"]] = [{"name": r.get("name", ""), "size": r.get("size", "")}
                                       for r in ollama(t["container"], "list")]
                    listed_at[t["id"]] = now
                    snap["models"] = models[t["id"]]
            except (RuntimeError, subprocess.TimeoutExpired, OSError) as e:
                snap.update(ok=False, error=str(e)[:200] or type(e).__name__)
            write(snap)
        if once:
            return
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
