// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * usePartSelection - the "Select Parts" step before connect / add-files.
 *
 * When a selection holds multi-part files (e.g. workbooks, as declared by the
 * format catalog) or zips, the files are uploaded once to /stage-files, the
 * user picks parts (only when a file has more than one loadable part), and
 * the result references the staged uploads for connect/addFiles plus the
 * selection to store in ConnectionDetails.file_parts. Other selections pass
 * through untouched as plain files.
 *
 * The page renders <SelectPartsDialog {...partDialogProps} />.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiService } from '../services/api';
import type { StagedSelection, StagedUpload } from '../types';
import { selectablePartNames, PartSelection } from '../components/SelectPartsDialog';
import { useFileFormats } from '../contexts/AppConfigContext';
import { needsStaging } from '../utils/uploadFileTypes';

/** How to send a file selection to connect / add-files. */
export interface ResolvedFiles {
  /** Plain uploads (nothing to pick) */
  files: File[];
  /** Staged uploads with their selected parts */
  staged: StagedSelection[];
  /** Selected parts per filename (for ConnectionDetails.file_parts) */
  fileParts: Record<string, string[]>;
}

interface PendingPick {
  uploads: StagedUpload[];
  resolve: (selection: PartSelection | null) => void;
}

export function buildPartResolution(
  uploads: StagedUpload[],
  picked: PartSelection,
): Pick<ResolvedFiles, 'staged' | 'fileParts'> {
  const staged: StagedSelection[] = [];
  const fileParts: Record<string, string[]> = {};
  for (const upload of uploads) {
    if (upload.parts === null) {
      staged.push({ upload_id: upload.upload_id });
      continue;
    }
    const selectable = selectablePartNames(upload);
    if (selectable.length === 0) {
      // Nothing loadable: let the backend report it for this file.
      staged.push({ upload_id: upload.upload_id });
      continue;
    }
    const parts = picked[upload.upload_id] ?? selectable;
    if (parts.length === 0) continue; // every part unchecked: skip the file
    staged.push({ upload_id: upload.upload_id, parts });
    fileParts[upload.filename] = parts;
  }
  return { staged, fileParts };
}

export function usePartSelection() {
  const formats = useFileFormats();
  // resolveFiles stays stable (memoized consumers such as FieldsPanel ignore
  // callback changes) while still seeing the catalog once app config loads.
  const formatsRef = useRef(formats);
  useEffect(() => {
    formatsRef.current = formats;
  }, [formats]);
  const [pending, setPending] = useState<PendingPick | null>(null);

  /** Resolves to null when the user cancels the part picker. */
  const resolveFiles = useCallback(async (files: File[]): Promise<ResolvedFiles | null> => {
    if (!needsStaging(files, formatsRef.current)) {
      return { files, staged: [], fileParts: {} };
    }

    const { uploads } = await apiService.stageFiles(files);
    const needsPick = uploads.filter((upload) => selectablePartNames(upload).length > 1);

    let picked: PartSelection = {};
    if (needsPick.length > 0) {
      const choice = await new Promise<PartSelection | null>((resolve) => {
        setPending({ uploads: needsPick, resolve });
      });
      setPending(null);
      if (!choice) {
        await apiService.discardStaged().catch((err) => {
          console.warn('Failed to discard staged uploads:', err);
        });
        return null;
      }
      picked = choice;
    }

    const resolution = buildPartResolution(uploads, picked);
    if (resolution.staged.length === 0) {
      await apiService.discardStaged().catch(() => undefined);
      return null;
    }
    return { files: [], ...resolution };
  }, []);

  const partDialogProps = useMemo(() => ({
    open: pending !== null,
    uploads: pending?.uploads ?? NO_UPLOADS,
    onCancel: () => pending?.resolve(null),
    onConfirm: (selection: PartSelection) => pending?.resolve(selection),
  }), [pending]);

  return { resolveFiles, partDialogProps };
}

const NO_UPLOADS: StagedUpload[] = [];
