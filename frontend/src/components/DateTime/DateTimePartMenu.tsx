/**
 * DateTimePartMenu Component
 * 
 * Renders menu items for selecting datetime parts (year, month, day, hour, etc.)
 * in either distinct or timeline mode.
 */

import React from 'react';
import { Field, DateTimePart } from '../../types';
import { DATETIME_PARTS, getDateTimePartDisplayName } from '../../utils/datetimeUtils';
import SubMenu from '../Visualization/SubMenu';
import menuStyles from '../Visualization/ContextMenu.module.css';

interface DateTimePartMenuProps {
  field: Field;
  onUpdate: (updates: Partial<Field>) => void;
}

const DateTimePartMenu: React.FC<DateTimePartMenuProps> = ({ field, onUpdate }) => {
  return (
    <>
      <div className={menuStyles.separator} />

      <div 
        className={menuStyles.menuItem} 
        onClick={() => onUpdate({ dateTimePart: undefined, dateTimeMode: 'timeline' })}
      >
        Full DateTime {!field.dateTimePart && field.dateTimeMode === 'timeline' && '✔'}
      </div>

      <SubMenu label="Distinct Parts">
        {DATETIME_PARTS.map(part => (
          <div 
            key={part}
            className={menuStyles.menuItem} 
            onClick={() => onUpdate({ dateTimePart: part, dateTimeMode: 'distinct' })}
          >
            {getDateTimePartDisplayName(part)} {field.dateTimePart === part && field.dateTimeMode === 'distinct' && '✔'}
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
            {getDateTimePartDisplayName(part)} {field.dateTimePart === part && field.dateTimeMode === 'timeline' && '✔'}
          </div>
        ))}
      </SubMenu>
    </>
  );
};

export default DateTimePartMenu;

