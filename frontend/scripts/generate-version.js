#!/usr/bin/env node
/**
 * Generate version information from git
 * Creates a version.json file with git hash and tag info
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function execGit(command) {
  try {
    return execSync(command, { encoding: 'utf8' }).trim();
  } catch (error) {
    console.warn(`Git command failed: ${command}`);
    return null;
  }
}

function getVersion() {
  // Check if we're in a git repository
  const isGitRepo = execGit('git rev-parse --is-inside-work-tree');
  
  if (!isGitRepo) {
    console.log('Not a git repository, using debug version');
    return {
      version: 'debug',
      gitHash: null,
      gitTag: null,
      buildDate: new Date().toISOString()
    };
  }

  // Get the current commit hash (short form, 8 characters)
  const gitHash = execGit('git rev-parse --short=8 HEAD');
  
  // Get tags pointing to current commit that match semantic versioning pattern v*.*.* 
  const gitTag = execGit('git tag --points-at HEAD');
  
  // Find the first tag matching v*.*.* pattern
  let semanticTag = null;
  if (gitTag) {
    const tags = gitTag.split('\n').filter(Boolean);
    semanticTag = tags.find(tag => /^v\d+\.\d+\.\d+$/.test(tag));
  }

  // Determine version: tag takes precedence, then git hash
  const version = semanticTag || gitHash || 'debug';

  return {
    version,
    gitHash,
    gitTag: semanticTag,
    buildDate: new Date().toISOString()
  };
}

// Generate version info
const versionInfo = getVersion();

// Write to public directory so it gets copied to build
const outputPath = path.join(__dirname, '../public/version.json');
fs.writeFileSync(outputPath, JSON.stringify(versionInfo, null, 2));

console.log('Generated version info:', versionInfo);
console.log('Written to:', outputPath);
