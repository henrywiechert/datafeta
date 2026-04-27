import { SnapshotMetadata } from '../../types';

export interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
  snapshots: SnapshotMetadata[];
}

export function buildSnapshotTree(snapshots: SnapshotMetadata[]): FolderNode {
  const root: FolderNode = { name: '', path: '', children: [], snapshots: [] };

  for (const snap of snapshots) {
    const folder = snap.folder || '';
    if (!folder) {
      root.snapshots.push(snap);
      continue;
    }

    const segments = folder.split('/');
    let node = root;
    let pathSoFar = '';
    for (const seg of segments) {
      pathSoFar = pathSoFar ? `${pathSoFar}/${seg}` : seg;
      let child = node.children.find((c) => c.name === seg);
      if (!child) {
        child = { name: seg, path: pathSoFar, children: [], snapshots: [] };
        node.children.push(child);
      }
      node = child;
    }
    node.snapshots.push(snap);
  }

  const sortNode = (node: FolderNode) => {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    node.children.forEach(sortNode);
  };
  sortNode(root);

  return root;
}

export function collectAllFolderPaths(node: FolderNode): string[] {
  const paths: string[] = [];
  const walk = (current: FolderNode) => {
    if (current.path) paths.push(current.path);
    current.children.forEach(walk);
  };
  walk(node);
  return paths.sort();
}

export function isFolderEmpty(node: FolderNode): boolean {
  return node.snapshots.length === 0 && node.children.every(isFolderEmpty);
}

export function countSnapshotsInFolder(snapshots: SnapshotMetadata[], folderPath: string): number {
  return snapshots.filter(
    (snapshot) => snapshot.folder === folderPath || snapshot.folder.startsWith(folderPath + '/')
  ).length;
}

export function expandFolderPath(path: string): Set<string> {
  const expanded = new Set<string>();
  if (!path) return expanded;

  const parts = path.split('/');
  let current = '';
  for (const segment of parts) {
    current = current ? `${current}/${segment}` : segment;
    expanded.add(current);
  }
  return expanded;
}

export function buildSnapshotShareUrl(snapshotId: string, origin: string = window.location.origin): string {
  const url = new URL(origin);
  url.searchParams.set('snapshot', snapshotId);
  return url.toString();
}

export function formatSnapshotDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString();
  } catch {
    return isoString;
  }
}
