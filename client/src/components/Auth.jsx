import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const Auth = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [loginField, setLoginField] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [usernameStatus, setUsernameStatus] = useState({ checking: false, available: null });
    const [submitting, setSubmitting] = useState(false);
    
    const { signIn, signUp, checkUsernameAvailable, loading } = useAuth();

    // USERNAME CHECK con doppio timeout di sicurezza
    useEffect(() => {
        if (!isLogin && username && username.length >= 1) {
            const timeoutId = setTimeout(async () => { //avvia un timer
                console.log('[AUTH-FORM] Check username:', username);
                setUsernameStatus({ checking: true, available: null });
                
                try {
                    // Promessa con timeout aggiuntivo
                    const checkPromise = checkUsernameAvailable(username);
                    const timeoutPromise = new Promise((resolve) => {
                        setTimeout(() => {
                            console.log('[AUTH-FORM] Timeout form - considero disponibile');
                            resolve(true);
                        }, 4000);
                    });

                    const isAvailable = await Promise.race([checkPromise, timeoutPromise]);

                    console.log('[AUTH-FORM] Risultato:', isAvailable);
                    setUsernameStatus({ checking: false, available: isAvailable });
                    
                } catch (error) {
                    console.error(' [AUTH-FORM] Errore check:', error);
                    setUsernameStatus({ checking: false, available: true });
                }
            }, 600);

            return () => {
                clearTimeout(timeoutId); //se continuo a digitare, riavvio il timeout
                setUsernameStatus(prev => ({ ...prev, checking: false }));
            };
        } else {
            setUsernameStatus({ checking: false, available: null });
        }
    }, [username, isLogin, checkUsernameAvailable]); //Invece di cambiare ad ogni render, cambio solo quando cambiano questi valori

    useEffect(() => { //Così quando cambio stato non restano falsi indicatori
        setUsernameStatus({ checking: false, available: null });
    }, [isLogin]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        // Validazioni
        if (isLogin) {
            if (!loginField?.trim() || !password) { //evita spazi vuoti
                setError('Tutti i campi sono richiesti');
                return;
            }
        } else {
            if (!email?.trim() || !password || !username?.trim()) {
                setError('Tutti i campi sono richiesti');
                return;
            }
            if (password.length < 6) {
                setError('Password minimo 6 caratteri');
                return;
            }
            if (username.length < 3) {
                setError('Username minimo 3 caratteri');
                return;
            }
            if (usernameStatus.available === false) {
                setError('Username non disponibile');
                return;
            }
            if (usernameStatus.checking) {
                setError('Attendi la verifica dell\'username...');
                return;
            }
        }

        setSubmitting(true);

        try {
            let result;
            
            if (isLogin) {
                result = await signIn(loginField.trim(), password);
            } else {
                result = await signUp(email.trim(), password, username.trim());
            }
            
            if (result?.error) {
                setError(result.error.message);
            } else {
                if (!isLogin && result?.message) {
                    setSuccess(result.message);
                    setTimeout(() => {
                        setIsLogin(true);
                        resetForm();
                    }, 2000);
                } else {
                    setSuccess(isLogin ? 'Login effettuato!' : 'Registrazione completata!');
                }
            }
        } catch (error) {
            console.error('[AUTH-FORM] Errore:', error);
            setError('Errore di connessione. Riprova.');
        } finally {
            setSubmitting(false);
        }
    };

    const resetForm = () => {
        setEmail('');
        setPassword('');
        setUsername('');
        setLoginField('');
        setError('');
        setSuccess('');
        setUsernameStatus({ checking: false, available: null });
    };

    const switchMode = () => {
        setIsLogin(!isLogin);
        resetForm();
    };

    // Se AuthContext è in loading, mostra loader
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
                    <p style={{ margin: 0, color: '#666' }}>Autenticazione...</p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            minHeight: '100vh',
            backgroundColor: '#f0f2f5',
            padding: '1rem'
        }}>
            <div style={{
                backgroundColor: 'white',
                padding: '2rem',
                borderRadius: '8px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                width: '100%',
                maxWidth: '400px'
            }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h1 style={{ 
                        margin: '0 0 0.5rem 0',
                        color: '#007bff',
                        fontSize: '2rem'
                    }}>
                        WebRTC Live Collaborativa
                    </h1>
                    <p style={{ 
                        margin: 0,
                        color: '#666',
                        fontSize: '1rem'
                    }}>
                        {isLogin ? 'Accedi al tuo account' : 'Crea il tuo account'}
                    </p>
                </div>
                
                {/* DEBUG USERNAME STATUS */}
                {process.env.NODE_ENV === 'development' && !isLogin && (
                    <div style={{
                        marginBottom: '1rem',
                        padding: '0.5rem',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        color: '#666'
                    }}>
                        DEBUG: checking={usernameStatus.checking.toString()}, available={String(usernameStatus.available)}
                    </div>
                )}
                
                {/* Messaggi */}
                {error && (
                    <div style={{
                        backgroundColor: '#f8d7da',
                        color: '#721c24',
                        padding: '0.75rem',
                        borderRadius: '4px',
                        marginBottom: '1rem',
                        fontSize: '0.9rem'
                    }}>
                         {error}
                    </div>
                )}
                
                {success && (
                    <div style={{
                        backgroundColor: '#d4edda',
                        color: '#155724',
                        padding: '0.75rem',
                        borderRadius: '4px',
                        marginBottom: '1rem',
                        fontSize: '0.9rem'
                    }}>
                         {success}
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit}>
                    {isLogin ? (
                        <>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ 
                                    display: 'block', 
                                    marginBottom: '0.5rem',
                                    fontWeight: '500'
                                }}>
                                    Email o Username
                                </label>
                                <input
                                    type="text"
                                    value={loginField}
                                    onChange={(e) => setLoginField(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        border: '1px solid #ddd',
                                        borderRadius: '4px',
                                        fontSize: '1rem',
                                        boxSizing: 'border-box'
                                    }}
                                    placeholder="email@esempio.com o nomeutente"
                                    disabled={submitting}
                                />
                            </div>
                            
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ 
                                    display: 'block', 
                                    marginBottom: '0.5rem',
                                    fontWeight: '500'
                                }}>
                                    Password
                                </label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        border: '1px solid #ddd',
                                        borderRadius: '4px',
                                        fontSize: '1rem',
                                        boxSizing: 'border-box'
                                    }}
                                    placeholder="Inserisci la password"
                                    disabled={submitting}
                                />
                            </div>
                        </>
                    ) : (
                        <>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ 
                                    display: 'block', 
                                    marginBottom: '0.5rem',
                                    fontWeight: '500'
                                }}>
                                    Username
                                </label>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        border: `1px solid ${
                                            usernameStatus.checking ? '#ffc107' :
                                            usernameStatus.available === true ? '#28a745' :
                                            usernameStatus.available === false ? '#dc3545' :
                                            '#ddd'
                                        }`,
                                        borderRadius: '4px',
                                        fontSize: '1rem',
                                        boxSizing: 'border-box'
                                    }}
                                    placeholder="nomeutente (solo lettere, numeri, _)"
                                    disabled={submitting}
                                    maxLength="20"
                                />
                                {username && username.length >= 3 && (
                                    <div style={{ 
                                        fontSize: '0.75rem', 
                                        marginTop: '0.25rem',
                                        minHeight: '1rem'
                                    }}>
                                        {usernameStatus.checking ? (
                                            <span style={{ color: '#ffc107' }}> Controllo disponibilità...</span>
                                        ) : usernameStatus.available === true ? (
                                            <span style={{ color: '#28a745' }}> Username disponibile</span>
                                        ) : usernameStatus.available === false ? (
                                            <span style={{ color: '#dc3545' }}> Username non disponibile</span>
                                        ) : null}
                                    </div>
                                )}
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ 
                                    display: 'block', 
                                    marginBottom: '0.5rem',
                                    fontWeight: '500'
                                }}>
                                    Email
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        border: '1px solid #ddd',
                                        borderRadius: '4px',
                                        fontSize: '1rem',
                                        boxSizing: 'border-box'
                                    }}
                                    placeholder="email@esempio.com"
                                    disabled={submitting}
                                />
                            </div>
                            
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ 
                                    display: 'block', 
                                    marginBottom: '0.5rem',
                                    fontWeight: '500'
                                }}>
                                    Password
                                </label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        border: '1px solid #ddd',
                                        borderRadius: '4px',
                                        fontSize: '1rem',
                                        boxSizing: 'border-box'
                                    }}
                                    placeholder="Minimo 6 caratteri"
                                    disabled={submitting}
                                />
                            </div>
                        </>
                    )}
                    
                    <button
                        type="submit"
                        disabled={submitting || (!isLogin && usernameStatus.checking)}
                        style={{
                            width: '100%',
                            padding: '0.75rem',
                            backgroundColor: (submitting || (!isLogin && usernameStatus.checking)) ? '#6c757d' : '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '1rem',
                            cursor: (submitting || (!isLogin && usernameStatus.checking)) ? 'not-allowed' : 'pointer',
                            fontWeight: '500'
                        }}
                    >
                        {submitting ? (
                            isLogin ? ' Accesso...' : ' Registrazione...'
                        ) : (!isLogin && usernameStatus.checking) ? (
                            '⏳ Verifico username...'
                        ) : (
                            isLogin ? ' Accedi' : ' Registrati'
                        )}
                    </button>
                </form>
                
                <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                    <button
                        type="button"
                        onClick={switchMode}
                        disabled={submitting}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#007bff',
                            textDecoration: 'underline',
                            cursor: submitting ? 'not-allowed' : 'pointer',
                            fontSize: '0.9rem'
                        }}
                    >
                        {isLogin 
                            ? 'Non hai un account? Registrati' 
                            : 'Hai già un account? Accedi'
                        }
                    </button>
                </div>
            </div>

            <style>
                {`
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `}
            </style>
        </div>
    );
};

export default Auth;