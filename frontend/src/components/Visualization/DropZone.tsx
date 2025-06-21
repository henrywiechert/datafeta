import React, { useRef } from 'react';
import { useDrop } from 'react-dnd';
import { ItemTypes } from './FieldChip'; // Import the type
import styles from './DropZone.module.css';
import { Field } from '../../types';

interface DropZoneProps {
  children?: React.ReactNode;
  onDrop: (item: Field) => void;
  axis: 'x' | 'y'; // To identify which axis this is
}

const DropZone: React.FC<DropZoneProps> = ({ children, onDrop, axis }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [{ isOver, canDrop }, drop] = useDrop({
    accept: ItemTypes.FIELD,
    drop: (item: Field) => onDrop(item),
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
      canDrop: !!monitor.canDrop(),
    }),
  });

  drop(ref);

  const isActive = isOver && canDrop;
  let backgroundColor = '#f9f9f9';
  if (isActive) {
    backgroundColor = '#e3f2fd'; // A light blue to indicate a valid drop
  } else if (canDrop) {
    backgroundColor = '#fffde7'; // A light yellow to indicate it's a potential target
  }

  return (
    <div
      ref={ref}
      className={styles.dropZone}
      style={{ backgroundColor }}
    >
      {children}
    </div>
  );
};

export default DropZone; 