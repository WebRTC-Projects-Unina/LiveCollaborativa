import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Auth from './components/Auth';
import Chat from './components/Chat';
import LiveRoom from './components/LiveRoom';
import socketService from './services/socketService';
import './App.css';

const MainApp = () => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: '#f0f2f5'
      }}>
        <div style={{
          padding: '2rem',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #007bff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem auto'
          }}></div>
          <p style={{ margin: 0, color: '#666' }}>Caricamento...</p>
        </div>
      </div>
    );
  }

  // Login o Dashboard
  if (!user) {
    return <Auth />;
  }

  return <Dashboard />;
};

const Dashboard = () => {
  const { user, profile, signOut } = useAuth();
  
  const displayUsername = profile?.username || user?.email?.split('@')[0] || 'Utente';
  
  useEffect(() => {
    // Connetti al socket appena la Dashboard viene caricata
    if (user && profile) {
      const userData = {
        id: user.id,
        email: user.email,
        username: profile.username || user.email.split('@')[0]
      };
      console.log('[Dashboard] Connessione Socket.io...');
      socketService.connect(userData);

      // al logout ci disconnettiamo
      return () => {
        console.log('[Dashboard] Disconnessione Socket.io...');
        socketService.disconnect();
      };
    }
  }, [user, profile]);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f0f2f5',
      padding: '2rem'
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '2rem',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem',
          borderBottom: '1px solid #eee',
          paddingBottom: '1rem'
        }}>
          <h1 style={{ margin: 0, color: '#333' }}>Collaborative Live</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ color: '#666', fontSize: '0.9rem' }}>
              Hello, <strong>{displayUsername}</strong>
            </span>
            <button
              onClick={signOut}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              Logout
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: '2rem',
          minHeight: '600px'
        }}>
          <LiveRoom />
          <Chat />
        </div>

        {/* Debug Info */}
        {/*process.env.NODE_ENV === 'development' && (
          <div style={{
            marginTop: '1.5rem',
            padding: '0.5rem',
            backgroundColor: '#f60f0fff',
            borderRadius: '4px',
            fontSize: '0.7rem',
            color: '#db1717ff'
          }}>
            User: {user?.email} | Username: {profile?.username} | Display: {displayUsername}
          </div>
        )*/}
      </div>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
      <MainApp />
    </AuthProvider>
  );
}

export default App;