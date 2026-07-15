// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useContext, useState } from 'react';
import { Field, ColumnCastConfig } from '../../../types';
import menuStyles from '../ContextMenu.module.css';
import SubMenu from '../SubMenu';
import { canBeContinuous, canBeMeasure, getFieldAggregations } from './utils';
import { DragSource } from './types';
import ColumnCastingDialog from './ColumnCastingDialog';
import { FieldAliasDialog } from './FieldAliasDialog';
import DateTimePartMenu from '../../DateTime/DateTimePartMenu';
import { isSyntheticField } from '../../../utils/syntheticFields';
import { FieldMenuConfig } from './fieldMenuConfig';
import { useDataSource } from '../../../contexts/DataSourceContext';
import { useDataSourceMetadata } from '../../../contexts/DataSourceContext/hooks';
import { VisualizationContext } from '../../../contexts/VisualizationContext';
import { WINDOW_CALC_OPTIONS, hasWindowCalcOrderByDimension } from '../../../utils/windowCalcUtils';

interface FieldMenuItemsProps {
  field: Field;
  source: DragSource;
  onUpdate: (updates: Partial<Field>) => void;
  selectedFields?: Field[]; // For bulk editing
  menuConfig: FieldMenuConfig;
  onRemoveFromZone?: (fieldIds: string[]) => void;
  onRequestClose?: () => void;
  onCreateBins?: (field: Field) => void; // Callback for "Create Bins..." action
}

const FieldMenuItems: React.FC<FieldMenuItemsProps> = ({
  field,
  source,
  onUpdate,
  selectedFields = [],
  menuConfig,
  onRemoveFromZone,
  onRequestClose,
  onCreateBins,
}) => {
  const [castingDialogOpen, setCastingDialogOpen] = useState(false);
  const [aliasPopoverAnchor, setAliasPopoverAnchor] = useState<HTMLElement | null>(null);
  const { setFieldAlias } = useDataSource();
  const { availableFields } = useDataSourceMetadata();
  // Optional: only present when rendered inside a VisualizationProvider.
  // Used to decide whether a window calc (table calculation) is applicable,
  // which requires an ordering dimension (e.g. timeline bucket) on the shelves.
  // Tooltip fields count: they are merged into the query as dimensions and can
  // define the grain (e.g. Day timeline) without being plotted on an axis.
  const vizContext = useContext(VisualizationContext);
  const shelfFields = vizContext
    ? [
        ...vizContext.state.xAxisFields,
        ...vizContext.state.yAxisFields,
        ...vizContext.state.tooltipFields,
      ]
    : [];
  const windowCalcEligible = hasWindowCalcOrderByDimension(shelfFields);
  
  // Check if we're in bulk edit mode
  const isBulkEdit = selectedFields.length > 1;
  
  const isMeasure = field.type === 'measure';
  const availableAggregations = getFieldAggregations(field);
  const isFieldContinuous = canBeContinuous(field);
  const isFieldMeasure = canBeMeasure(field);
  const isInAxisDropZone = source === 'X_AXIS' || source === 'Y_AXIS';
  const isDateTime = field.dataType === 'datetime';
  const hasCasting = field.castType !== undefined;
  // Binning is available for numeric fields (integer or float) that are not virtual/binned
  const isNumeric = field.dataType === 'integer' || field.dataType === 'float';
  const canCreateBins = isNumeric && !field.is_virtual && menuConfig.allowCreateBins && onCreateBins;
  // Allow casting for any field - user can configure it regardless of type
  // Backend will handle the casting attempt
  const canCastField = !isInAxisDropZone && menuConfig.allowCasting;
  
  // Check if field is synthetic (MeasureNames/MeasureValues)
  const isSynthetic = isSyntheticField(field);
  const canChangeType = field.isTypeChangeable !== false && !isSynthetic;
  const canChangeFlavour = field.isFlavourChangeable !== false && !isSynthetic;

  // Candidate ordering columns for arg_max/arg_min ("Latest/Earliest value by <col>").
  // Virtual columns are excluded: aggregation_arg is resolved as a plain field
  // reference on the backend, not through the virtual column builder.
  const datetimeArgColumns = availableFields.filter(
    (f: Field) => f.dataType === 'datetime' && !isSyntheticField(f) && !f.is_virtual
  );
  const showArgAggregations =
    !isSynthetic && availableAggregations.length > 0 && datetimeArgColumns.length > 0;
  
  // For bulk edit, check if all selected fields can perform the operation
  const allCanBeMeasure = isBulkEdit ? selectedFields.every(f => canBeMeasure(f)) : isFieldMeasure;
  const allCanBeContinuous = isBulkEdit ? selectedFields.every(f => canBeContinuous(f)) : isFieldContinuous;
  const allAreMeasures = isBulkEdit ? selectedFields.every(f => f.type === 'measure') : isMeasure;

  const handleCastingConfirm = (config: ColumnCastConfig | null) => {
    if (config === null) {
      // Remove casting
      onUpdate({ castType: undefined, castReplacement: undefined });
    } else {
      // Apply casting
      onUpdate({ 
        castType: config.cast_type,
        castReplacement: config.replacement_pattern
      });
    }
    setCastingDialogOpen(false);
  };

  const handleAliasConfirm = (alias: string | undefined) => {
    // Update the alias in the data source context only
    // The alias lookup happens at render time, so we don't need to update individual field objects
    setFieldAlias(field.columnName, alias);
    setAliasPopoverAnchor(null);
    onRequestClose?.();
  };

  return (
    <>
      {/* Show bulk edit indicator if applicable */}
      {isBulkEdit && (
        <>
          <div className={menuStyles.menuItem} style={{ color: '#1976d2', fontWeight: 'bold', cursor: 'default' }}>
            Apply to {selectedFields.length} fields
          </div>
          <div className={menuStyles.separator} />
        </>
      )}

      {/* Show synthetic field badge if applicable (only for single field) */}
      {!isBulkEdit && isSynthetic && (
        <>
          <div className={menuStyles.menuItem} style={{ color: '#666', fontStyle: 'italic', cursor: 'default' }}>
            🔒 Synthetic Field
          </div>
          <div className={menuStyles.separator} />
        </>
      )}
      
      {menuConfig.allowTypeChange && (
        <>
          <div 
            className={`${menuStyles.menuItem} ${!canChangeType ? menuStyles.disabled : ''}`}
            onClick={canChangeType ? () => onUpdate({ type: 'dimension' }) : undefined}
          >
            Dimension {!isBulkEdit && field.type === 'dimension' && '✔'}
          </div>
          <div 
            className={`${menuStyles.menuItem} ${!allCanBeMeasure || !canChangeType ? menuStyles.disabled : ''}`} 
            onClick={allCanBeMeasure && canChangeType ? () => onUpdate({ type: 'measure' }) : undefined}
          >
            Measure {!isBulkEdit && field.type === 'measure' && '✔'}
          </div>
          
          <div className={menuStyles.separator} />
        </>
      )}

      {menuConfig.allowFlavourChange && (
        <>
          <div 
            className={`${menuStyles.menuItem} ${!canChangeFlavour ? menuStyles.disabled : ''}`}
            onClick={canChangeFlavour ? () => onUpdate({ flavour: 'discrete' }) : undefined}
          >
            Discrete {!isBulkEdit && field.flavour === 'discrete' && '✔'}
          </div>
          <div 
            className={`${menuStyles.menuItem} ${!allCanBeContinuous || !canChangeFlavour ? menuStyles.disabled : ''}`}
            onClick={allCanBeContinuous && canChangeFlavour ? () => onUpdate({ flavour: 'continuous' }) : undefined}
          >
            Continuous {!isBulkEdit && field.flavour === 'continuous' && '✔'}
          </div>
        </>
      )}
      
      {/* Only show data type selection when field is in available fields panel */}
      {!isInAxisDropZone && menuConfig.allowDataTypeChange && (
        <>
          <div className={menuStyles.separator} />

          <SubMenu label={`Data Type (${field.dataType})`}>
            <div className={menuStyles.menuItem} onClick={() => onUpdate({ dataType: 'string' })}>
              String {field.dataType === 'string' && '✔'}
            </div>
            <div className={menuStyles.menuItem} onClick={() => onUpdate({ dataType: 'integer' })}>
              Integer {field.dataType === 'integer' && '✔'}
            </div>
            <div className={menuStyles.menuItem} onClick={() => onUpdate({ dataType: 'float' })}>
              Float {field.dataType === 'float' && '✔'}
            </div>
            <div className={menuStyles.menuItem} onClick={() => onUpdate({ dataType: 'datetime' })}>
              DateTime {field.dataType === 'datetime' && '✔'}
            </div>
          </SubMenu>
        </>
      )}
      
      {/* DateTime Part Selection - shown for datetime fields */}
      {isDateTime && menuConfig.allowDateTimePart && (
        <DateTimePartMenu field={field} onUpdate={onUpdate} />
      )}

      {/* Column Casting - shown for numeric fields or numeric measures in available fields panel */}
      {canCastField && !isInAxisDropZone && (
        <>
          <div className={menuStyles.separator} />
          <div 
            className={menuStyles.menuItem}
            onClick={() => setCastingDialogOpen(true)}
          >
            Configure Casting {hasCasting && '✔'}
          </div>
        </>
      )}

      {/* Rename Field - shown for non-synthetic, non-virtual fields in single selection mode */}
      {!isBulkEdit && !isSynthetic && !field.is_virtual && (
        <>
          <div className={menuStyles.separator} />
          <div 
            className={menuStyles.menuItem}
            onClick={(e) => setAliasPopoverAnchor(e.currentTarget)}
          >
            Rename Field {field.displayAlias && '✔'}
          </div>
        </>
      )}

      {/* Create Bins - shown for numeric fields in available fields panel */}
      {canCreateBins && !isBulkEdit && (
        <>
          <div className={menuStyles.separator} />
          <div 
            className={menuStyles.menuItem}
            onClick={() => {
              onCreateBins(field);
              onRequestClose?.();
            }}
          >
            Create Bins...
          </div>
        </>
      )}
      
      {menuConfig.allowAggregationChange && allAreMeasures && availableAggregations.length > 0 && <div className={menuStyles.separator} />}

      {menuConfig.allowAggregationChange && allAreMeasures && availableAggregations.map(agg => (
        <div key={agg} className={menuStyles.menuItem} onClick={() => onUpdate({ aggregation: agg, aggregationArg: undefined })}>
          {agg} {!isBulkEdit && field.aggregation === agg && '✔'}
        </div>
      ))}

      {/* Latest/Earliest value (arg_max/arg_min): value at the row where the
          chosen datetime column is maximal/minimal, e.g. closing weight per day */}
      {menuConfig.allowAggregationChange && allAreMeasures && showArgAggregations && (
        <>
          {([['arg_max', 'Latest value'], ['arg_min', 'Earliest value']] as const).map(([agg, label]) => {
            const isActive = !isBulkEdit && field.aggregation === agg;
            if (datetimeArgColumns.length === 1) {
              const col = datetimeArgColumns[0].columnName;
              return (
                <div
                  key={agg}
                  className={menuStyles.menuItem}
                  onClick={() => onUpdate({ aggregation: agg, aggregationArg: col })}
                >
                  {label} (by {col}) {isActive && '✔'}
                </div>
              );
            }
            return (
              <SubMenu key={agg} label={`${label} (by …)${isActive ? ' ✔' : ''}`}>
                {datetimeArgColumns.map((c: Field) => (
                  <div
                    key={c.columnName}
                    className={menuStyles.menuItem}
                    onClick={() => onUpdate({ aggregation: agg, aggregationArg: c.columnName })}
                  >
                    {c.columnName} {isActive && field.aggregationArg === c.columnName && '✔'}
                  </div>
                ))}
              </SubMenu>
            );
          })}
        </>
      )}

      {/* Table Calculation (window calc) - measures only, needs an ordering dimension on the shelf */}
      {menuConfig.allowAggregationChange && allAreMeasures && (
        <>
          <div className={menuStyles.separator} />
          <SubMenu label={`Table Calculation${field.windowCalc ? ' ✔' : ''}`}>
            {!windowCalcEligible && (
              <div
                className={menuStyles.menuItem}
                style={{ color: '#888', fontStyle: 'italic', cursor: 'default', whiteSpace: 'normal', maxWidth: 240 }}
              >
                Add a date field (e.g. as Day) to an axis or Tooltip to enable table calculations
              </div>
            )}
            <div
              className={menuStyles.menuItem}
              onClick={() => onUpdate({ windowCalc: undefined })}
            >
              None {!isBulkEdit && !field.windowCalc && '✔'}
            </div>
            {WINDOW_CALC_OPTIONS.map(({ value, label }) => (
              <div
                key={value}
                className={`${menuStyles.menuItem} ${!windowCalcEligible ? menuStyles.disabled : ''}`}
                onClick={windowCalcEligible ? () => onUpdate({ windowCalc: value }) : undefined}
              >
                {label} {!isBulkEdit && field.windowCalc === value && '✔'}
              </div>
            ))}
          </SubMenu>
        </>
      )}

      {/* Bar Sort Order - shown for measures on axes */}
      {menuConfig.allowBarSortOrder && allAreMeasures && isInAxisDropZone && (
        <>
          <div className={menuStyles.separator} />
          <SubMenu label="Bar Sort Order">
            <div className={menuStyles.menuItem} onClick={() => onUpdate({ barSortOrder: 'none' })}>
              None (Natural Order) {!isBulkEdit && (!field.barSortOrder || field.barSortOrder === 'none') && '✔'}
            </div>
            <div className={menuStyles.menuItem} onClick={() => onUpdate({ barSortOrder: 'asc' })}>
              Ascending ↑ {!isBulkEdit && field.barSortOrder === 'asc' && '✔'}
            </div>
            <div className={menuStyles.menuItem} onClick={() => onUpdate({ barSortOrder: 'desc' })}>
              Descending ↓ {!isBulkEdit && field.barSortOrder === 'desc' && '✔'}
            </div>
          </SubMenu>
        </>
      )}

      {/* Remove from zone (drag-only UI still; this is a contextual removal action) */}
      {menuConfig.allowRemoveFromZone && onRemoveFromZone && (
        <>
          <div className={menuStyles.separator} />
          <div
            className={menuStyles.menuItem}
            onClick={() => {
              const ids = selectedFields.length > 0 ? selectedFields.map(f => f.id) : [field.id];
              onRemoveFromZone(ids);
              onRequestClose?.();
            }}
          >
            Remove from this zone
          </div>
        </>
      )}

      <ColumnCastingDialog
        open={castingDialogOpen}
        columnName={field.columnName}
        currentConfig={
          field.castType ? {
            cast_type: field.castType,
            replacement_pattern: field.castReplacement
          } : undefined
        }
        onConfirm={handleCastingConfirm}
        onCancel={() => setCastingDialogOpen(false)}
      />

      <FieldAliasDialog
        anchorEl={aliasPopoverAnchor}
        field={field}
        onConfirm={handleAliasConfirm}
        onClose={() => setAliasPopoverAnchor(null)}
      />
    </>
  );
};

export default FieldMenuItems;
