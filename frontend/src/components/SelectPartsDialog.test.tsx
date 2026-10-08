// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectPartsDialog } from './SelectPartsDialog';
import type { StagedUpload } from '../types';

const workbook: StagedUpload = {
  upload_id: 'u1',
  filename: 'shop.xlsx',
  format: 'workbook',
  part_label: 'sheet',
  parts: [
    { name: 'Orders', selectable: true, reason: null },
    { name: 'Customers', selectable: true, reason: null },
    { name: 'Secret', selectable: false, reason: 'hidden' },
  ],
};

function setup() {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  render(
    <SelectPartsDialog open uploads={[workbook]} onConfirm={onConfirm} onCancel={onCancel} />
  );
  return { onConfirm, onCancel };
}

describe('SelectPartsDialog', () => {
  it('pre-selects visible sheets and disables hidden ones', () => {
    setup();

    expect(screen.getByRole('checkbox', { name: 'Orders' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Customers' })).toBeChecked();
    const hidden = screen.getByRole('checkbox', { name: 'Secret (hidden)' });
    expect(hidden).not.toBeChecked();
    expect(hidden).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Load 2 Sheets' })).toBeEnabled();
  });

  it('confirms the chosen sheets in workbook order', async () => {
    const { onConfirm } = setup();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Orders' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Orders' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Customers' }));
    await userEvent.click(screen.getByRole('button', { name: 'Load 1 Sheet' }));

    expect(onConfirm).toHaveBeenCalledWith({ u1: ['Orders'] });
  });

  it('select-all toggles every loadable sheet and blocks confirming nothing', async () => {
    const { onConfirm } = setup();
    const all = screen.getByRole('checkbox', { name: 'All sheets of shop.xlsx' });

    await userEvent.click(all);
    expect(screen.getByRole('button', { name: 'Load Sheets' })).toBeDisabled();

    await userEvent.click(all);
    await userEvent.click(screen.getByRole('button', { name: 'Load 2 Sheets' }));
    expect(onConfirm).toHaveBeenCalledWith({ u1: ['Orders', 'Customers'] });
  });

  it('cancels', async () => {
    const { onCancel } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalled();
  });

  it('titles the dialog after the part label', () => {
    setup();

    expect(screen.getByRole('dialog', { name: 'Select Sheets' })).toBeInTheDocument();
  });
});
