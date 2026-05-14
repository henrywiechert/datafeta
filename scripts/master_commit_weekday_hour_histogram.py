#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import subprocess
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def get_commit_dates(repo_path: Path, branch: str) -> list[datetime]:
    result = subprocess.run(
        [
            "git",
            "-C",
            str(repo_path),
            "log",
            branch,
            "--pretty=format:%aI",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return [datetime.fromisoformat(line) for line in result.stdout.splitlines() if line.strip()]


def get_commit_dates_from_csv(csv_path: Path, timestamp_column: str) -> list[datetime]:
    with csv_path.open(newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        return [
            datetime.fromisoformat(row[timestamp_column])
            for row in reader
            if row.get(timestamp_column)
        ]


def build_matrix(commit_dates: list[datetime]) -> np.ndarray:
    counts: dict[tuple[int, int], int] = defaultdict(int)
    for commit_date in commit_dates:
        counts[(commit_date.weekday(), commit_date.hour)] += 1

    matrix = np.zeros((7, 24), dtype=int)
    for (weekday, hour), count in counts.items():
        matrix[weekday, hour] = count
    return matrix


def week_start_for_commit(commit_date: datetime) -> date:
    return commit_date.date() - timedelta(days=commit_date.weekday())


def build_weekly_matrix(commit_dates: list[datetime]) -> tuple[np.ndarray, list[date]]:
    if not commit_dates:
        return np.zeros((0, 24), dtype=int), []

    counts: dict[tuple[date, int, int], int] = defaultdict(int)
    first_week = week_start_for_commit(min(commit_dates))
    last_week = week_start_for_commit(max(commit_dates))

    week_starts: list[date] = []
    current_week = first_week
    while current_week <= last_week:
        week_starts.append(current_week)
        current_week += timedelta(days=7)

    for commit_date in commit_dates:
        counts[(week_start_for_commit(commit_date), commit_date.weekday(), commit_date.hour)] += 1

    matrix = np.zeros((len(week_starts) * len(WEEKDAYS), 24), dtype=int)
    for week_index, week_start in enumerate(week_starts):
        for weekday_index in range(len(WEEKDAYS)):
            row_index = week_index * len(WEEKDAYS) + weekday_index
            for hour in range(24):
                matrix[row_index, hour] = counts[(week_start, weekday_index, hour)]
    return matrix, week_starts


def write_csv(output_csv: Path, matrix: np.ndarray, mode: str, week_starts: list[date] | None = None) -> None:
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    with output_csv.open("w", newline="") as csv_file:
        writer = csv.writer(csv_file)
        if mode == "aggregate":
            writer.writerow(["weekday", *range(24)])
            for weekday_index, weekday_name in enumerate(WEEKDAYS):
                writer.writerow([weekday_name, *matrix[weekday_index].tolist()])
            return

        writer.writerow(["week_start", "weekday", *range(24)])
        assert week_starts is not None
        for week_index, week_start in enumerate(week_starts):
            for weekday_index, weekday_name in enumerate(WEEKDAYS):
                row_index = week_index * len(WEEKDAYS) + weekday_index
                writer.writerow([week_start.isoformat(), weekday_name, *matrix[row_index].tolist()])


def render_heatmap(
    output_png: Path,
    matrix: np.ndarray,
    branch: str,
    commit_count: int,
    mode: str,
    week_starts: list[date] | None = None,
) -> None:
    output_png.parent.mkdir(parents=True, exist_ok=True)

    if mode == "weekly":
        week_count = len(week_starts or [])
        fig_height = min(max(10, week_count * 0.45), 42)
    else:
        fig_height = 5.5

    fig, ax = plt.subplots(figsize=(16, fig_height))
    image = ax.imshow(matrix, cmap="Blues", aspect="auto")

    ax.set_xticks(range(24))
    ax.set_xticklabels([f"{hour:02d}" for hour in range(24)])
    ax.set_xlabel("Hour of day")
    if mode == "aggregate":
        ax.set_yticks(range(len(WEEKDAYS)))
        ax.set_yticklabels(WEEKDAYS)
        ax.set_ylabel("Weekday")
        ax.set_title(f"Commit histogram for {branch} by weekday and hour ({commit_count} commits)")

        max_value = int(matrix.max())
        for weekday_index in range(matrix.shape[0]):
            for hour_index in range(matrix.shape[1]):
                value = int(matrix[weekday_index, hour_index])
                if value:
                    color = "white" if value >= max_value * 0.55 else "black"
                    ax.text(hour_index, weekday_index, str(value), ha="center", va="center", fontsize=7, color=color)
    else:
        assert week_starts is not None
        label_step = max(1, int(np.ceil(len(week_starts) / 30)))
        tick_positions = []
        tick_labels = []
        for week_index, week_start in enumerate(week_starts):
            start_row = week_index * len(WEEKDAYS)
            ax.axhline(start_row - 0.5, color="white", linewidth=0.35)
            if week_index % label_step == 0:
                tick_positions.append(start_row + 3)
                tick_labels.append(week_start.isoformat())

        ax.axhline(matrix.shape[0] - 0.5, color="white", linewidth=0.35)
        ax.set_yticks(tick_positions)
        ax.set_yticklabels(tick_labels, fontsize=8)
        ax.set_ylabel("Week start (rows within each block are Mon..Sun)")
        ax.set_title(
            f"Weekly commit histogram for {branch} by weekday and hour ({commit_count} commits)"
        )

    colorbar = fig.colorbar(image, ax=ax)
    colorbar.set_label("Commit count")
    fig.tight_layout()
    fig.savefig(output_png, dpi=200)
    plt.close(fig)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a weekday/hour commit histogram for a Git branch.")
    parser.add_argument("--repo", default=".", help="Path to the Git repository")
    parser.add_argument("--branch", default="master", help="Branch to analyze")
    parser.add_argument(
        "--input-csv",
        default=None,
        help="Optional CSV input file to use instead of git log, e.g. a rewrite audit CSV.",
    )
    parser.add_argument(
        "--timestamp-column",
        default="committer_rewritten",
        help="Timestamp column to read when --input-csv is provided.",
    )
    parser.add_argument(
        "--mode",
        choices=["aggregate", "weekly"],
        default="aggregate",
        help="Whether to aggregate across all weeks or render every calendar week separately.",
    )
    parser.add_argument(
        "--output-prefix",
        default=None,
        help="Output path prefix without extension",
    )
    parser.add_argument(
        "--label",
        default=None,
        help="Optional label for chart titles when reading from CSV.",
    )
    args = parser.parse_args()

    repo_path = Path(args.repo).resolve()
    csv_path = None
    source_label = args.branch
    if args.input_csv is not None:
        csv_path = Path(args.input_csv)
        if not csv_path.is_absolute():
            csv_path = repo_path / csv_path
        source_label = args.label or csv_path.stem

    if args.output_prefix is None:
        output_base = source_label.replace(" ", "_")
        output_prefix = Path(f"doc/commit_histograms/{output_base}_{args.mode}_weekday_hour_commits")
    else:
        output_prefix = Path(args.output_prefix)
    if not output_prefix.is_absolute():
        output_prefix = repo_path / output_prefix

    if csv_path is None:
        commit_dates = get_commit_dates(repo_path, args.branch)
    else:
        commit_dates = get_commit_dates_from_csv(csv_path, args.timestamp_column)
    if args.mode == "aggregate":
        matrix = build_matrix(commit_dates)
        week_starts = None
    else:
        matrix, week_starts = build_weekly_matrix(commit_dates)

    write_csv(output_prefix.with_suffix(".csv"), matrix, args.mode, week_starts)
    render_heatmap(output_prefix.with_suffix(".png"), matrix, source_label, len(commit_dates), args.mode, week_starts)

    busiest_index = np.unravel_index(np.argmax(matrix), matrix.shape)
    busiest_row = int(busiest_index[0])
    busiest_weekday = WEEKDAYS[busiest_row % len(WEEKDAYS)]
    busiest_hour = int(busiest_index[1])
    busiest_count = int(matrix[busiest_index])

    print(f"Generated: {output_prefix.with_suffix('.csv')}")
    print(f"Generated: {output_prefix.with_suffix('.png')}")
    print(f"Total commits: {len(commit_dates)}")
    if args.mode == "aggregate":
        print(f"Busiest slot: {busiest_weekday} {busiest_hour:02d}:00 with {busiest_count} commits")
    else:
        assert week_starts is not None
        busiest_week_index = busiest_row // len(WEEKDAYS)
        print(
            "Busiest slot: "
            f"week of {week_starts[busiest_week_index].isoformat()} {busiest_weekday} "
            f"{busiest_hour:02d}:00 with {busiest_count} commits"
        )


if __name__ == "__main__":
    main()
