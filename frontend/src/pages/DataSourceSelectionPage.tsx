import React, { useState, useEffect, ChangeEvent } from 'react';
import { apiService } from '../apiService';
import { ConnectionDetails } from '../types';
import { useConnection } from '../contexts/ConnectionContext';
import '../App.css';

function DataSourceSelectionPage() {
  const { isConnected, isLoading, error, message, connect, disconnect, connectionDetails } = useConnection();

  const [connectionType, setConnectionType] = useState<'csv' | 'clickhouse'>('clickhouse');
  const [filePath, setFilePath] = useState<string>('');
  const [connString, setConnString] = useState<string>('');
  const [host, setHost] = useState<string>('localhost');
  const [port, setPort] = useState<number | string>(8123);
  const [user, setUser] = useState<string>('default');
  const [password, setPassword] = useState<string>('');
  const [dbName, setDbName] = useState<string>('default');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    if (isConnected && connectionDetails) {
      setConnectionType(connectionDetails.type);
      setConnString(connectionDetails.connection_string || '');
      setHost(connectionDetails.host || 'localhost');
      setPort(connectionDetails.port || 8123);
      setUser(connectionDetails.user || 'default');
      setPassword(connectionDetails.password || '');
      setDbName(connectionDetails.database || 'default');
      setFilePath('');
      setSelectedFile(null);
    }
  }, []);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      setFilePath(event.target.files[0].name);
    } else {
        setSelectedFile(null);
        setFilePath('');
    }
  };

  const handleConnect = async () => {
    let details: ConnectionDetails = { type: connectionType };
    let formError: string | null = null;

    if (connectionType === 'csv') {
      if (!selectedFile) {
        formError = 'CSV File is required. Please select a file.';
        console.error(formError);
        return;
      }
    } else {
        if (connString) {
             details.connection_string = connString;
        } else if (host) {
            details.host = host;
            details.port = Number(port) || 9000;
            details.user = user;
            details.password = password;
            details.database = dbName;
        } else {
            formError = 'For ClickHouse, provide Connection String or Host.';
            console.error(formError);
            return;
        }
    }

    try {
      await connect(details, selectedFile ?? undefined);
    } catch (err) {
      console.error("Connect API call failed:", err);
    }
  };

  const handleDisconnect = async () => {
    try {
        await disconnect();
    } catch (err) {
        console.error("Disconnect API call failed (unexpectedly):", err);
    }
  };

  return (
    <div>
      <h2>Data Source Selection</h2>

      <div className="connection-area">
        <h3>Connect to a Data Source</h3>
        <select value={connectionType} onChange={(e) => setConnectionType(e.target.value as 'csv' | 'clickhouse')} disabled={isConnected || isLoading}>
          <option value="csv">CSV File</option>
          <option value="clickhouse">ClickHouse</option>
        </select>

        {connectionType === 'csv' && (
          <div style={{marginTop: '10px'}}>
            <label>CSV File:</label>
            <input type="file" accept=".csv" onChange={handleFileChange} disabled={isConnected || isLoading} />
            {filePath && <span style={{ marginLeft: '10px' }}>Selected: {filePath}</span>}
          </div>
        )}

        {connectionType === 'clickhouse' && (
          <div style={{marginTop: '10px'}}>
            <div>
                <label>Conn String:</label>
                <input style={{width: '300px'}} type="text" value={connString} onChange={(e) => setConnString(e.target.value)} placeholder="clickhouse://user:pass@host:port/db" disabled={isConnected || isLoading} />
                <em style={{marginLeft: '10px'}}> OR provide details below:</em>
            </div>
            <hr style={{margin: '10px 0'}}/>
            <div>
                <label>Host:</label>
                <input type="text" value={host} onChange={(e) => setHost(e.target.value)} disabled={isConnected || isLoading || !!connString} />
                <label style={{marginLeft: '10px'}}>Port:</label>
                <input type="number" style={{width: '80px'}} value={port} onChange={(e) => setPort(e.target.value)} disabled={isConnected || isLoading || !!connString} />
            </div>
            <div>
                <label>User:</label>
                <input type="text" value={user} onChange={(e) => setUser(e.target.value)} disabled={isConnected || isLoading || !!connString} />
                <label style={{marginLeft: '10px'}}>Password:</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isConnected || isLoading || !!connString} />
            </div>
             <div>
                <label>Database:</label>
                <input type="text" value={dbName} onChange={(e) => setDbName(e.target.value)} disabled={isConnected || isLoading || !!connString} />
             </div>
          </div>
        )}

        <div style={{marginTop: '15px'}}>
            {!isConnected ? (
            <button onClick={handleConnect} disabled={isLoading}>Connect</button>
            ) : (
            <button onClick={handleDisconnect} disabled={isLoading}>Disconnect</button>
            )}
        </div>

        {isLoading && <p>Loading...</p>}
        {error && <p style={{ color: 'red' }}>Error: {error}</p>}
        {message && <p style={{ color: 'green' }}>{message}</p>}
      </div>
    </div>
  );
}

export default DataSourceSelectionPage; 