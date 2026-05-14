#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import random
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from pathlib import Path


MIN_GAP_SECONDS = 0
SOURCE_START_LOWER = 13 * 3600 + 30 * 60
SOURCE_START_UPPER = 16 * 3600 + 30 * 60
TARGET_START_LOWER = 17 * 3600 + 30 * 60
TARGET_START_UPPER = 19 * 3600 + 30 * 60
TARGET_END_LOWER = 21 * 3600
TARGET_END_UPPER = 23 * 3600
TARGET_SPLIT_FRACTION = 0.35
TARGET_JITTER_SECONDS = 12 * 60
END_OF_DAY = 23 * 3600 + 59 * 60 + 59
EXCLUDED_RANGES = [
    (date(2025, 12, 22), date(2026, 1, 5)),
    (date(2025, 8, 7), date(2025, 9, 1)),
    (date(2026, 4, 3), date(2026, 4, 11)),
]


@dataclass
class CommitRecord:
    commit_id: str
    author_iso: str
    committer_iso: str
    author_dt: datetime
    committer_dt: datetime
    local_date: date
    weekday: int
    threshold_seconds: int | None = None
    target_start_seconds: int | None = None
    target_end_seconds: int | None = None
    reason: str = ""
    shifted: bool = False
    final_author_dt: datetime | None = None
    final_committer_dt: datetime | None = None
    issue: str = ""


def run_git(repo_path: Path, args: list[str], capture_output: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(repo_path), *args],
        check=True,
        text=True,
        capture_output=capture_output,
    )


def load_master_commits(repo_path: Path, branch: str) -> list[CommitRecord]:
    result = run_git(
        repo_path,
        ["log", "--reverse", "--first-parent", f"--format=%H%x00%aI%x00%cI", branch],
    )

    commits: list[CommitRecord] = []
    for line in result.stdout.splitlines():
        if not line:
            continue
        commit_id, author_iso, committer_iso = line.split("\x00")
        author_dt = datetime.fromisoformat(author_iso)
        committer_dt = datetime.fromisoformat(committer_iso)
        commits.append(
            CommitRecord(
                commit_id=commit_id,
                author_iso=author_iso,
                committer_iso=committer_iso,
                author_dt=author_dt,
                committer_dt=committer_dt,
                local_date=committer_dt.date(),
                weekday=committer_dt.weekday(),
            )
        )
    return commits


def is_excluded(commit_date: date) -> bool:
    return any(start <= commit_date <= end for start, end in EXCLUDED_RANGES)


def seconds_since_midnight(value: datetime) -> int:
    return value.hour * 3600 + value.minute * 60 + value.second


def replace_local_time(value: datetime, second_of_day: int) -> datetime:
    hours, remainder = divmod(second_of_day, 3600)
    minutes, seconds = divmod(remainder, 60)
    return value.replace(hour=hours, minute=minutes, second=seconds, microsecond=0)


def build_daily_windows(commits: list[CommitRecord], seed: int) -> dict[date, tuple[int, int, int]]:
    rng = random.Random(seed)
    eligible_dates = sorted(
        {
            commit.local_date
            for commit in commits
            if commit.weekday < 5 and not is_excluded(commit.local_date)
        }
    )
    return {
        commit_date: (
            source_start,
            target_start,
            rng.randint(max(TARGET_END_LOWER, target_start + 2 * 3600), TARGET_END_UPPER),
        )
        for commit_date in eligible_dates
        for source_start in [rng.randint(SOURCE_START_LOWER, SOURCE_START_UPPER)]
        for target_start in [rng.randint(TARGET_START_LOWER, TARGET_START_UPPER)]
    }


def random_time_in_range(rng: random.Random, lower: datetime, upper: datetime) -> datetime:
    if upper < lower:
        raise ValueError("lower bound is after upper bound")
    lower_epoch = int(lower.timestamp())
    upper_epoch = int(upper.timestamp())
    chosen_epoch = rng.randint(lower_epoch, upper_epoch)
    return datetime.fromtimestamp(chosen_epoch, tz=lower.tzinfo)


def as_filter_repo_date(value: datetime) -> str:
    return f"{int(value.timestamp())} {value.strftime('%z')}"


def plan_rewrite(commits: list[CommitRecord], seed: int) -> tuple[dict[date, int], list[CommitRecord]]:
    daily_windows = build_daily_windows(commits, seed)
    rng = random.Random(seed ^ 0x5F3759DF)
    minimum_gap_seconds = MIN_GAP_SECONDS

    for commit in commits:
        commit.final_author_dt = commit.author_dt
        commit.final_committer_dt = commit.committer_dt
        commit.issue = ""
        commit.shifted = False
        commit.threshold_seconds = None
        commit.target_start_seconds = None
        commit.target_end_seconds = None

        if commit.weekday >= 5:
            commit.reason = "excluded-weekend"
        elif is_excluded(commit.local_date):
            commit.reason = "excluded-range"

    for commit_date, window in daily_windows.items():
        source_start, target_start, target_end = window
        day_commits = [commit for commit in commits if commit.local_date == commit_date]
        candidate_commits = [
            commit for commit in day_commits if seconds_since_midnight(commit.committer_dt) < target_end
        ]
        if not candidate_commits:
            for commit in day_commits:
                commit.threshold_seconds = source_start
                commit.target_start_seconds = target_start
                commit.target_end_seconds = target_end
                if commit.reason == "":
                    commit.reason = "after-target-window"
            continue

        earliest_seconds = min(seconds_since_midnight(commit.committer_dt) for commit in candidate_commits)
        previous_assigned_seconds: int | None = None

        for commit in day_commits:
            commit.threshold_seconds = source_start
            commit.target_start_seconds = target_start
            commit.target_end_seconds = target_end

            original_seconds = seconds_since_midnight(commit.committer_dt)
            if original_seconds >= target_end:
                commit.reason = "after-target-window"
                continue

            if earliest_seconds >= source_start:
                denominator = max(1, target_end - earliest_seconds)
                fraction = (original_seconds - earliest_seconds) / denominator
            elif original_seconds <= source_start:
                denominator = max(1, source_start - earliest_seconds)
                fraction = TARGET_SPLIT_FRACTION * ((original_seconds - earliest_seconds) / denominator)
            else:
                denominator = max(1, target_end - source_start)
                fraction = TARGET_SPLIT_FRACTION + (1 - TARGET_SPLIT_FRACTION) * (
                    (original_seconds - source_start) / denominator
                )

            desired_seconds = target_start + round(fraction * (target_end - target_start))
            jitter = rng.randint(-TARGET_JITTER_SECONDS, TARGET_JITTER_SECONDS)
            desired_seconds = max(target_start, min(target_end, desired_seconds + jitter))

            if previous_assigned_seconds is not None:
                desired_seconds = max(desired_seconds, previous_assigned_seconds + minimum_gap_seconds)
            desired_seconds = min(desired_seconds, target_end)

            if previous_assigned_seconds is not None and desired_seconds < previous_assigned_seconds + minimum_gap_seconds:
                commit.reason = "ordering-preserved-nochange"
                commit.issue = (
                    f"Unable to satisfy the {MIN_GAP_SECONDS}-second minimum gap within the target window "
                    "without changing the calendar date or violating commit order."
                )
                previous_assigned_seconds = seconds_since_midnight(commit.final_committer_dt)
                continue

            commit.final_committer_dt = replace_local_time(commit.committer_dt, desired_seconds)
            commit.final_author_dt = replace_local_time(commit.author_dt, desired_seconds)
            commit.shifted = commit.final_committer_dt != commit.committer_dt
            commit.reason = "shifted" if commit.shifted else "within-target-window"
            previous_assigned_seconds = desired_seconds

    return {commit_date: window[0] for commit_date, window in daily_windows.items()}, commits


def write_audit_csv(output_csv: Path, commits: list[CommitRecord]) -> None:
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    with output_csv.open("w", newline="") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(
            [
                "commit_id",
                "author_original",
                "author_rewritten",
                "committer_original",
                "committer_rewritten",
                "local_date",
                "weekday",
                "threshold_local_time",
                "target_start_local_time",
                "target_end_local_time",
                "reason",
                "shifted",
                "issue",
            ]
        )
        for commit in commits:
            threshold_value = ""
            target_start_value = ""
            target_end_value = ""
            if commit.threshold_seconds is not None:
                threshold_value = replace_local_time(commit.committer_dt, commit.threshold_seconds).strftime("%H:%M:%S")
            if commit.target_start_seconds is not None:
                target_start_value = replace_local_time(commit.committer_dt, commit.target_start_seconds).strftime("%H:%M:%S")
            if commit.target_end_seconds is not None:
                target_end_value = replace_local_time(commit.committer_dt, commit.target_end_seconds).strftime("%H:%M:%S")
            writer.writerow(
                [
                    commit.commit_id,
                    commit.author_dt.isoformat(),
                    commit.final_author_dt.isoformat() if commit.final_author_dt else "",
                    commit.committer_dt.isoformat(),
                    commit.final_committer_dt.isoformat() if commit.final_committer_dt else "",
                    commit.local_date.isoformat(),
                    commit.committer_dt.strftime("%A"),
                    threshold_value,
                    target_start_value,
                    target_end_value,
                    commit.reason,
                    str(commit.shifted).lower(),
                    commit.issue,
                ]
            )


def write_mapping_json(output_json: Path, commits: list[CommitRecord]) -> dict[str, dict[str, str]]:
    output_json.parent.mkdir(parents=True, exist_ok=True)
    mapping = {
        commit.commit_id: {
            "author_date": as_filter_repo_date(commit.final_author_dt),
            "committer_date": as_filter_repo_date(commit.final_committer_dt),
        }
        for commit in commits
        if commit.shifted
    }
    output_json.write_text(json.dumps(mapping, indent=2, sort_keys=True))
    return mapping


def verify_plan(commits: list[CommitRecord]) -> list[str]:
    errors: list[str] = []
    minimum_gap = timedelta(seconds=MIN_GAP_SECONDS)
    previous_commit: CommitRecord | None = None

    for commit in commits:
        if commit.final_author_dt is None:
            errors.append(f"{commit.commit_id}: missing final author datetime")
            continue
        if commit.final_committer_dt is None:
            errors.append(f"{commit.commit_id}: missing final committer datetime")
            continue
        if commit.author_dt.date() != commit.final_author_dt.date():
            errors.append(f"{commit.commit_id}: author date changed")
        if commit.committer_dt.date() != commit.final_committer_dt.date():
            errors.append(f"{commit.commit_id}: committer date changed")
        if commit.issue:
            errors.append(f"{commit.commit_id}: {commit.issue}")

        if previous_commit is not None and previous_commit.final_committer_dt is not None:
            gap = commit.final_committer_dt - previous_commit.final_committer_dt
            if gap < minimum_gap:
                errors.append(
                    f"{previous_commit.commit_id}->{commit.commit_id}: committer gap {gap.total_seconds():.0f}s is below {MIN_GAP_SECONDS}s"
                )
        previous_commit = commit

    return errors


def original_gap_violations(commits: list[CommitRecord]) -> list[str]:
    violations: list[str] = []
    minimum_gap = timedelta(seconds=MIN_GAP_SECONDS)
    previous_commit: CommitRecord | None = None

    for commit in commits:
        if previous_commit is not None:
            gap = commit.committer_dt - previous_commit.committer_dt
            if gap < minimum_gap:
                violations.append(
                    f"{previous_commit.commit_id}->{commit.commit_id}: original committer gap {gap.total_seconds():.0f}s"
                )
        previous_commit = commit

    return violations


def ensure_clean_worktree(repo_path: Path) -> None:
    result = run_git(repo_path, ["status", "--porcelain"])
    if result.stdout.strip():
        raise SystemExit("Refusing to rewrite history with a dirty working tree. Commit or stash changes first.")


def create_backup_branch(repo_path: Path, branch: str, backup_branch: str) -> None:
    run_git(repo_path, ["branch", backup_branch, branch], capture_output=False)


def apply_rewrite(repo_path: Path, branch: str, mapping_json: Path) -> None:
    callback_code = f"""
import json
if '_copilot_rewrite_map' not in globals():
    with open({str(mapping_json)!r}, 'r', encoding='utf-8') as handle:
        _copilot_rewrite_map = json.load(handle)
entry = _copilot_rewrite_map.get(commit.original_id.decode())
if entry:
    commit.author_date = entry['author_date'].encode()
    commit.committer_date = entry['committer_date'].encode()
""".strip()

    subprocess.run(
        [
            "git",
            "-C",
            str(repo_path),
            "filter-repo",
            "--force",
            "--refs",
            branch,
            "--commit-callback",
            callback_code,
        ],
        check=True,
        text=True,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Rewrite master commit times with weekday/day-threshold rules and a configurable minimum gap."
    )
    parser.add_argument("--repo", default=".", help="Path to the Git repository")
    parser.add_argument("--branch", default="master", help="Branch to analyze and optionally rewrite")
    parser.add_argument("--seed", type=int, default=20260514, help="Seed for reproducible randomization")
    parser.add_argument(
        "--output-dir",
        default="doc/commit_rewrite",
        help="Directory for the audit CSV and rewrite mapping",
    )
    parser.add_argument(
        "--backup-branch",
        default=None,
        help="Optional backup branch name to create before applying the rewrite",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply the rewrite to the branch with git filter-repo after planning and verification",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    repo_path = Path(args.repo).resolve()
    output_dir = Path(args.output_dir)
    if not output_dir.is_absolute():
        output_dir = repo_path / output_dir

    runtime_output_dir = output_dir
    if args.apply:
        ensure_clean_worktree(repo_path)
        runtime_output_dir = Path(tempfile.mkdtemp(prefix="datafeta-commit-rewrite-"))

    commits = load_master_commits(repo_path, args.branch)
    _, planned_commits = plan_rewrite(commits, args.seed)

    audit_csv = runtime_output_dir / f"{args.branch}_rewrite_audit.csv"
    mapping_json = runtime_output_dir / f"{args.branch}_rewrite_mapping.json"
    write_audit_csv(audit_csv, planned_commits)
    mapping = write_mapping_json(mapping_json, planned_commits)
    errors = verify_plan(planned_commits)
    baseline_violations = original_gap_violations(planned_commits)

    shifted_count = sum(1 for commit in planned_commits if commit.shifted)
    unresolved_count = sum(1 for commit in planned_commits if commit.issue)

    print(f"Audit CSV: {audit_csv}")
    print(f"Rewrite mapping: {mapping_json}")
    print(f"Commits analyzed: {len(planned_commits)}")
    print(f"Commits shifted: {shifted_count}")
    print(f"Commits with unresolved issues: {unresolved_count}")
    print(f"Original adjacent committer gaps under {MIN_GAP_SECONDS}s: {len(baseline_violations)}")

    if errors:
        print("Verification failed:")
        for error in errors[:20]:
            print(f"- {error}")
        if len(errors) > 20:
            print(f"- ... {len(errors) - 20} more")

    if not args.apply:
        print("Dry run only. Re-run with --apply after reviewing the audit CSV.")
        return

    if errors:
        raise SystemExit("Aborting apply because the planned rewrite is not valid.")
    if not mapping:
        raise SystemExit("Aborting apply because no commits qualified for shifting.")

    backup_branch = args.backup_branch
    if backup_branch is None:
        backup_branch = f"backup/pre-time-rewrite-{args.branch}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    create_backup_branch(repo_path, args.branch, backup_branch)
    print(f"Created backup branch: {backup_branch}")

    apply_rewrite(repo_path, args.branch, mapping_json)
    print(f"Applied rewrite to {args.branch}")

    output_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(audit_csv, output_dir / audit_csv.name)
    shutil.copy2(mapping_json, output_dir / mapping_json.name)
    print(f"Copied audit artifacts to {output_dir}")


if __name__ == "__main__":
    main()