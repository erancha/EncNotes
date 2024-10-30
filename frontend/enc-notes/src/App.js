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
        <p className='App-header'>EncNotes</p>
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
            <p className='header1'>EncNotes Web App</p>
            <ul className='header2'>
              <li>The application enables authenticated users to add, edit, delete, and list encrypted notes.</li>
              <li>Each user is isolated from others through the use of unique encryption keys.</li>
              <li>Users sharing the same account receive immediate notifications of any changes made by other users.</li>
            </ul>

            <div className='link-container'>
              <a href='http://www.linkedin.com/in/eran-hachmon' target='_blank' rel='noopener noreferrer'>
                LinkedIn
              </a>
              <a href='https://github.com/erancha/aws-encrypted-notes' target='_blank' rel='noopener noreferrer'>
                GitHub
              </a>
            </div>

            <a href='https://lucid.app/publicSegments/view/e66e819e-6abc-434d-bb9d-5d7a007887da/image.jpeg' target='_blank' rel='noopener noreferrer'>
              <img src='https://lucid.app/publicSegments/view/e66e819e-6abc-434d-bb9d-5d7a007887da/image.jpeg' alt='No User Authenticated' />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
