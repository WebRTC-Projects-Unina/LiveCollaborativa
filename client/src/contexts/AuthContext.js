import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabase';

const AuthContext = createContext();

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth deve essere usato dentro AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true); //impostata a true per mostrare caricamento iniziale

    // GET PROFILE
    const getProfile = async (userId) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('Errore profilo:', error);
            }
            return data || null;
        } catch (error) {
            console.error('Errore profilo:', error);
            return null;
        }
    };

    // CREATE PROFILE
    const createProfile = async (userId, username, email) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .insert([{ id: userId, username, email }])
                .select()
                .single();

            if (error) {
                if (error.code === '23505') {
                    return await getProfile(userId);
                }
                return { id: userId, username, email, isFallback: true };
            }
            return data;
        } catch (error) {
            return { id: userId, username, email, isFallback: true };
        }
    };

    // CHECK USERNAME
    const checkUsernameAvailable = async (username) => {
        try {
            const queryPromise = supabase
                .from('profiles')
                .select('id')
                .eq('username', username)
                .single();

            const timeoutPromise = new Promise((resolve) => {
                setTimeout(() => resolve({ data: null, error: { code: 'TIMEOUT' } }), 2000);
            });

            const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
            
            if (error && (error.code === 'PGRST116' || error.code === 'TIMEOUT')) {
                return true;
            }
            return !data;
        } catch (error) {
            return true;
        }
    };

    // LOGIN
    const signIn = async (loginField, password) => {
        try {
            setLoading(true);
            const isEmail = loginField.includes('@');
            let email = loginField;

            if (!isEmail) {
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('email')
                    .eq('username', loginField)
                    .single();

                if (!profileData?.email) {
                    return { data: null, error: { message: 'Username non trovato' } };
                }
                email = profileData.email;
            }

            const { data, error } = await supabase.auth.signInWithPassword({ email, password });

            if (error) {
                return { 
                    data: null, 
                    error: { message: isEmail ? 'Email o password errati' : 'Username o password errati' } 
                };
            }

            return { data, error: null };
        } catch (error) {
            return { data: null, error: { message: 'Errore di connessione' } };
        } finally {
            setLoading(false);
        }
    };

    // REGISTRAZIONE
    const signUp = async (email, password, username) => {
        try {
            setLoading(true);

            const isAvailable = await checkUsernameAvailable(username);
            if (!isAvailable) {
                return { data: null, error: { message: 'Username già in uso' } };
            }

            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: { data: { username } }
            });

            if (error) {
                let message = 'Errore durante la registrazione';
                if (error.message.includes('User already registered')) {
                    message = 'Email già registrata';
                } else if (error.message.includes('Password should be at least 6 characters')) {
                    message = 'Password minimo 6 caratteri';
                }
                return { data: null, error: { message } };
            }

            if (data.user && !data.session) {
                return {
                    data,
                    error: null,
                    message: 'Registrazione completata! Controlla la tua email per confermare.'
                };
            }

            return { data, error: null };
        } catch (error) {
            return { data: null, error: { message: 'Errore di connessione' } };
        } finally {
            setLoading(false);
        }
    };

    // LOGOUT
    const signOut = async () => {
        try {
            await supabase.auth.signOut();
            setUser(null);
            setProfile(null);
            window.location.reload();
        } catch (error) {
            console.error('Errore logout:', error);
            window.location.reload();
        }
    };

    // LOAD PROFILE
    const loadUserProfile = async (user) => {
        try {
            let userProfile = await getProfile(user.id);
            
            if (!userProfile) {
                const username = user.user_metadata?.username || user.email.split('@')[0];
                userProfile = await createProfile(user.id, username, user.email);
            }

            setProfile(userProfile);
        } catch (error) {
            console.error('Errore caricamento profilo:', error);
            setProfile({
                id: user.id,
                username: user.user_metadata?.username || user.email.split('@')[0],
                email: user.email,
                isFallback: true
            });
        }
    };

    // INIZIALIZZAZIONE CON PERSISTENZA SESSIONE
    useEffect(() => {
        let mounted = true;

        const initAuth = async () => {
            try {
                // RECUPERA SESSIONE ESISTENTE (per persistenza dopo refresh)
                const { data: { session } } = await supabase.auth.getSession();

                if (mounted) {
                    if (session?.user) {
                        console.log('Sessione trovata:', session.user.email);
                        setUser(session.user);
                        await loadUserProfile(session.user);
                    }
                    setLoading(false);
                }

                // LISTENER PER CAMBIAMENTI AUTENTICAZIONE - messo a disposizione da Supabase
                const { data: { subscription } } = supabase.auth.onAuthStateChange(
                    async (event, session) => {
                        console.log(' Auth event:', event);

                        if (!mounted) return;

                        if (event === 'SIGNED_IN' && session?.user) {
                            setUser(session.user);
                            await loadUserProfile(session.user);
                        } else if (event === 'SIGNED_OUT') {
                            setUser(null);
                            setProfile(null);
                        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
                            setUser(session.user);
                        }
                    }
                );

                return () => {
                    subscription?.unsubscribe(); // Cleanup del listener
                };
            } catch (error) {
                console.error('Errore init:', error);
                if (mounted) setLoading(false);
            }
        };

        initAuth();

        return () => {
            mounted = false;
        };
    }, []);

    const value = {
        user,
        profile,
        loading,
        signIn,
        signUp,
        signOut,
        checkUsernameAvailable
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};