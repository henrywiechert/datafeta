import React, { useState, useEffect, ChangeEvent } from 'react';
import './/App.css'; // Assuming default CRA CSS exists
import { apiService } from './apiService';
import { ConnectionDetails, Database, Table, Column, QueryDescription, QueryResult } from './types';

function App() {
  // Connection State
  const [connectionType, setConnectionType] = useState<'csv' | 'clickhouse'>('csv');
  const [filePath, setFilePath] = useState<string>('');
  const [connString, setConnString] = useState<string>('');
  const [host, setHost] = useState<string>('localhost');
  const [port, setPort] = useState<number | string>(9000); // Allow string for input binding
  const [user, setUser] = useState<string>('default');
  const [password, setPassword] = useState<string>('');
  const [dbName, setDbName] = useState<string>('default'); // Database for CH connection details

  // UI / Data State
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [databases, setDatabases] = useState<Database[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);

  const [selectedDatabase, setSelectedDatabase] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // State for MAX query test
  const [maxQueryColumn, setMaxQueryColumn] = useState<string>('');
  const [maxQueryResult, setMaxQueryResult] = useState<string | null>(null);
  const [maxQueryError, setMaxQueryError] = useState<string | null>(null);

  // Clear dependent state on disconnect or connection type change
  useEffect(() => {
    if (!isConnected) {
      setDatabases([]);
      setTables([]);
      setColumns([]);
      setSelectedDatabase(null);
      setSelectedTable(null);
      setMessage(null);
    }
  }, [isConnected]);

  useEffect(() => {
      // Reset dependent fields when type changes
      setDatabases([]);
      setTables([]);
      setColumns([]);
      setSelectedDatabase(null);
      setSelectedTable(null);
      setError(null);
      setMessage(null);
  }, [connectionType]);

  // New useEffect for auto-selecting CSV table
  useEffect(() => {
    // Run only when tables update, it's a CSV connection, and no table is selected yet
    if (connectionType === 'csv' && isConnected && tables.length === 1 && !selectedTable) {
        console.log("Auto-selecting CSV table:", tables[0].name);
        handleTableSelect(tables[0].name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables, connectionType, isConnected]); // Dependency array

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      setFilePath(event.target.files[0].name); // Update display path/name
    } else {
        setSelectedFile(null);
        setFilePath('');
    }
  };

  const handleConnect = async () => {
    setIsLoading(true);
    setError(null);
    setMessage(null);
    setDatabases([]);
    setTables([]);
    setColumns([]);
    setSelectedDatabase(null);
    setSelectedTable(null);


    let details: ConnectionDetails = { type: connectionType };

    if (connectionType === 'csv') {
      if (!selectedFile) {
        setError('CSV File is required. Please select a file.');
        setIsLoading(false);
        return;
      }
    } else { // clickhouse
        // Basic validation: Use connString OR host
        if (connString) {
             details.connection_string = connString;
        } else if (host) {
            details.host = host;
            details.port = Number(port) || 9000; // Ensure port is a number
            details.user = user;
            details.password = password;
            details.database = dbName; // DB name for connection itself
        } else {
            setError('For ClickHouse, provide Connection String or Host.');
            setIsLoading(false);
            return;
        }
    }

    try {
      const response = await apiService.connect(details, selectedFile ?? undefined);
      setMessage(`${response.message}${response.file_path ? ` (Server Path: ${response.file_path})` : ''}`);
      setIsConnected(true);
      // Automatically try to load databases or tables after connection
      if (connectionType === 'clickhouse') {
        await loadDatabases();
      } else {
        // For CSV, loadTables is triggered indirectly by setting isConnected to true
        // or can be triggered manually. Let's explicitly call it AFTER setting connected state.
         await loadTables(); // Explicitly call loadTables after setting connected
      }
    } catch (err: any) {
      setError(err.message || 'Connection failed');
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await apiService.disconnect();
      setMessage(response.message);
      setIsConnected(false);
      // Clear all data state
      setDatabases([]);
      setTables([]);
      setColumns([]);
      setSelectedDatabase(null);
      setSelectedTable(null);
    } catch (err: any) {
      setError(err.message || 'Disconnection failed');
      // Keep isConnected as true if disconnect fails? Or force false? Forcing false.
       setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  };

 const loadDatabases = async () => {
    if (!isConnected || connectionType !== 'clickhouse') return;
    setIsLoading(true);
    setError(null);
    setTables([]); // Clear tables/columns when loading databases
    setColumns([]);
    setSelectedTable(null);
    try {
        const response = await apiService.listDatabases();
        setDatabases(response.databases);
         // Auto-select if default db is in the list? Optional.
         if (response.databases.some(db => db.name === dbName)) {
            // setSelectedDatabase(dbName); // Maybe not auto-select
         }
    } catch (err: any) {
        setError(err.message || 'Failed to load databases');
        setDatabases([]);
    } finally {
        setIsLoading(false);
    }
 };


  const loadTables = async (dbToLoad?: string | null) => {
    const targetDb = dbToLoad ?? selectedDatabase; // Use arg or state
    // Simplified check: Only require targetDb if the connection type is ClickHouse
    if (connectionType === 'clickhouse' && !targetDb) {
        setError('Select a database first (for ClickHouse).');
        return;
    }

    setIsLoading(true);
    setError(null);
    setColumns([]); // Clear columns when loading tables
    setSelectedTable(null);
    try {
      // Pass targetDb only if it's ClickHouse and targetDb is not null
      const dbParam = connectionType === 'clickhouse' ? targetDb! : undefined;
      const response = await apiService.listTables(dbParam);
      setTables(response.tables);
    } catch (err: any) {
      setError(err.message || 'Failed to load tables');
      setTables([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadColumns = async (tableToLoad?: string | null) => {
     const targetTable = tableToLoad ?? selectedTable; // Use arg or state
     if (!isConnected || !targetTable) {
        setError('Select a table first.');
        return;
     }
     // Database is required for ClickHouse column listing
     if (connectionType === 'clickhouse' && !selectedDatabase) {
        setError('Select a database first (for ClickHouse).');
        return;
     }

    setIsLoading(true);
    setError(null);
    try {
       // Pass selectedDatabase only if it's ClickHouse
      const dbParam = connectionType === 'clickhouse' ? selectedDatabase! : undefined;
      const response = await apiService.listColumns(targetTable, dbParam);
      setColumns(response.columns);
      // Reset max query state when columns reload
      setMaxQueryColumn(response.columns[0]?.name || ''); // Default to first column
      setMaxQueryResult(null);
      setMaxQueryError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load columns');
      setColumns([]);
      setMaxQueryColumn('');
      setMaxQueryResult(null);
      setMaxQueryError(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Handlers for selections
  const handleDatabaseSelect = (dbName: string) => {
    setSelectedDatabase(dbName);
    setSelectedTable(null); // Reset table selection
    setTables([]); // Clear tables list
    setColumns([]); // Clear columns list
    loadTables(dbName); // Load tables for the new database
  };

   const handleTableSelect = (tableName: string) => {
    setSelectedTable(tableName);
    setColumns([]); // Clear columns list
    loadColumns(tableName); // Load columns for the new table
  };

  // Handler for the test MAX query
  const handleGetMax = async () => {
    if (!selectedTable || !maxQueryColumn) {
        setMaxQueryError("Please select a table and a column first.");
        return;
    }

    setMaxQueryResult(null);
    setMaxQueryError(null);
    setIsLoading(true);

    const queryDesc: QueryDescription = {
        target_table: selectedTable,
        // target_database is needed for ClickHouse
        target_database: connectionType === 'clickhouse' ? selectedDatabase || undefined : undefined,
        dimensions: [],
        measures: [
            { field: maxQueryColumn, aggregation: 'max', alias: 'max_value' }
        ],
        limit: 1
    };

    try {
        const result: QueryResult = await apiService.executeQuery(queryDesc);
        // Refined check for result
        if (result.rows && result.rows.length > 0) {
            const firstRow = result.rows[0];
            if (firstRow.hasOwnProperty('max_value')) { // Check if the key exists
                 setMaxQueryResult(String(firstRow['max_value'])); // Display null as "null"
            } else {
                 setMaxQueryError("Query executed but expected alias 'max_value' not found in result.");
            }
        } else {
            setMaxQueryResult("No rows returned."); // More specific message
        }
    } catch (err: any) {
        setMaxQueryError(err.message || "Failed to execute MAX query.");
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="App">
      <h1>Data Analytics Platform</h1>

      <div className="connection-area">
        <h2>1. Connection</h2>
        <select value={connectionType} onChange={(e) => setConnectionType(e.target.value as 'csv' | 'clickhouse')} disabled={isConnected || isLoading}>
          <option value="csv">CSV File</option>
          <option value="clickhouse">ClickHouse</option>
        </select>

        {connectionType === 'csv' && (
          <div>
            <label>CSV File:</label>
            <input type="file" accept=".csv" onChange={handleFileChange} disabled={isConnected || isLoading} />
            {filePath && <span style={{ marginLeft: '10px' }}>Selected: {filePath}</span>}
          </div>
        )}

        {connectionType === 'clickhouse' && (
          <div>
            <label>Connection String:</label>
            <input type="text" value={connString} onChange={(e) => setConnString(e.target.value)} placeholder="clickhouse://user:pass@host:port/db" disabled={isConnected || isLoading} />
            <small> OR </small>
            <br/>
            <label>Host:</label>
            <input type="text" value={host} onChange={(e) => setHost(e.target.value)} disabled={isConnected || isLoading || !!connString} />
            <label>Port:</label>
            <input type="number" value={port} onChange={(e) => setPort(e.target.value)} disabled={isConnected || isLoading || !!connString} />
            <br/>
            <label>User:</label>
            <input type="text" value={user} onChange={(e) => setUser(e.target.value)} disabled={isConnected || isLoading || !!connString} />
            <label>Password:</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isConnected || isLoading || !!connString} />
            <br/>
            <label>Database:</label>
            <input type="text" value={dbName} onChange={(e) => setDbName(e.target.value)} disabled={isConnected || isLoading || !!connString} />
          </div>
        )}

        {!isConnected ? (
          <button onClick={handleConnect} disabled={isLoading}>Connect</button>
        ) : (
          <button onClick={handleDisconnect} disabled={isLoading}>Disconnect</button>
        )}

        {isLoading && <p>Loading...</p>}
        {error && <p style={{ color: 'red' }}>Error: {error}</p>}
        {message && <p style={{ color: 'green' }}>{message}</p>}
      </div>

      {isConnected && (
        <div className="data-explorer">
          {/* Database Selection (ClickHouse only) */}
          {connectionType === 'clickhouse' && (
            <div className="databases">
              <h2>2. Databases</h2>
              {databases.length === 0 && !isLoading && <button onClick={() => loadDatabases()} disabled={isLoading}>Load Databases</button>}
              {databases.length > 0 && (
                <select value={selectedDatabase || ''} onChange={(e) => handleDatabaseSelect(e.target.value)} disabled={isLoading}>
                  <option value="" disabled>-- Select Database --</option>
                  {databases.map(db => <option key={db.name} value={db.name}>{db.name}</option>)}
                </select>
              )}
            </div>
          )}

          {/* Table Selection */}
           { (selectedDatabase || connectionType === 'csv') && ( // Show tables if db selected (CH) or if CSV connected
             <div className="tables">
               <h2>{connectionType === 'clickhouse' ? `3. Tables in '${selectedDatabase}'` : '2. Table'}</h2>
                {tables.length === 0 && !isLoading && selectedDatabase && <button onClick={() => loadTables()} disabled={isLoading}>Load Tables</button>}
                {tables.length > 0 && (
                 <select value={selectedTable || ''} onChange={(e) => handleTableSelect(e.target.value)} disabled={isLoading}>
                    <option value="" disabled>-- Select Table --</option>
                    {tables.map(tbl => <option key={tbl.name} value={tbl.name}>{tbl.name}</option>)}
                 </select>
               )}
              </div>
           )}


          {/* Column Display */}
          {selectedTable && (
             <div className="columns">
               <h2>{connectionType === 'clickhouse' ? `4. Columns in '${selectedTable}'` : `3. Columns in '${selectedTable}'`}</h2>
               {columns.length === 0 && !isLoading && <button onClick={() => loadColumns()} disabled={isLoading}>Load Columns</button>}
               {columns.length > 0 ? (
                 <table>
                   <thead>
                     <tr><th>Name</th><th>Type</th></tr>
                   </thead>
                   <tbody>
                     {columns.map(col => (
                       <tr key={col.name}><td>{col.name}</td><td>{col.data_type}</td></tr>
                     ))}
                   </tbody>
                 </table>
               ) : (
                   !isLoading && <p>No columns found or table not selected.</p>
               )}

               {/* --- MAX Query Test UI --- */}
               {columns.length > 0 && (
                 <div style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '15px' }}>
                   <h4>Test MAX Query</h4>
                   <label>Column:</label>
                   <select value={maxQueryColumn} onChange={(e) => setMaxQueryColumn(e.target.value)} disabled={isLoading}>
                     {columns.map(col => (
                       // Simple heuristic: only offer columns that don't look explicitly like strings
                       // This is basic, real type checking would be better
                       !col.data_type.toLowerCase().includes('string') &&
                       !col.data_type.toLowerCase().includes('uuid') &&
                       <option key={col.name} value={col.name}>{col.name} ({col.data_type})</option>
                     ))}
                   </select>
                   <button onClick={handleGetMax} disabled={isLoading || !maxQueryColumn} style={{ marginLeft: '10px' }}>Get MAX</button>
                   {maxQueryError && <p style={{ color: 'red' }}>Error: {maxQueryError}</p>}
                   {maxQueryResult !== null && <p>Result: <strong>{maxQueryResult}</strong></p>}
                 </div>
               )}
             </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
