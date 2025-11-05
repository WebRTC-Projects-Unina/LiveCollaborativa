import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import socketService from '../services/socketService';

const Chat = () => {
    const { user, profile } = useAuth();
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const messagesEndRef = useRef(null);

    // Connessione Socket.IO
    useEffect(() => {
        if (user && profile) {
            console.log('[Chat] Inizializzazione connessione socket per:', profile.username);
            
            const userData = {
                id: user.id,
                email: user.email,
                username: profile.username || user.email.split('@')[0]
            };

            // Connetti al socket
            const socket = socketService.connect(userData);
            
            // Verifica stato connessione ogni secondo
            const connectionCheck = setInterval(() => {
                const status = socketService.getConnectionStatus();
                console.log(' [Chat] Stato connessione:', status);
                setIsConnected(status.connected);
            }, 1000);

            // Setup listeners
            const handleMessage = (messageData) => {
                console.log('[Chat] Nuovo messaggio ricevuto:', messageData);
                setMessages(prev => [...prev, messageData]);
            };

            const handleUserJoined = (data) => {
                console.log('[Chat] Utente entrato:', data);
                setMessages(prev => [...prev, {
                    id: Date.now(),
                    username: 'Sistema',
                    message: data.message,
                    timestamp: new Date().toISOString(),
                    type: 'system'
                }]);
            };

            const handleUserLeft = (data) => {
                console.log(' [Chat] Utente uscito:', data);
                setMessages(prev => [...prev, {
                    id: Date.now(),
                    username: 'Sistema',
                    message: data.message,
                    timestamp: new Date().toISOString(),
                    type: 'system'
                }]);
            };

            socketService.onMessage(handleMessage);
            socketService.onUserJoined(handleUserJoined);
            socketService.onUserLeft(handleUserLeft);

            return () => {
                clearInterval(connectionCheck);
                socketService.removeAllListeners();
            };
        }
    }, [user, profile]);

    // Scroll automatico
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = (e) => { // Invio messaggio
        e.preventDefault(); // Previeni refresh pagina
        
        if (!newMessage.trim()) return;
        
        if (!isConnected) {
            console.error(' [Chat] Impossibile inviare messaggio: socket non connesso');
            return;
        }

        console.log(' [Chat] Invio messaggio:', newMessage);
        
        socketService.sendMessage({
            message: newMessage,
            type: 'message'
        });

        setNewMessage('');
    };

    const formatTime = (timestamp) => {
        return new Date(timestamp).toLocaleTimeString('it-IT', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div style={{
            backgroundColor: '#f8f9fa',
            border: '1px solid #dee2e6',
            borderRadius: '8px',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
        }}>
            {/* Header Chat */}
            <div style={{
                padding: '1rem',
                borderBottom: '1px solid #dee2e6',
                backgroundColor: 'white',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <h3 style={{ margin: 0, color: '#333', fontSize: '1.1rem' }}>💬 Chat Live</h3>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.8rem'
                }}>
                    <div style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: isConnected ? '#28a745' : '#dc3545'
                    }}></div>
                    <span style={{ color: isConnected ? '#28a745' : '#dc3545' }}>
                        {isConnected ? 'Online' : 'Disconnesso'}
                    </span>
                </div>
            </div>

            {/* STATO DEBUG */}
            {process.env.NODE_ENV === 'development' && (
                <div style={{
                    padding: '0.5rem',
                    backgroundColor: '#e9ecef',
                    fontSize: '0.7rem',
                    color: '#666',
                    borderBottom: '1px solid #dee2e6'
                }}>
                    Socket: {socketService.getConnectionStatus().socketId || 'null'} | 
                    Connesso: {isConnected.toString()} | 
                    User: {profile?.username}
                </div>
            )}

            {/* Area Messaggi */}
            <div style={{
                flex: 1,
                padding: '1rem',
                overflowY: 'auto',
                backgroundColor: 'white'
            }}>
                {messages.length === 0 ? (
                    <div style={{
                        textAlign: 'center',
                        color: '#6c757d',
                        padding: '2rem',
                        fontStyle: 'italic'
                    }}>
                        {isConnected ? 
                            'Nessun messaggio ancora. Inizia la conversazione!' : 
                            'Connessione in corso...'
                        }
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div key={msg.id} style={{
                            marginBottom: '0.75rem',
                            padding: '0.5rem',
                            backgroundColor: msg.type === 'system' ? '#e9ecef' : '#ffffff',
                            border: msg.type === 'system' ? '1px solid #dee2e6' : 'none',
                            borderRadius: '8px',
                            borderLeft: msg.isStreamer ? '4px solid #007bff' : '4px solid transparent'
                        }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '0.25rem'
                            }}>
                                <span style={{
                                    fontWeight: 'bold',
                                    color: msg.type === 'system' ? '#6c757d' : '#333',
                                    fontSize: '0.9rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}>
                                    {msg.isStreamer && '🎥'} {msg.username}
                                </span>
                                <span style={{
                                    fontSize: '0.7rem',
                                    color: '#6c757d'
                                }}>
                                    {formatTime(msg.timestamp)}
                                </span>
                            </div>
                            <div style={{
                                color: msg.type === 'system' ? '#6c757d' : '#333',
                                fontSize: '0.9rem',
                                wordBreak: 'break-word'
                            }}>
                                {msg.message}
                            </div>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Messaggio */}
            <form onSubmit={sendMessage} style={{
                padding: '1rem',
                borderTop: '1px solid #dee2e6',
                backgroundColor: 'white'
            }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder={isConnected ? "Scrivi un messaggio..." : "Connessione in corso..."}
                        disabled={!isConnected}
                        style={{
                            flex: 1,
                            padding: '0.75rem',
                            border: '1px solid #dee2e6',
                            borderRadius: '4px',
                            fontSize: '0.9rem',
                            backgroundColor: isConnected ? 'white' : '#f8f9fa',
                            color: isConnected ? '#333' : '#6c757d'
                        }}
                    />
                    <button
                        type="submit"
                        disabled={!newMessage.trim() || !isConnected}
                        style={{
                            padding: '0.75rem 1rem',
                            backgroundColor: (!newMessage.trim() || !isConnected) ? '#6c757d' : '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: (!newMessage.trim() || !isConnected) ? 'not-allowed' : 'pointer',
                            fontSize: '0.9rem'
                        }}
                    >
                        Invia
                    </button>
                </div>
            </form>
        </div>
    );
};

export default Chat;

