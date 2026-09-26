# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""PyInstaller entry script for the Qt desktop shell."""
import sys

from datafeta_qt.app import main

if __name__ == "__main__":
    sys.exit(main())
