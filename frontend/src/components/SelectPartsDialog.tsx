// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * SelectPartsDialog - pick which parts of uploaded multi-part files become
 * tables (e.g. the sheets of a workbook).
 *
 * One group per file with a select-all checkbox. Selectable parts start
 * checked; parts that cannot be loaded (hidden or chart sheets, ...) are
 * listed but disabled. Wording follows each file format's part label.
 */
import React from 'react';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Typography,
} from '@mui/material';
import type { StagedUpload } from '../types';

/** Selected part names per upload id. */
export type PartSelection = Record<string, string[]>;

interface SelectPartsDialogProps {
  open: boolean;
  uploads: StagedUpload[];
  onCancel: () => void;
  onConfirm: (selection: PartSelection) => void;
}

const compactCheckboxLabelSx = {
  mx: 0,
  '& .MuiFormControlLabel-label': { fontSize: '0.75rem' },
} as const;

export function selectablePartNames(upload: StagedUpload): string[] {
  return (upload.parts ?? []).filter((part) => part.selectable).map((part) => part.name);
}

function initialSelection(uploads: StagedUpload[]): PartSelection {
  return Object.fromEntries(uploads.map((upload) => [upload.upload_id, selectablePartNames(upload)]));
}

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** "sheet" when every upload names its parts the same, else the neutral "part". */
function commonPartLabel(uploads: StagedUpload[]): string {
  const labels = new Set(uploads.map((upload) => upload.part_label ?? 'part'));
  return labels.size === 1 ? Array.from(labels)[0] : 'part';
}

export function SelectPartsDialog({ open, uploads, onCancel, onConfirm }: SelectPartsDialogProps) {
  const [selection, setSelection] = React.useState<PartSelection>(() => initialSelection(uploads));

  React.useEffect(() => {
    setSelection(initialSelection(uploads));
  }, [uploads]);

  const togglePart = (uploadId: string, part: string) => {
    setSelection((prev) => {
      const current = prev[uploadId] ?? [];
      const next = current.includes(part)
        ? current.filter((name) => name !== part)
        : [...current, part];
      return { ...prev, [uploadId]: next };
    });
  };

  const toggleUpload = (upload: StagedUpload, select: boolean) => {
    setSelection((prev) => ({
      ...prev,
      [upload.upload_id]: select ? selectablePartNames(upload) : [],
    }));
  };

  const handleConfirm = () => {
    // Keep each file's parts in file order, whatever the click order was.
    const ordered = Object.fromEntries(uploads.map((upload) => {
      const chosen = new Set(selection[upload.upload_id] ?? []);
      return [upload.upload_id, selectablePartNames(upload).filter((name) => chosen.has(name))];
    }));
    onConfirm(ordered);
  };

  const label = commonPartLabel(uploads);
  const selectedCount = Object.values(selection).reduce((sum, names) => sum + names.length, 0);
  const plural = selectedCount === 1 ? '' : 's';

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      fullWidth
      maxWidth="sm"
      PaperProps={{ sx: { maxWidth: 520 } }}
      aria-labelledby="select-parts-title"
    >
      <DialogTitle id="select-parts-title">Select {capitalize(label)}s</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Each selected {label} becomes a table.
        </Typography>
        <Box sx={{ maxHeight: 360, overflowY: 'auto' }}>
          {uploads.map((upload) => {
            const selectable = selectablePartNames(upload);
            const selected = selection[upload.upload_id] ?? [];
            const allSelected = selectable.length > 0 && selected.length === selectable.length;

            return (
              <Box key={upload.upload_id} sx={{ mb: 1 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={allSelected}
                      indeterminate={selected.length > 0 && !allSelected}
                      disabled={selectable.length === 0}
                      onChange={() => toggleUpload(upload, !allSelected)}
                      sx={{ py: 0.25 }}
                      inputProps={{ 'aria-label': `All ${upload.part_label ?? 'part'}s of ${upload.filename}` }}
                    />
                  }
                  label={upload.filename}
                  sx={{
                    mx: 0,
                    '& .MuiFormControlLabel-label': { fontSize: '0.75rem', fontWeight: 600 },
                  }}
                />
                <Stack sx={{ pl: 3 }}>
                  {(upload.parts ?? []).map((part) => (
                    <FormControlLabel
                      key={part.name}
                      control={
                        <Checkbox
                          size="small"
                          checked={part.selectable && selected.includes(part.name)}
                          disabled={!part.selectable}
                          onChange={() => togglePart(upload.upload_id, part.name)}
                          sx={{ py: 0.25 }}
                        />
                      }
                      label={part.selectable ? part.name : `${part.name} (${part.reason ?? 'unavailable'})`}
                      sx={compactCheckboxLabelSx}
                    />
                  ))}
                </Stack>
              </Box>
            );
          })}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={onCancel}>Cancel</Button>
        <Button
          size="small"
          onClick={handleConfirm}
          variant="outlined"
          disabled={selectedCount === 0}
        >
          {selectedCount > 0
            ? `Load ${selectedCount} ${capitalize(label)}${plural}`
            : `Load ${capitalize(label)}s`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default SelectPartsDialog;
