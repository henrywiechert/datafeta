#!/usr/bin/env python3
"""Generate version information from git."""
import subprocess
import json
import re
from datetime import datetime, timezone
from pathlib import Path

def exec_git(command):
    """Execute git command and return output."""
    try:
        result = subprocess.run(
            command.split(),
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None

def get_version():
    """Get version information from git."""
    is_git_repo = exec_git('git rev-parse --is-inside-work-tree')
    
    if not is_git_repo:
        print('Not a git repository, using debug version')
        return {
            'version': 'debug',
            'gitHash': None,
            'gitTag': None,
            'buildDate': datetime.now(timezone.utc).isoformat()
        }
    
    # Get the current commit hash (short form, 8 characters)
    git_hash = exec_git('git rev-parse --short=8 HEAD')
    
    # Get tags pointing to current commit
    git_tag = exec_git('git tag --points-at HEAD')
    
    # Find the first tag matching v*.*.* pattern
    semantic_tag = None
    if git_tag:
        tags = [t for t in git_tag.split('\n') if t]
        for tag in tags:
            if re.match(r'^v\d+\.\d+\.\d+$', tag):
                semantic_tag = tag
                break
    
    # Determine version: tag takes precedence, then git hash
    version = semantic_tag or git_hash or 'debug'
    
    return {
        'version': version,
        'gitHash': git_hash,
        'gitTag': semantic_tag,
        'buildDate': datetime.now(timezone.utc).isoformat()
    }

if __name__ == '__main__':
    version_info = get_version()
    output_path = Path(__file__).parent.parent / 'version.json'
    
    with open(output_path, 'w') as f:
        json.dump(version_info, f, indent=2)
    
    print('Generated version info:', version_info)
    print('Written to:', output_path)
