#!/usr/bin/env python3
"""Apply this tested candidate to an unchanged v1.7.0 folder, with backup/rollback.

Default is a dry run. No Git commit, push, credentials, settings, or chat writes.
Python 3.9+. Stop SillyTavern before using --apply. See README.md.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import sys
import tempfile
from datetime import datetime, timezone
import uuid


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git_blob(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()


def safe_path(root: Path, relative: str) -> Path:
    rel = PurePosixPath(relative)
    if not relative or rel.is_absolute() or any(p in ("..", "") for p in rel.parts) or "\\" in relative:
        raise ValueError("Unsafe package path: " + relative)
    path = root.joinpath(*rel.parts)
    for candidate in (path, *path.parents):
        if candidate == root:
            break
        if candidate.is_symlink():
            raise ValueError("Refusing symlink in managed path: " + str(candidate))
    if root.resolve() not in path.resolve().parents:
        raise ValueError("Path escapes destination: " + relative)
    return path


def is_original(data: bytes, expected: str) -> bool:
    # Permit ordinary Git autocrlf checkouts without weakening content validation.
    return git_blob(data) == expected or git_blob(data.replace(b"\r\n", b"\n")) == expected


def make_plan(source: Path, target: Path, metadata: dict) -> dict[str, bytes | None]:
    if source.resolve() == target.resolve():
        raise ValueError("Extract the candidate separately from the folder being updated.")
    if not target.is_dir():
        raise ValueError("Target must be an existing extension/repository folder.")
    baseline = metadata["baseline_blobs"]
    for mandatory in ("index.js", "manifest.json"):
        if not safe_path(target, mandatory).is_file():
            raise ValueError("Not an installed extension: missing " + mandatory)
    plan: dict[str, bytes | None] = {}
    for relative, expected in metadata["payload_sha256"].items():
        src = safe_path(source, relative)
        if not src.is_file():
            raise ValueError("Package file is missing: " + relative)
        data = src.read_bytes()
        if sha256(data) != expected:
            raise ValueError("Package checksum mismatch: " + relative)
        dest = safe_path(target, relative)
        if dest.exists():
            if not dest.is_file():
                raise ValueError("Destination is not a file: " + relative)
            old = dest.read_bytes()
            if old == data:
                continue
            if relative not in baseline or not is_original(old, baseline[relative]):
                raise ValueError("Local/newer modifications detected; refusing to overwrite: " + relative)
        plan[relative] = data
    for relative in metadata["retire_tests"]:
        dest = safe_path(target, relative)
        if dest.exists():
            if not dest.is_file() or not is_original(dest.read_bytes(), baseline[relative]):
                raise ValueError("Modified legacy test will not be removed: " + relative)
            plan[relative] = None
    if metadata.get("self_manifest"):
        relative = metadata["self_manifest"]
        data = safe_path(source, relative).read_bytes()
        dest = safe_path(target, relative)
        if dest.exists() and (not dest.is_file() or dest.read_bytes() != data):
            raise ValueError("Existing package metadata differs: " + relative)
        if not dest.exists():
            plan[relative] = data
    return plan


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    mode = stat.S_IMODE(path.stat().st_mode) if path.is_file() else 0o644
    fd, name = tempfile.mkstemp(prefix=".sce171-", dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(name, mode)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def apply_plan(target: Path, plan: dict[str, bytes | None]) -> Path | None:
    if not plan:
        return None
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = target.parent / (target.name + ".before-1.7.1-" + stamp + "-" + uuid.uuid4().hex[:8])
    backup.mkdir(mode=0o700)
    records: dict[str, dict] = {}
    # Back up everything before making any target change.
    for relative, data in plan.items():
        dest = safe_path(target, relative)
        before = dest.read_bytes() if dest.is_file() else None
        records[relative] = {"existed": before is not None,
            "before_sha256": sha256(before) if before is not None else None,
            "after_sha256": sha256(data) if data is not None else None}
        if before is not None:
            archived = safe_path(backup, relative)
            archived.parent.mkdir(parents=True, exist_ok=True)
            archived.write_bytes(before)
    journal = {"schema": 1, "target": str(target.resolve()), "files": records}
    (backup / "RESTORE.json").write_text(json.dumps(journal, indent=2) + "\n", encoding="utf-8")
    touched = []
    try:
        for relative, data in plan.items():
            dest = safe_path(target, relative)
            touched.append(relative)
            if data is None:
                if dest.exists():
                    dest.unlink()
            else:
                atomic_write(dest, data)
    except Exception:
        for relative in reversed(touched):
            dest = safe_path(target, relative)
            if records[relative]["existed"]:
                atomic_write(dest, safe_path(backup, relative).read_bytes())
            elif dest.exists():
                dest.unlink()
        raise
    return backup


def restore(target: Path, backup: Path, apply: bool) -> int:
    journal = json.loads((backup / "RESTORE.json").read_text(encoding="utf-8"))
    if journal.get("schema") != 1 or Path(journal["target"]).resolve() != target.resolve():
        raise ValueError("Backup was not created for this target.")
    plan = {}
    for relative, record in journal["files"].items():
        dest = safe_path(target, relative)
        actual = sha256(dest.read_bytes()) if dest.is_file() else None
        if actual != record["after_sha256"]:
            raise ValueError("File changed after installation; manual merge required: " + relative)
        data = safe_path(backup, relative).read_bytes() if record["existed"] else None
        if data is not None and sha256(data) != record["before_sha256"]:
            raise ValueError("Backup checksum mismatch: " + relative)
        plan[relative] = data
    if apply:
        safety_backup = apply_plan(target, plan)
        print("Restored. Pre-restore backup:", safety_backup)
    else:
        print("Dry run: would restore", len(plan), "paths. Add --apply to proceed.")
    return len(plan)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", type=Path, help="Existing Story Chaos Engine extension folder")
    parser.add_argument("--apply", action="store_true", help="Write changes after validation; otherwise dry-run")
    parser.add_argument("--restore", type=Path, help="Restore an applier-generated backup instead")
    args = parser.parse_args()
    target = args.target.expanduser().resolve()
    if args.restore:
        restore(target, args.restore.expanduser().resolve(), args.apply)
        return 0
    source = Path(__file__).resolve().parents[1]
    metadata = json.loads((source / "release-files.json").read_text(encoding="utf-8"))
    plan = make_plan(source, target, metadata)
    print("Validated candidate 1.7.1 against audited v1.7.0 files.")
    for relative, data in plan.items():
        print(("REPLACE/ADD " if data is not None else "RETIRE TEST ") + relative)
    if not args.apply:
        print("Dry run only. Stop SillyTavern, then add --apply to install.")
        return 0
    backup = apply_plan(target, plan)
    print("Applied." if backup else "Already matches the candidate.")
    if backup:
        print("Backup:", backup)
        print('Rollback: python "' + str(source / "scripts/apply_release.py") + '" "' + str(target) + '" --restore "' + str(backup) + '" --apply')
    print("No Git commit or push was made. Reload SillyTavern after starting it again.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, OSError, KeyError, json.JSONDecodeError) as exc:
        print("Not applied:", exc, file=sys.stderr)
        raise SystemExit(1)
