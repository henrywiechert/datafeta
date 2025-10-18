import React, { useState, useEffect, ChangeEvent } from 'react';
import { ConnectionDetails } from '../types';
import { useConnection } from '../contexts/ConnectionContext';
import { Link } from 'react-router-dom';
import styles from './DataSourceSelectionPage.module.css';

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
  
  // CSV configuration options
  const [csvDelimiter, setCsvDelimiter] = useState<string>(',');
  const [csvHasHeader, setCsvHasHeader] = useState<boolean>(true);
  const [csvDecimalSeparator, setCsvDecimalSeparator] = useState<string>('.');
  const [csvThousandsSeparator, setCsvThousandsSeparator] = useState<string>('');
  const [csvDateFormat, setCsvDateFormat] = useState<string>('%Y-%m-%d');
  const [csvTimestampFormat, setCsvTimestampFormat] = useState<string>('%Y-%m-%d %H:%M:%S');
  const [showAdvancedCsvOptions, setShowAdvancedCsvOptions] = useState<boolean>(false);

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
  }, [isConnected, connectionDetails]);

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
      // Add CSV configuration options
      details.csv_delimiter = csvDelimiter;
      details.csv_has_header = csvHasHeader;
      details.csv_decimal_separator = csvDecimalSeparator;
      details.csv_thousands_separator = csvThousandsSeparator;
      details.csv_date_format = csvDateFormat;
      details.csv_timestamp_format = csvTimestampFormat;
    } else {
        if (connString) {
             details.connection_string = connString;
        } else if (host) {
            details.host = host;
            details.port = Number(port) || 8123;  // Default to HTTP port
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
    <div className={styles.container}>
      <h2 className={styles.pageTitle}>Data Source Selection</h2>

      <div className={styles.card}>
        <h3 className={styles.sectionTitle}>Connect to a Data Source</h3>
        
        <div className={styles.formGroup}>
          <label className={styles.label}>Data Source Type</label>
          <select 
            className={styles.select} 
            value={connectionType} 
            onChange={(e) => setConnectionType(e.target.value as 'csv' | 'clickhouse')} 
            disabled={isConnected || isLoading}
          >
            <option value="csv">CSV File</option>
            <option value="clickhouse">ClickHouse</option>
          </select>
        </div>

        {connectionType === 'csv' && (
          <div className={styles.formGroup}>
            <div className={styles.fileUpload}>
              <label className={styles.label}>CSV File</label>
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleFileChange} 
                disabled={isConnected || isLoading}
                className={styles.input}
              />
              {filePath && <div className={styles.selectedFile}>Selected: {filePath}</div>}
            </div>

            {/* CSV Configuration Options */}
            <div className={styles.csvConfigSection}>
              <button 
                type="button"
                className={styles.toggleButton}
                onClick={() => setShowAdvancedCsvOptions(!showAdvancedCsvOptions)}
                disabled={isConnected || isLoading}
              >
                {showAdvancedCsvOptions ? '▼' : '▶'} Advanced CSV Options
              </button>

              {showAdvancedCsvOptions && (
                <div className={styles.advancedOptions}>
                  <div className={styles.formRow}>
                    <div className={styles.formField}>
                      <label className={styles.label}>Delimiter</label>
                      <select 
                        className={styles.select}
                        value={csvDelimiter} 
                        onChange={(e) => setCsvDelimiter(e.target.value)}
                        disabled={isConnected || isLoading}
                      >
                        <option value=",">Comma (,)</option>
                        <option value=";">Semicolon (;)</option>
                        <option value="\t">Tab</option>
                        <option value="|">Pipe (|)</option>
                      </select>
                    </div>
                    <div className={styles.formField}>
                      <label className={styles.label}>Header Row</label>
                      <select 
                        className={styles.select}
                        value={csvHasHeader ? 'true' : 'false'} 
                        onChange={(e) => setCsvHasHeader(e.target.value === 'true')}
                        disabled={isConnected || isLoading}
                      >
                        <option value="true">Yes (first line)</option>
                        <option value="false">No</option>
                      </select>
                    </div>
                  </div>

                  <div className={styles.formRow}>
                    <div className={styles.formField}>
                      <label className={styles.label}>Decimal Separator</label>
                      <select 
                        className={styles.select}
                        value={csvDecimalSeparator} 
                        onChange={(e) => setCsvDecimalSeparator(e.target.value)}
                        disabled={isConnected || isLoading}
                      >
                        <option value=".">Period (.) - e.g., 1234.56</option>
                        <option value=",">Comma (,) - e.g., 1234,56</option>
                      </select>
                    </div>
                    <div className={styles.formField}>
                      <label className={styles.label}>Thousands Separator</label>
                      <select 
                        className={styles.select}
                        value={csvThousandsSeparator} 
                        onChange={(e) => setCsvThousandsSeparator(e.target.value)}
                        disabled={isConnected || isLoading}
                      >
                        <option value="">None - e.g., 1234567</option>
                        <option value="comma">Comma (,) - e.g., 1,234,567</option>
                        <option value="space">Space - e.g., 1 234 567</option>
                        <option value="apostrophe">Apostrophe (') - e.g., 1'234'567</option>
                      </select>
                    </div>
                  </div>

                  <div className={styles.formRow}>
                    <div className={styles.formField}>
                      <label className={styles.label}>Date Format</label>
                      <select 
                        className={styles.select}
                        value={csvDateFormat} 
                        onChange={(e) => setCsvDateFormat(e.target.value)}
                        disabled={isConnected || isLoading}
                      >
                        <option value="%Y-%m-%d">YYYY-MM-DD (2024-10-17)</option>
                        <option value="%d.%m.%Y">DD.MM.YYYY (17.10.2024)</option>
                        <option value="%m/%d/%Y">MM/DD/YYYY (10/17/2024)</option>
                        <option value="%d/%m/%Y">DD/MM/YYYY (17/10/2024)</option>
                      </select>
                    </div>
                    <div className={styles.formField}>
                      <label className={styles.label}>Timestamp Format</label>
                      <select 
                        className={styles.select}
                        value={csvTimestampFormat} 
                        onChange={(e) => setCsvTimestampFormat(e.target.value)}
                        disabled={isConnected || isLoading}
                      >
                        <option value="%Y-%m-%d %H:%M:%S">YYYY-MM-DD HH:MM:SS</option>
                        <option value="%d.%m.%Y %H:%M:%S">DD.MM.YYYY HH:MM:SS</option>
                        <option value="%m.%d.%Y %H:%M:%S">MM.DD.YYYY HH:MM:SS</option>
                        <option value="%m/%d/%Y %H:%M:%S">MM/DD/YYYY HH:MM:SS</option>
                        <option value="%d/%m/%Y %H:%M:%S">DD/MM/YYYY HH:MM:SS</option>
                        <option value="%Y-%m-%d %H:%M">YYYY-MM-DD HH:MM</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {connectionType === 'clickhouse' && (
          <>
            <div className={styles.connectionStringSection}>
              <div className={styles.formField}>
                <label className={styles.label}>Connection String</label>
                <input 
                  className={`${styles.input} ${styles.inputWide}`}
                  type="text" 
                  value={connString} 
                  onChange={(e) => setConnString(e.target.value)} 
                  placeholder="clickhouse://user:pass@host:port/db" 
                  disabled={isConnected || isLoading} 
                />
              </div>
            </div>

            <div className={styles.orDivider}>OR provide details below</div>

            <div className={styles.fieldsSection}>
              <div className={styles.formRow}>
                <div className={styles.formField}>
                  <label className={styles.label}>Host</label>
                  <input 
                    className={styles.input}
                    type="text" 
                    value={host} 
                    onChange={(e) => setHost(e.target.value)} 
                    disabled={isConnected || isLoading || !!connString} 
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.label}>Port</label>
                  <input 
                    className={`${styles.input} ${styles.inputSmall}`}
                    type="number" 
                    value={port} 
                    onChange={(e) => setPort(e.target.value)} 
                    disabled={isConnected || isLoading || !!connString} 
                  />
                </div>
              </div>
              
              <div className={styles.formRow}>
                <div className={styles.formField}>
                  <label className={styles.label}>User</label>
                  <input 
                    className={styles.input}
                    type="text" 
                    value={user} 
                    onChange={(e) => setUser(e.target.value)} 
                    disabled={isConnected || isLoading || !!connString} 
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.label}>Password</label>
                  <input 
                    className={styles.input}
                    type="password" 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    disabled={isConnected || isLoading || !!connString} 
                  />
                </div>
              </div>
              
              <div className={styles.formField}>
                <label className={styles.label}>Database</label>
                <input 
                  className={styles.input}
                  type="text" 
                  value={dbName} 
                  onChange={(e) => setDbName(e.target.value)} 
                  disabled={isConnected || isLoading || !!connString} 
                />
              </div>
            </div>
          </>
        )}

        <div className={styles.buttonContainer}>
          {!isConnected ? (
            <button 
              className={styles.button} 
              onClick={handleConnect} 
              disabled={isLoading}
            >
              Connect
            </button>
          ) : (
            <button 
              className={`${styles.button} ${styles.disconnectButton}`} 
              onClick={handleDisconnect} 
              disabled={isLoading}
            >
              Disconnect
            </button>
          )}
        </div>

        <div className={styles.messageContainer}>
          {isLoading && <div className={styles.loadingText}>Connecting...</div>}
          {error && <div className={styles.errorMessage}>Error: {error}</div>}
          {message && (
            <div className={styles.successMessage}>
              {message} {isConnected ? <Link to="/visualize">Go to Visualization</Link> : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DataSourceSelectionPage;