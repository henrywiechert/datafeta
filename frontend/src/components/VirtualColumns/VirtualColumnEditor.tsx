// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  Select,
  MenuItem,
  Box,
  Typography,
  Alert,
  Collapse,
  Autocomplete,
  IconButton,
  Tooltip,
} from '@mui/material';
import FunctionsIcon from '@mui/icons-material/Functions';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import { VirtualColumnDefinition } from '../../types';

interface VirtualColumnEditorProps {
  open: boolean;
  column: VirtualColumnDefinition | null;
  availableColumns: string[];
  existingNames: string[];
  onSave: (column: VirtualColumnDefinition) => void;
  onCancel: () => void;
}

/**
 * Output type selection.
 *
 * `link` is a presentation choice rather than a data type: it is stored as
 * `output_type: 'text'` plus the display-only `link` flag, so it never reaches
 * SQL. Folding it into this dropdown keeps the render decision next to the type
 * decision instead of costing a separate checkbox row.
 */
type OutputTypeChoice = '' | 'numeric' | 'text' | 'datetime' | 'link';

const OUTPUT_TYPE_HINTS: Record<OutputTypeChoice, string> = {
  '': 'Type is inferred from the expression.',
  numeric: 'Treated as a number (float) in fields and charts.',
  text: 'Treated as a discrete text dimension.',
  datetime: 'Treated as a date/time dimension.',
  link: 'Text, rendered as a clickable link — display-only, never sent to SQL. Build the URL in the expression, e.g. CONCAT(\'https://host/cell/\', cell_id). Links open from a pinned tooltip; only http(s) URLs are clickable.',
};

const labelSx = {
  fontSize: '0.75rem',
  fontWeight: 500,
  color: 'text.secondary',
  lineHeight: 1.2,
  mb: 0.25,
  display: 'block',
} as const;

const captionSx = {
  fontSize: '0.7rem',
  color: 'text.secondary',
  lineHeight: 1.4,
  display: 'block',
} as const;

const compactFieldSx = {
  '& .MuiInputBase-root': { minHeight: 0, fontSize: '0.8125rem' },
  '& .MuiInputBase-input': { fontSize: '0.8125rem', py: 0.25 },
  '& .MuiFormHelperText-root': { fontSize: '0.7rem', mt: 0.25, mx: 0 },
} as const;

/**
 * The expression editor is the one field worth extra room: it auto-grows with
 * the statement and switches to a full-height mode via the expand toggle, so a
 * long CASE chain stays readable instead of scrolling inside two lines.
 */
const expressionFieldSx = {
  '& .MuiInputBase-root': {
    fontSize: '0.8125rem',
    fontFamily: 'monospace',
    lineHeight: 1.5,
    p: 0.75,
    alignItems: 'flex-start',
  },
  '& .MuiInputBase-input': {
    fontSize: '0.8125rem',
    fontFamily: 'monospace',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
  },
  '& .MuiFormHelperText-root': { fontSize: '0.7rem', mt: 0.25, mx: 0 },
} as const;

const VirtualColumnEditor: React.FC<VirtualColumnEditorProps> = ({
  open,
  column,
  availableColumns,
  existingNames,
  onSave,
  onCancel,
}) => {
  const [name, setName] = useState('');
  const [expression, setExpression] = useState('');
  const [outputType, setOutputType] = useState<OutputTypeChoice>('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [columnSearch, setColumnSearch] = useState('');
  const [showExamples, setShowExamples] = useState(false);
  const [expressionExpanded, setExpressionExpanded] = useState(false);

  const isLink = outputType === 'link';

  // Initialize form when dialog opens or column changes
  useEffect(() => {
    if (open) {
      if (column) {
        setName(column.name);
        setExpression(column.expression);
        setOutputType(column.link ? 'link' : (column.output_type || ''));
        setDescription(column.description || '');
      } else {
        setName('');
        setExpression('');
        setOutputType('');
        setDescription('');
      }
      setErrors({});
      setColumnSearch('');
      // Examples help discovery for a new column, but only clutter an edit.
      setShowExamples(!column);
      setExpressionExpanded(false);
    }
  }, [open, column]);

  // Memoize filtered columns for Autocomplete to improve performance
  const filteredColumns = useMemo(() => {
    if (!columnSearch) return availableColumns.slice(0, 100); // Show first 100 by default
    const search = columnSearch.toLowerCase();
    return availableColumns.filter(col => col.toLowerCase().includes(search));
  }, [availableColumns, columnSearch]);

  /**
   * Advisory hint for link columns — not a blocking error.
   *
   * The URL is produced per row at query time, so it cannot be validated when
   * the column is defined. This only catches the common authoring mistake of
   * omitting the scheme, and stays silent when the expression has no string
   * literal at all (e.g. the URL comes straight out of a column).
   */
  const linkHint = useMemo(() => {
    if (!isLink || !expression.trim()) return null;
    const literals = expression.match(/'(?:''|[^'])*'/g);
    if (!literals || literals.length === 0) return null;
    const hasHttpLiteral = literals.some(lit => /^'https?:\/\//i.test(lit));
    if (hasHttpLiteral) return null;
    return 'No literal starting with http:// or https:// found. Values that are not absolute http(s) URLs render as plain text.';
  }, [isLink, expression]);

  const validateForm = useCallback((): boolean => {
    const newErrors: { [key: string]: string } = {};

    // Validate name
    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      newErrors.name = 'Start with a letter/underscore; letters, numbers, underscores only';
    } else if (existingNames.includes(name)) {
      newErrors.name = 'A virtual column with this name already exists';
    }

    // Validate expression
    if (!expression.trim()) {
      newErrors.expression = 'Expression is required';
    } else {
      // Basic validation - check for dangerous keywords.
      // Mirrors the backend's _validate_expression_safety: string literals are
      // masked out and keywords match on word boundaries, so legitimate content
      // such as a URL ('.../report?sort=created_at') is not rejected.
      const dangerousKeywords = ['DROP', 'DELETE', 'INSERT', 'UPDATE', 'TRUNCATE', 'ALTER', 'CREATE'];
      const scanned = expression.replace(/'(?:''|[^'])*'/g, "''");
      const upperExpr = scanned.toUpperCase();
      for (const keyword of dangerousKeywords) {
        if (new RegExp(`\\b${keyword}\\b`).test(upperExpr)) {
          newErrors.expression = `Expression cannot contain dangerous keyword: ${keyword}`;
          break;
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, expression, existingNames]);

  // Clear errors when user starts typing (without re-validating)
  const handleNameChange = useCallback((value: string) => {
    setName(value);
    if (errors.name) {
      setErrors(prev => ({ ...prev, name: '' }));
    }
  }, [errors.name]);

  const handleExpressionChange = useCallback((value: string) => {
    setExpression(value);
    if (errors.expression) {
      setErrors(prev => ({ ...prev, expression: '' }));
    }
  }, [errors.expression]);

  const handleSave = () => {
    if (validateForm()) {
      const virtualColumn: VirtualColumnDefinition = {
        name: name.trim(),
        expression: expression.trim(),
        // 'link' is not a storable output type — it means text + link rendering.
        output_type: outputType === 'link' ? 'text' : (outputType || undefined),
        description: description.trim() || undefined,
        link: isLink || undefined,
      };
      onSave(virtualColumn);
    }
  };

  const insertColumn = useCallback((columnName: string) => {
    // Insert column name at cursor position in expression field
    const textField = document.getElementById('expression-input') as HTMLInputElement;
    if (textField) {
      const start = textField.selectionStart || 0;
      const end = textField.selectionEnd || 0;
      const newExpression = 
        expression.substring(0, start) + columnName + expression.substring(end);
      setExpression(newExpression);
      
      // Set cursor after inserted text
      setTimeout(() => {
        textField.focus();
        textField.setSelectionRange(start + columnName.length, start + columnName.length);
      }, 0);
    }
  }, [expression]);

  const exampleExpressions = [
    { label: 'Arithmetic', value: '(revenue - cost) / revenue * 100' },
    { label: 'Rounding', value: 'ROUND(amount, 2)' },
    { label: 'String concat', value: 'CONCAT(first_name, \' \', last_name)' },
    { label: 'Conditional', value: 'CASE WHEN amount > 1000 THEN \'High\' ELSE \'Low\' END' },
    { label: 'Multi-condition', value: 'CASE WHEN score >= 90 THEN \'A\' WHEN score >= 80 THEN \'B\' ELSE \'C\' END' },
    { label: 'Absolute value', value: 'ABS(delta)' },
    { label: 'Upper case', value: 'UPPER(status)' },
    { label: 'Split segment', value: 'SPLIT(process_name, ":", -1)' },
    { label: 'Link URL', value: 'CONCAT(\'https://host/cell/\', cell_id)' },
  ];

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: {
          maxWidth: expressionExpanded ? 900 : 560,
          borderRadius: 1,
          transition: 'max-width 150ms ease',
        },
      }}
      aria-labelledby="virtual-column-editor-title"
    >
      <DialogTitle
        id="virtual-column-editor-title"
        sx={{ px: 1.5, py: 1, fontSize: '0.9375rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.75 }}
      >
        <FunctionsIcon sx={{ fontSize: '1rem' }} />
        {column ? 'Edit Virtual Column' : 'New Virtual Column'}
      </DialogTitle>

      <DialogContent
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          px: 1.5,
          pb: 1,
          '&.MuiDialogContent-root': { pt: 0.5 },
        }}
      >
        {/* Name + output type on one row */}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1.6, minWidth: 0 }}>
            <Typography component="label" sx={labelSx} htmlFor="virtual-column-name">
              Column name
            </Typography>
            <TextField
              id="virtual-column-name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              error={!!errors.name}
              helperText={errors.name || undefined}
              placeholder="e.g. profit_margin"
              size="small"
              variant="standard"
              sx={compactFieldSx}
              fullWidth
              required
              autoFocus={!column}
            />
          </Box>

          <Box sx={{ flex: 1, minWidth: 120 }}>
            <Typography id="virtual-column-type-label" sx={labelSx}>
              Type
            </Typography>
            <FormControl fullWidth size="small" variant="standard">
              <Select
                id="virtual-column-type"
                labelId="virtual-column-type-label"
                value={outputType}
                onChange={(e) => setOutputType(e.target.value as OutputTypeChoice)}
                sx={{ fontSize: '0.8125rem', '& .MuiSelect-select': { py: 0.25, pr: '24px !important' } }}
                MenuProps={{
                  MenuListProps: { dense: true },
                  PaperProps: {
                    sx: { '& .MuiMenuItem-root': { fontSize: '0.8125rem', minHeight: 30, py: 0.5 } },
                  },
                }}
              >
                <MenuItem dense value=""><em>Auto</em></MenuItem>
                <MenuItem dense value="numeric">Numeric</MenuItem>
                <MenuItem dense value="text">Text</MenuItem>
                <MenuItem dense value="datetime">DateTime</MenuItem>
                <MenuItem dense value="link">Link (URL)</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Box>

        <Typography variant="caption" sx={captionSx}>
          {OUTPUT_TYPE_HINTS[outputType]}
        </Typography>

        {linkHint && (
          <Alert severity="warning" sx={{ py: 0, '& .MuiAlert-message': { py: 0.5 } }}>
            <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>{linkHint}</Typography>
          </Alert>
        )}

        {/* Expression - grows with the statement, toggle for a full-height editor */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography component="label" sx={labelSx} htmlFor="expression-input">
              SQL expression
            </Typography>
            <Tooltip
              title={expressionExpanded ? 'Collapse editor' : 'Expand editor for long statements'}
              placement="left"
              enterDelay={400}
            >
              <IconButton
                size="small"
                onClick={() => setExpressionExpanded(prev => !prev)}
                aria-label={expressionExpanded ? 'Collapse expression editor' : 'Expand expression editor'}
                sx={{ p: 0.25, mb: 0.25 }}
              >
                {expressionExpanded
                  ? <CloseFullscreenIcon sx={{ fontSize: '0.85rem' }} />
                  : <OpenInFullIcon sx={{ fontSize: '0.85rem' }} />}
              </IconButton>
            </Tooltip>
          </Box>
          <TextField
            id="expression-input"
            value={expression}
            onChange={(e) => handleExpressionChange(e.target.value)}
            error={!!errors.expression}
            helperText={errors.expression || undefined}
            placeholder="e.g. ROUND((revenue - cost) / revenue * 100, 2)"
            size="small"
            variant="outlined"
            sx={expressionFieldSx}
            fullWidth
            required
            multiline
            minRows={expressionExpanded ? 14 : 4}
            maxRows={expressionExpanded ? 26 : 12}
          />
        </Box>

        {/* Column picker - Autocomplete for performance with large column lists */}
        <Autocomplete
          options={filteredColumns}
          inputValue={columnSearch}
          onInputChange={(_, newValue) => setColumnSearch(newValue)}
          onChange={(_, value) => {
            if (value) {
              insertColumn(value);
              setColumnSearch(''); // Clear search after insertion
            }
          }}
          size="small"
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder={`Insert column (${availableColumns.length} available)`}
              size="small"
              variant="standard"
              sx={compactFieldSx}
            />
          )}
          renderOption={(props, option) => (
            <li {...props} key={option}>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                {option}
              </Typography>
            </li>
          )}
          noOptionsText="No matching columns found"
          clearOnBlur
          blurOnSelect
          openOnFocus
          selectOnFocus
          ListboxProps={{ style: { maxHeight: '200px' } }}
        />

        {/* Description */}
        <TextField
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          size="small"
          variant="standard"
          sx={compactFieldSx}
          fullWidth
          multiline
          maxRows={3}
        />

        {/* Examples - collapsed by default when editing */}
        <Box>
          <Box
            onClick={() => setShowExamples(prev => !prev)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.25,
              cursor: 'pointer',
              color: 'text.secondary',
              '&:hover': { color: 'text.primary' },
            }}
          >
            <ExpandMoreIcon
              sx={{
                fontSize: '1rem',
                transform: showExamples ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 120ms',
              }}
            />
            <Typography variant="caption" sx={{ fontSize: '0.75rem', fontWeight: 500 }}>
              Examples & supported syntax
            </Typography>
          </Box>

          <Collapse in={showExamples} unmountOnExit>
            <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              {exampleExpressions.map((example) => (
                <Box key={example.label} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
                  <Typography variant="caption" sx={{ ...captionSx, minWidth: 96, flexShrink: 0 }}>
                    {example.label}
                  </Typography>
                  <Typography
                    variant="caption"
                    onClick={() => handleExpressionChange(example.value)}
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.7rem',
                      bgcolor: 'action.hover',
                      px: 0.5,
                      borderRadius: 0.5,
                      cursor: 'pointer',
                      flex: 1,
                      wordBreak: 'break-word',
                      '&:hover': { bgcolor: 'action.selected' },
                    }}
                  >
                    {example.value}
                  </Typography>
                </Box>
              ))}
              <Typography variant="caption" sx={{ ...captionSx, mt: 0.5 }}>
                Arithmetic (+, -, *, /, %), functions (ROUND, ABS, COALESCE, CONCAT, UPPER, LOWER,
                SPLIT, …) and conditionals (CASE WHEN … THEN … ELSE … END).
              </Typography>
            </Box>
          </Collapse>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 1.5, py: 0.75, gap: 0.5 }}>
        <Button size="small" onClick={onCancel} sx={{ textTransform: 'none', fontSize: '0.8125rem' }}>
          Cancel
        </Button>
        <Button
          size="small"
          onClick={handleSave}
          variant="outlined"
          sx={{ textTransform: 'none', fontSize: '0.8125rem' }}
        >
          {column ? 'Save Changes' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default VirtualColumnEditor;
