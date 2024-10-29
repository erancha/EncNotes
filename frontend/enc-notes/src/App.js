import React, { useState, useEffect } from 'react';
import Authentication from './components/Authentication';
import CrudOperations from './components/CrudOperations';
import './App.css';

function App() {
  const [restApiUrl, setRestApiUrl] = useState('');
  const [webSocketApiUrl, setWebSocketApiUrl] = useState('');
  const [build, setBuild] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [cognitoConfig, setCognitoConfig] = useState(null);
  const [userDisplayName, setUserDisplayName] = useState('');
  const [showOverview, setShowOverview] = useState(false);

  // Effect to fetch configuration and set restApiUrl and Cognito settings
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch(`/appConfig.json?v=${new Date().getTime()}`); // cache-busting technique
        const config = await response.json();
        setBuild(config.BUILD);
        setRestApiUrl(config.REST_API_URL);
        setWebSocketApiUrl(config.WEBSOCKET_API_URL);
        setCognitoConfig(config.COGNITO);
      } catch (error) {
        console.error('Error fetching config:', error);
        setErrorMessage('Error fetching configuration. Please try again later.');
      }
    };

    const initialize = async () => {
      await fetchConfig();
    };

    initialize();
  }, []);

  return (
    <div className='App'>
      <div className='build-info'>Build {build}</div>
      <div className={`body ${showOverview ? 'with-overview' : 'without-overview'}`}>
        <h1>Encrypted Notes</h1>
        {userDisplayName ? (
          <div>
            <div className='welcome-auth-container'>
              <p className='animate-fade-flash'>Welcome, {userDisplayName}</p>
              {cognitoConfig && (
                <Authentication
                  cognitoConfig={cognitoConfig}
                  setUserDisplayName={setUserDisplayName}
                  setErrorMessage={setErrorMessage}
                  signoutOnly={true}
                />
              )}
            </div>
            <CrudOperations restApiUrl={restApiUrl} webSocketApiUrl={webSocketApiUrl} userDisplayName={userDisplayName} />
          </div>
        ) : cognitoConfig ? (
          <>
            <Authentication cognitoConfig={cognitoConfig} setUserDisplayName={setUserDisplayName} setErrorMessage={setErrorMessage} />
            <div className='overview-toggle'>
              <button onClick={() => setShowOverview(!showOverview)} className='text-button'>
                {showOverview ? 'Hide Overview' : 'Show Overview'}
              </button>
            </div>
          </>
        ) : (
          <div>Loading...</div>
        )}
        {errorMessage && <div style={{ color: 'red' }}>{errorMessage}</div>}

        {!userDisplayName && showOverview && (
          <div className='app-overview'>
            <hr />
            <p className='header1'>AWS-based web app for managing encrypted notes.</p>
            <p className='header2'>
              Authenticated users can securely add, edit, delete, and list notes, isolated from other users using unique encryption keys.
            </p>

            <a href='https://lucid.app/publicSegments/view/5e9dd4cb-d614-40ba-9287-1e4c0af8dfa3/image.jpeg' target='_blank' rel='noopener noreferrer'>
              <img src='https://lucid.app/publicSegments/view/5e9dd4cb-d614-40ba-9287-1e4c0af8dfa3/image.jpeg' alt='No User Authenticated' />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
