// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * The merged filter state gives the session store precedence, so a write into the
 * sheet reducer for a session filter is invisible — it would leave the stale session
 * copy on screen. These tests pin which store each write actually lands in.
 */
import { renderHook } from '@testing-library/react';
import { useFilterStoreDispatch } from './useFilterStoreDispatch';
import { useDataSource } from '../contexts/DataSourceContext';
import { useVisualizationContext } from '../contexts/VisualizationContext';
import { Field, FilterConfig, FilterMetadata } from '../types';

jest.mock('../contexts/DataSourceContext', () => ({ useDataSource: jest.fn() }));
jest.mock('../contexts/VisualizationContext', () => ({ useVisualizationContext: jest.fn() }));

const sessionField: Field = {
  id: 'region',
  columnName: 'region',
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
};

const dispatch = jest.fn();
const setSessionFilterMetadata = jest.fn();
const setSessionFilterConfiguration = jest.fn();
const setAndApplySessionFilterConfiguration = jest.fn();

const metadata = { fieldId: 'x', columnName: 'x', type: 'discrete' } as FilterMetadata;
const config = { fieldId: 'x', columnName: 'x', type: 'discrete' } as FilterConfig;

beforeEach(() => {
  jest.clearAllMocks();
  (useDataSource as jest.Mock).mockReturnValue({
    dataSource: { sessionFilterFields: [sessionField] },
    setSessionFilterMetadata,
    setSessionFilterConfiguration,
    setAndApplySessionFilterConfiguration,
  });
  (useVisualizationContext as jest.Mock).mockReturnValue({ dispatch });
});

const render = () => renderHook(() => useFilterStoreDispatch()).result.current;

describe('routing by filter scope', () => {
  test('session metadata goes to the session store, not the sheet reducer', () => {
    render()({ type: 'SET_FILTER_METADATA', payload: { fieldId: 'region', metadata } });

    expect(setSessionFilterMetadata).toHaveBeenCalledWith('region', metadata);
    expect(dispatch).not.toHaveBeenCalled();
  });

  test('session config edits go to the session draft', () => {
    render()({ type: 'SET_FILTER_CONFIGURATION', payload: { fieldId: 'region', config } });

    expect(setSessionFilterConfiguration).toHaveBeenCalledWith('region', config);
    expect(dispatch).not.toHaveBeenCalled();
  });

  test('a silent set-and-apply writes the session draft and applied state together', () => {
    render()({
      type: 'SET_AND_APPLY_FILTER_CONFIGURATION_SILENT',
      payload: { fieldId: 'region', config },
    });

    expect(setAndApplySessionFilterConfiguration).toHaveBeenCalledWith('region', config);
    expect(dispatch).not.toHaveBeenCalled();
  });

  test('a sheet filter still goes to the visualization reducer', () => {
    const action = { type: 'SET_FILTER_METADATA', payload: { fieldId: 'category', metadata } };
    render()(action);

    expect(dispatch).toHaveBeenCalledWith(action);
    expect(setSessionFilterMetadata).not.toHaveBeenCalled();
  });

  test('actions with no session equivalent fall through even for a session field', () => {
    const action = { type: 'APPLY_FILTERS', payload: { fieldId: 'region' } };
    render()(action);

    expect(dispatch).toHaveBeenCalledWith(action);
  });
});
