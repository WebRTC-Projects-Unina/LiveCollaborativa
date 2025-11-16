import { io } from "socket.io-client";

class SocketService {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.userData = null;
        this.listeners = new Map();
    }

    on(event, callback) { // Registrazione listener per problemi di race condition
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback); // Aggiunge callback all'insieme
        if (this.socket) {
            // Se l'utente è connesso, registra subito il listener per evitare race condition
            this.socket.on(event, callback); 
        }
    }

    off(event, callback) {
        const set = this.listeners.get(event);
        if (set && set.has(callback)) {
            set.delete(callback);
            if (this.socket) {
                this.socket.off(event, callback);
            }
            if (set.size === 0) this.listeners.delete(event);
        }
    }

    // Rimuove tutti i listener registrati tramite questo service
    removeAllListeners() {
        if (this.socket) {
            for (const [event, callbacks] of this.listeners.entries()) {
                for (const cb of callbacks) {
                    try { this.socket.off(event, cb); } catch (e) { /* ignore */ }
                }
            }
        }
        this.listeners.clear();
    }

    connect(userData) {
        this.userData = userData;
        if (!this.socket) { // Se non c'è una socket attiva, si crea una nuova connessione
            const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5050';
            console.log('Connessione Socket.io: ', SOCKET_URL);
            
            this.socket = io(SOCKET_URL, {
                transports: ['websocket', 'polling'],
                upgrade: true,
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000
            });

            //Setup listeners prima della connessione
            this.socket.on('connect', () => {
                console.log(' Connesso al server Socket.io - ID:', this.socket.id);
                this.connected = true;

                // Join alla chat dopo la connessione
                if (this.userData) {
                    console.log('Re-Join chat:', this.userData);
                    this.socket.emit('join-chat', this.userData);
                }
            });

            this.socket.on('disconnect', (reason) => {
                console.log(' Disconnesso dal server Socket.io - Motivo:', reason);
                this.connected = false;
            });

            this.socket.on('connect_error', (error) => {
                console.error(' Errore connessione Socket.io:', error);
                this.connected = false;
            });

            // gestione reconnect: ri-emit join-chat
            this.socket.on('reconnect', (attemptNumber) => {
                console.log(' Riconnesso (attempt):', attemptNumber);
                this.connected = true;
                if (this.userData) {
                    console.log(' Re-join chat (reconnect):', this.userData);
                    this.socket.emit('join-chat', this.userData);
                }
            });

            // se c'erano listener registrati prima della connessione, (ri)registrali sulla socket
            for (const [event, callbacks] of this.listeners.entries()) {
                for (const cb of callbacks) {
                    this.socket.on(event, cb);
                }
            }

            // Log per debug
            this.socket.on('live-room-update', (data) => {
                console.log('[SocketService] Ricevuto live-room-update:', data);
            });

        } else {
            console.log('Socket già connesso, riuso esistente');

            // Se userData è cambiato, ri-join
            if (this.userData && this.connected) {
                console.log(' Re-join chat:', this.userData);
                this.socket.emit('join-chat', this.userData);
            }
        }
        
        return this.socket;
    }

    disconnect() {
        if (this.socket) {                
            this.socket.disconnect();
            this.socket = null;
            this.connected = false;
            console.log(' Socket.io disconnesso');
        }
    } // non rimuovo la mappa listeners così da poter ri-attach se si richiama connect()

    // === METODI CHAT ===
    sendMessage(messageData) {
        if (this.connected && this.socket) {
            console.log('Invio messaggio:', messageData);
            this.socket.emit('chat-message', messageData);
        } else {
            console.error('Impossibile inviare messaggio: socket non connesso');
        }
    }

    onMessage(callback) {
        this.on('new-message', callback);
    }
    
    offMessage(callback) { 
        this.off('new-message', callback); 
    }


    onUserJoined(callback) {
        this.on('user-joined', callback);
    }

    offUserJoined(callback) { 
        this.off('user-joined', callback); 
    }


    onUserLeft(callback) {
        this.on('user-left', callback);
    }

    offUserLeft(callback) { 
        this.off('user-left', callback); 
    }


    // === METODI LIVE COLLABORATIVA ===
    requestJoinLive() {
        if (this.connected && this.socket) {
            console.log('[SocketService] Richiesta join live - SocketID:', this.socket.id);
            this.socket.emit('request-join-live');
        } else {
            console.error('Impossibile richiedere join live: socket non connesso');
        }
    }

    leaveLive() {
        if (this.connected && this.socket) {
            console.log('[SocketService] Leave live');
            this.socket.emit('leave-live');
        }
    }

    // === WEBRTC SIGNALING ===
    sendOffer(targetId, offer) {
        if (this.connected && this.socket) {
            console.log('[SocketService] Sending offer to:', targetId);
            this.socket.emit('offer', { targetId, offer });
        }
    }

    sendAnswer(targetId, answer) {
        if (this.connected && this.socket) {
            console.log('[SocketService] Sending answer to:', targetId);
            this.socket.emit('answer', { targetId, answer });
        }
    }

    sendIceCandidate(targetId, candidate) {
        if (this.connected && this.socket) {
            console.log(' [SocketService] Sending ICE candidate to:', targetId);
            this.socket.emit('ice-candidate', { targetId, candidate });
        }
    }

    // === LISTENERS LIVE (con wrapper che traccia i callback) ===
    onLiveRoomUpdate(callback) { this.on('live-room-update', callback); }
    offLiveRoomUpdate(callback) { this.off('live-room-update', callback); }

    onLiveJoined(callback) { this.on('live-joined', callback); }
    offLiveJoined(callback) { this.off('live-joined', callback); }

    onLiveLeft(callback) { this.on('live-left', callback); }
    offLiveLeft(callback) { this.off('live-left', callback); }

    onLiveError(callback) { this.on('live-error', callback); }
    offLiveError(callback) { this.off('live-error', callback); }

    onStreamerJoined(callback) { this.on('streamer-joined', callback); }
    offStreamerJoined(callback) { this.off('streamer-joined', callback); }

    onStreamerLeft(callback) { this.on('streamer-left', callback); }
    offStreamerLeft(callback) { this.off('streamer-left', callback); }

    // === WEBRTC SIGNALING LISTENERS ===
    onOffer(callback) { this.on('offer', callback); }
    offOffer(callback) { this.off('offer', callback); }

    onAnswer(callback) { this.on('answer', callback); }
    offAnswer(callback) { this.off('answer', callback); }

    onIceCandidate(callback) { this.on('ice-candidate', callback); }
    offIceCandidate(callback) { this.off('ice-candidate', callback); }

    // === CONNESSIONE ===
    onConnect(callback) { this.on('connect', callback); }
    offConnect(callback) { this.off('connect', callback); }

    onDisconnect(callback) { this.on('disconnect', callback); }
    offDisconnect(callback) { this.off('disconnect', callback); }

    // Stato connessione
    getConnectionStatus() {
        return {
            connected: this.connected,
            socketId: this.socket?.id || null,
            hasSocket: !!this.socket
        };
    }



    // === CLEANUP ===
    removeAllListeners() {
        if (this.socket) {
            this.socket.removeAllListeners('new-message');
            this.socket.removeAllListeners('user-joined');
            this.socket.removeAllListeners('user-left');
            this.removeLiveListeners();
        }
    }

    removeLiveListeners() {
        if (this.socket) {
            this.socket.removeAllListeners('live-room-update');
            this.socket.removeAllListeners('live-joined');
            this.socket.removeAllListeners('live-left');
            this.socket.removeAllListeners('live-error');
            this.socket.removeAllListeners('streamer-joined');
            this.socket.removeAllListeners('streamer-left');
            this.socket.removeAllListeners('offer');
            this.socket.removeAllListeners('answer');
            this.socket.removeAllListeners('ice-candidate');
        }
    }
}

export default new SocketService(); // Singleton, così tutti sono su un'unica connessione