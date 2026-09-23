// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * DateTimePartMenu Component
 * 
 * Renders menu items for selecting datetime parts (year, month, day, hour, etc.)
 * in either distinct or timeline mode.
 */

import React from 'react';
import { Field } from '../../types';
import { DATETIME_PARTS, getDateTimePartDisplayName } from '../../datetime';
import { resolveDateTime } from '../../datetime/datetimeSemantics';
import SubMenu from '../Visualization/SubMenu';
import menuStyles from '../Visualization/ContextMenu.module.css';

interface DateTimePartMenuProps {
  field: Field;
  onUpdate: (updates: Partial<Field>) => void;
}

const DateTimePartMenu: React.FC<DateTimePartMenuProps> = ({ field, onUpdate }) => {
  const resolution = resolveDateTime(field);

  return (
    <>
      <div className={menuStyles.separator} />

      {/*
        There is intentionally no "clear" item: a datetime column with no part IS
        Full DateTime, so this entry is itself the reset. It must therefore stay
        checked for a field that has never been configured, not only for one that
        was explicitly set — see resolveDateTime.
      */}
      <div
        className={menuStyles.menuItem}
        onClick={() => onUpdate({ dateTimePart: undefined, dateTimeMode: 'timeline' })}
      >
        Full DateTime {resolution.isFullDateTime && '✔'}
      </div>

      <SubMenu label="Distinct Parts">
        {DATETIME_PARTS.map(part => (
          <div 
            key={part}
            className={menuStyles.menuItem} 
            onClick={() => onUpdate({ dateTimePart: part, dateTimeMode: 'distinct' })}
          >
            {getDateTimePartDisplayName(part)} {resolution.part === part && resolution.mode === 'distinct' && '✔'}
          </div>
        ))}
      </SubMenu>

      <SubMenu label="Timeline Parts">
        {DATETIME_PARTS.map(part => (
          <div 
            key={part}
            className={menuStyles.menuItem} 
            onClick={() => onUpdate({ dateTimePart: part, dateTimeMode: 'timeline' })}
          >
            {getDateTimePartDisplayName(part)} {resolution.part === part && resolution.mode === 'timeline' && '✔'}
          </div>
        ))}
      </SubMenu>
    </>
  );
};

export default DateTimePartMenu;

