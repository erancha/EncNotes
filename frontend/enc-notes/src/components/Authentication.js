import React, { useState, useEffect, useCallback } from 'react';
import { Amplify } from 'aws-amplify';
import {} from 'aws-amplify/auth';
import { signInWithRedirect, signIn, signUp, fetchAuthSession, signOut } from 'aws-amplify/auth';
import { UserCircle, LogIn, LogOut } from 'lucide-react';
import { jwtDecode } from 'jwt-decode';

const Authentication = ({ cognitoConfig, setErrorMessage, setUserDisplayName, signoutOnly }) => {
  const [usernameInput, setUsernameInput] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [authMethod /*, setAuthMethod*/] = useState('google');

  // Function to get the current user and save it in the state
  const checkUser = useCallback(async () => {
    try {
      const { tokens } = await fetchAuthSession();
      if (tokens) setUserDisplayName(jwtDecode(tokens.idToken.toString()).name);
    } catch (error) {
      if (error.name === 'UserUnAuthenticatedException' || error.name === 'AuthUserPoolException') {
        console.debug({ error });
      } else {
        console.error('Error checking user:', error);
      }
      setUserDisplayName('');
    }
  }, [setUserDisplayName]);

  // Memoized function to configure Amplify and check the user
  const initAuthentication = useCallback(async () => {
    const amplifyConfig = {
      Auth: {
        Cognito: {
          loginWith: {
            oauth: {
              domain: cognitoConfig.domain,
              scopes: ['email', 'profile', 'openid'],
              redirectSignIn: [cognitoConfig.redirectSignIn],
              redirectSignOut: [cognitoConfig.redirectSignOut],
              responseType: 'code',
              clientId: cognitoConfig.userPoolWebClientId,
              providers: ['Google'],
            },
          },
          userPoolId: cognitoConfig.userPoolId,
          userPoolClientId: cognitoConfig.userPoolWebClientId,
          signUpVerificationMethod: 'code',
        },
      },
    };
    Amplify.configure(amplifyConfig);
    await checkUser(); // Now check user state after configuration
  }, [cognitoConfig, checkUser]); // Include dependencies here

  useEffect(() => {
    initAuthentication(); // Call the initialization function on mount
  }, [initAuthentication]); // Now include initAuthentication as a dependency

  // function to handle authentication using google provider
  const handleGoogleSignIn = async () => {
    try {
      await signInWithRedirect({ provider: 'Google' });
    } catch (error) {
      console.error('Error signing in with Google:', error);
      setErrorMessage('Error signing in with Google: ' + error.message);
    }
  };

  // functions to handle signin, signup and signout directly with Cognito
  const handleSignIn = async () => {
    if (!usernameInput || !password) {
      setErrorMessage('Username and password cannot be empty.');
      return;
    }

    try {
      const { isSignedIn, nextStep } = await signIn({ usernameInput, password });
      if (isSignedIn) {
        setUserDisplayName('');
        setUsernameInput('');
        setPassword('');
        setErrorMessage('');
      } else {
        console.log('Additional sign-in step required:', nextStep);
      }
    } catch (error) {
      console.error('Error signing in', error);
      setErrorMessage('Error signing in: ' + error.message);
    }
  };

  const handleSignUp = async () => {
    if (!usernameInput || !password || !email) {
      setErrorMessage('Username, password, and email are required.');
      return;
    }

    try {
      await signUp({
        usernameInput,
        password,
        attributes: { email },
      });
      setIsConfirming(true);
      setErrorMessage('');
      alert('Sign-up successful! Please check your email for a confirmation code.');
    } catch (error) {
      console.error('Error signing up', error);
      setErrorMessage(error.message);
    }
  };

  const handleConfirmSignUp = async () => {
    if (!usernameInput || !confirmationCode) {
      setErrorMessage('Username and confirmation code are required.');
      return;
    }

    try {
      await signUp.confirmSignUp(usernameInput, confirmationCode);
      alert('User confirmed successfully. You can now sign in.');
      setIsSigningUp(false);
      setIsConfirming(false);
      setConfirmationCode('');
      setErrorMessage('');
    } catch (error) {
      console.error('Error confirming sign up', error);
      setErrorMessage('Error confirming sign up: ' + error.message);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setUserDisplayName('');
    } catch (error) {
      console.error('Error signing out:', error);
      setErrorMessage('Error signing out: ' + error.message);
    }
  };

  return (
    <div>
      {signoutOnly ? (
        <button onClick={handleSignOut} className='icon-button' title='Sign Out'>
          <UserCircle size={20} />
          <LogOut size={20} />
          <span className='sr-only'>Sign Out</span>
        </button>
      ) : (
        <div className='animate-fade-flash'>
          <div className='auth-method-selection'>
            <label>Sign In with your Google account</label>
          </div>
          {isSigningUp ? (
            isConfirming ? (
              <div>
                <p>Please check your email for the confirmation code.</p>
                <input type='text' placeholder='Confirmation Code' value={confirmationCode} onChange={(e) => setConfirmationCode(e.target.value)} />
                <button onClick={handleConfirmSignUp}>Confirm Sign Up</button>
              </div>
            ) : (
              <div>
                <input type='text' placeholder='Username' value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} />
                <input type='password' placeholder='Password' value={password} onChange={(e) => setPassword(e.target.value)} />
                <input type='email' placeholder='Email' value={email} onChange={(e) => setEmail(e.target.value)} />
                <button onClick={handleSignUp}>Sign Up</button>
                <button onClick={() => setIsSigningUp(false)}>Back to Sign In</button>
              </div>
            )
          ) : (
            <div>
              {authMethod === 'google' ? (
                <button onClick={handleGoogleSignIn} className='icon-button' title='Sign in with Google'>
                  <UserCircle size={20} />
                  <LogIn size={20} />
                  <span className='sr-only'>Sign in with Google</span>
                </button>
              ) : (
                <div className='standard-auth'>
                  <input type='text' placeholder='Username' value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} />
                  <input type='password' placeholder='Password' value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button onClick={handleSignIn} className='signin-button' title='Sign In'>
                    <LogIn size={20} />
                    Sign In
                  </button>
                  <button onClick={() => setIsSigningUp(true)} className='text-button'>
                    Sign Up
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Authentication;

// {<div className='auth-method-selection'>}
// <label>
//   {<input type='radio' value='google' checked={authMethod === 'google'} onChange={() => setAuthMethod('google')} />}
//   Sign In with your Google account
// </label>
// {<label>
//     <input type='radio' value='standard' checked={authMethod === 'standard'} onChange={() => setAuthMethod('standard')} />
//     Username/Password Authentication
//   </label>
// </div>}
