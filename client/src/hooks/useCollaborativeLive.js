import { useState, useRef, useCallback, useEffect } from 'react';
import socketService from '../services/socketService';

export const useCollaborativeLive = () => {
    const [isStreaming, setIsStreaming] = useState(false);
    const [roomState, setRoomState] = useState({
        streamers: [],
        viewersCount: 0,
        maxStreamers: 4,
        availableSlots: 4,
        totalUsers: 0
    });
    const [myPosition, setMyPosition] = useState(null); // Posizione nella griglia
    const [error, setError] = useState(null);
    const [isRequestingJoin, setIsRequestingJoin] = useState(false);
    const [isAudioEnabled, setIsAudioEnabled] = useState(true);
    const [isVideoEnabled, setIsVideoEnabled] = useState(true);

    // Riferimenti
    const localVideoRef = useRef(null); //ref video locale, dove viene mostrata la preview della camera
    const localStreamRef = useRef(null); //ref allo stream locale, serve per gestire i track senza rinegoziare
    const remoteStreamsRefs = useRef({}); //ref agli stream remoti, mappa socketId => videoRef
    const peerConnections = useRef({}); //mappa socketId => RTCPeerConnection, permette di gestire separatamente offer/answer per ogni peer
    const listenersSetupRef = useRef(false); //per assicurarsi che i listener vengano settati una sola volta
    const needsP2PSetupRef = useRef(false); //indica se è necessario fare setup P2P (dopo join live)
    const isStreamingRef = useRef(false); //traccia lo stato isStreaming in modo da non avere problemi nei timer
    const pendingOffersRef = useRef(new Set()); // Traccia offer in corso
    const scheduledTimersRef = useRef(new Map()); // registro di timer pianificati
    const generalTimersRef = useRef(new Set()); // registro di timer generici
    const pendingOffersTimeoutsRef = useRef(new Map()); // timer per le offerte

    const iceServersRef = useRef({
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            {
                urls: "turn:openrelay.metered.ca:80",
                username: "openrelayproject",
                credential: "openrelayproject"
            },
            {
                urls: "turn:openrelay.metered.ca:443",
                username: "openrelayproject",
                credential: "openrelayproject"
            },
            {
                urls: "turn:openrelay.metered.ca:443?transport=tcp",
                username: "openrelayproject",
                credential: "openrelayproject"
            }
        ]
    });

    useEffect(() => {
        isStreamingRef.current = isStreaming;
    }, [isStreaming]); // Aggiorna ref mutabile quando isStreaming cambia

    // ========= HELPERS per timers, cleanup, peer close =========

    const clearAllScheduledTimers = useCallback(() => {
        scheduledTimersRef.current.forEach((id) => clearTimeout(id));
        scheduledTimersRef.current.clear();
        generalTimersRef.current.forEach(id => clearTimeout(id));
        generalTimersRef.current.clear();
    }, []);

    const clearPendingOfferTimeout = useCallback((socketId) => { // Rimuove timeout per pending offer
        const t = pendingOffersTimeoutsRef.current.get(socketId); 
        if (t) {
            clearTimeout(t); 
            pendingOffersTimeoutsRef.current.delete(socketId); 
        }
    }, []);

    const closePeer = useCallback((socketId) => { // Chiude e pulisce connessione P2P
        const pc = peerConnections.current[socketId];
        if (pc) {
            try { pc.close(); } catch (e) { /* ignore */ }
            delete peerConnections.current[socketId]; // Rimuovo dalla mappa
        }

        // Rimuovo pending offer
        pendingOffersRef.current.delete(socketId);
        clearPendingOfferTimeout(socketId);

        // Pulisco createOffer schedulati
        const scheduled = scheduledTimersRef.current.get(socketId);
        if (scheduled) {
            clearTimeout(scheduled);
            scheduledTimersRef.current.delete(socketId);
        }

        // Rimuovo remote video ref
        const video = remoteStreamsRefs.current[socketId];
        if (video) {
            try { video.srcObject = null; } catch (e) { /* ignore */ }
            delete remoteStreamsRefs.current[socketId];
        }

        console.log(`closePeer: cleaned ${socketId}`);
    }, [clearPendingOfferTimeout]);

    // ==================== GESTIONE VIDEO LOCALE ====================

    const attachStreamToVideo = useCallback(() => {
        console.log(' [attachStreamToVideo] Tentativo assegnazione...');
        console.log('  - localVideoRef.current:', !!localVideoRef.current);
        console.log('  - localStreamRef.current:', !!localStreamRef.current);
        console.log('  - stream tracks:', localStreamRef.current?.getTracks().length);

        if (!localVideoRef.current || !localStreamRef.current) {
            // senza elemento video o senza stream non ha senso proseguire
            console.log(' [attachStreamToVideo] Ref non disponibili');
            return false;
        }

        try {
            console.log(' [attachStreamToVideo] Assegnazione in corso...');
            
            if (localVideoRef.current.srcObject) {
                console.log(' [attachStreamToVideo] Pulizia srcObject precedente...');
                localVideoRef.current.srcObject = null;
            }

            localVideoRef.current.srcObject = localStreamRef.current; //assegna lo stream al video
            localVideoRef.current.muted = true; //muted per evitare echo
            localVideoRef.current.playsInline = true; //riproduzione inline
            localVideoRef.current.autoplay = true; //autoplay
            
            const immediatePlayPromise = localVideoRef.current.play(); //tentativo play immediato
            if (immediatePlayPromise !== undefined) {
                immediatePlayPromise
                    .then(() => {
                        console.log(' [attachStreamToVideo] VIDEO IN RIPRODUZIONE (immediato)!');
                    })
                    .catch(e => {
                        // play immediato fallito, uso onloadedmetadata come fallback
                        console.log(' [attachStreamToVideo] Play immediato failed, uso onloadedmetadata');
                        
                        localVideoRef.current.onloadedmetadata = () => {
                            console.log(' [attachStreamToVideo] Metadata caricato');
                            localVideoRef.current.play()
                                .then(() => console.log(' [attachStreamToVideo] VIDEO IN RIPRODUZIONE (metadata)!'))
                                .catch(e2 => console.error(' [attachStreamToVideo] Errore play metadata:', e2));
                        };
                    });
            }

            // fallback play dopo 200ms (se ancora paused)
            const fallback = setTimeout(() => {
                if (localVideoRef.current && localVideoRef.current.paused) {
                    localVideoRef.current.play()
                        .then(() => console.log(' [FALLBACK] Video avviato'))
                        .catch(e => console.log(' [FALLBACK] Play failed:', e));
                }
            }, 200);
            generalTimersRef.current.add(fallback);

            console.log(' [attachStreamToVideo] Assegnazione completata');
            return true;
        } catch (error) {
            console.error(' [attachStreamToVideo] Errore:', error);
            return false;
        }
    }, []);

    const startLocalStream = useCallback(async () => {
        try {
            console.log(' Richiesta accesso webcam...');
            
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: { echoCancellation: true, noiseSuppression: true }
            });

            localStreamRef.current = stream;
            
            const audioTrack = stream.getAudioTracks()[0];
            const videoTrack = stream.getVideoTracks()[0];
            
            setIsAudioEnabled(audioTrack?.enabled || false);
            setIsVideoEnabled(videoTrack?.enabled || false);
            
            console.log(' Stream ottenuto!', {
                audio: audioTrack?.enabled,
                video: videoTrack?.enabled,
                videoTrackId: videoTrack?.id
            });

            return stream;

        } catch (err) {
            console.error(' Errore webcam:', err);
            let errorMessage = 'Errore accesso webcam/microfono';
            
            if (err.name === 'NotAllowedError') {
                errorMessage = 'Permesso negato. Autorizza webcam/microfono.';
            } else if (err.name === 'NotFoundError') {
                errorMessage = 'Webcam o microfono non trovati';
            } else if (err.name === 'NotReadableError') {
                errorMessage = 'Dispositivo già in uso';
            }
            
            setError(errorMessage);
            throw err;
        }
    }, []);

    const stopLocalStream = useCallback(() => {
        console.log(' Stop stream...');
        
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                try { track.stop(); } catch (e) { /* ignore */ }
                console.log(` ${track.kind} fermato`);
            });
            localStreamRef.current = null;
        }

        if (localVideoRef.current) {
            try { localVideoRef.current.srcObject = null; } catch (e) { /* ignore */ }
        }

        // Chiudi tutte le PeerConnection e pulisci risorse associate
        Object.keys(peerConnections.current).forEach(id => closePeer(id));
        peerConnections.current = {};
        pendingOffersRef.current.clear();
        pendingOffersTimeoutsRef.current.forEach(t => clearTimeout(t));
        pendingOffersTimeoutsRef.current.clear();
        clearAllScheduledTimers();

        console.log(' Stream fermato');
    }, [closePeer, clearAllScheduledTimers]);

    // ==================== API PUBLICHE ====================

    const requestJoinLive = useCallback(async () => {
        if(isRequestingJoin){
            return;
        }

        try {
            setIsRequestingJoin(true);
            setError(null);
            console.log(' Richiesta join live...');

            await startLocalStream();
            console.log(' Stream pronto, invio richiesta...');

            socketService.requestJoinLive();

        } catch (error) {
            console.error(' Errore join:', error);
            setError(error.message || 'Errore avvio live');
            setIsRequestingJoin(false);
            stopLocalStream();
        }
    }, [startLocalStream, stopLocalStream]);


    const leaveLive = useCallback(() => {
        console.log(' Uscita live...');
        stopLocalStream();
        socketService.leaveLive();
        setIsStreaming(false);
        setMyPosition(null);
        setError(null);
        setIsRequestingJoin(false);
        needsP2PSetupRef.current = false;
    }, [stopLocalStream]);

    const toggleAudio = useCallback(() => {
        if (localStreamRef.current) {
            const track = localStreamRef.current.getAudioTracks()[0];
            if (track) {
                track.enabled = !track.enabled;
                setIsAudioEnabled(track.enabled);
                console.log(' Audio:', track.enabled);
            }
        }
    }, []);

    const toggleVideo = useCallback(() => {
        if (localStreamRef.current) {
            const track = localStreamRef.current.getVideoTracks()[0];
            if (track) {
                track.enabled = !track.enabled;
                setIsVideoEnabled(track.enabled);
                console.log(' Video:', track.enabled);
            }
        }
    }, []);

    // ==================== WEBRTC P2P ====================

    const createPeerConnection = useCallback((targetSocketId) => {
        console.log(` Creazione P2P con ${targetSocketId}`);

        const pc = new RTCPeerConnection(iceServersRef.current); //configuro i server ICE

        // Aggiungo i track locali alla connessione
        
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                // ciascuna traccia viene aggiunta alla connessione
                pc.addTrack(track, localStreamRef.current);
                console.log(` Track ${track.kind} aggiunto per ${targetSocketId}`);
            });
        }

        // Gestione eventi della connessione
        pc.ontrack = (event) => { //chiamato quando il peer remoto invia tracce
            console.log(` Stream remoto ricevuto da ${targetSocketId}`);
            //Verifico stream principale e riferimento video
            if (event.streams[0] && remoteStreamsRefs.current[targetSocketId]) {
                const video = remoteStreamsRefs.current[targetSocketId];
                video.srcObject = event.streams[0];
                video.muted = false; //  mi assicuro che non sia muted
                
                const attemptPlay = (retries = 3) => {
                    if (!video.srcObject) return; // Non provare se non c'è stream
                    
                    video.play()
                        .then(() => console.log(` Video remoto playing: ${targetSocketId}`))
                        .catch(e => {
                            console.log(` Play error (${retries} retry left):`, e.message);
                            if (retries > 0) {
                                const t = setTimeout(() => attemptPlay(retries - 1), 500);
                                generalTimersRef.current.add(t);
                            }
                        });
                };

                // Aspetto un attimo prima del primo play
                const t0 = setTimeout(() => attemptPlay(), 100);
                generalTimersRef.current.add(t0);
            }
        };

        // Gestione ICE candidates
        pc.onicecandidate = (event) => { //chiamato quando viene trovato un nuovo ICE candidate
            if (event.candidate) {
                console.log(` ICE candidate per ${targetSocketId}:`, event.candidate.type);
                socketService.sendIceCandidate(targetSocketId, event.candidate);
            } else { //candidate null indica fine gathering
                console.log(` ICE gathering completo per ${targetSocketId}`);
            }
        };

        pc.onconnectionstatechange = () => {
            console.log(` P2P ${targetSocketId}:`, pc.connectionState);
            
            if (pc.connectionState === 'failed') {
                console.log(` Connessione fallita con ${targetSocketId}`);
                closePeer(targetSocketId);
            } else if (pc.connectionState === 'disconnected') {
                console.log(` Connessione disconnessa con ${targetSocketId}`);
            }
        };

        pc.onicecandidateerror = (event) => { //gestione errori ICE
            console.error(` ICE error con ${targetSocketId}:`, {
                errorCode: event.errorCode,
                errorText: event.errorText
            });
        };

        pc.oniceconnectionstatechange = () => { //monitoraggio stato ICE
            console.log(` ICE state ${targetSocketId}:`, pc.iceConnectionState);
            
            if (pc.iceConnectionState === 'failed') {
                console.log(` ICE failed con ${targetSocketId}`);
                pc.restartIce();
            }
        };

        peerConnections.current[targetSocketId] = pc;
        return pc;
    }, [closePeer]);

    const createOffer = useCallback(async (targetSocketId) => { //Creo e invio offerta SDP
        // previene offer duplicate
        if (pendingOffersRef.current.has(targetSocketId)) {
            console.log(`⚠️ Offer già in corso per ${targetSocketId}, skip`);
            return;
        }

        // Se esiste già una connessione, la chiudo prima
        if (peerConnections.current[targetSocketId]) {
            console.log(` Connessione esistente per ${targetSocketId}, ricreo...`);
            closePeer(targetSocketId);
        }

        try {
            console.log(` Creazione offer per ${targetSocketId}`);
            pendingOffersRef.current.add(targetSocketId); // Marca come in corso
            
            // Timeout di sicurezza per rimuovere il pending se non arriva answer
            const to = setTimeout(() => {
                console.log(` pendingOffer timeout per ${targetSocketId}, rimuovo flag`);
                pendingOffersRef.current.delete(targetSocketId);
                pendingOffersTimeoutsRef.current.delete(targetSocketId);
            }, 15000);
            pendingOffersTimeoutsRef.current.set(targetSocketId, to);


            const pc = createPeerConnection(targetSocketId);
            const offer = await pc.createOffer(); //creo offerta SDP
            await pc.setLocalDescription(offer); //setto come descrizione locale
            
            // Invio l'offerta tramite socket
            socketService.sendOffer(targetSocketId, offer);
            console.log(` Offer inviata a ${targetSocketId}`);
        } catch (error) {
            console.error(` Errore creazione offer per ${targetSocketId}:`, error);
            pendingOffersRef.current.delete(targetSocketId); // Rimuovi se fallisce
            clearPendingOfferTimeout(targetSocketId); // Pulisci timeout

        }
    }, [createPeerConnection, clearPendingOfferTimeout, closePeer]);

    const handleOffer = useCallback(async (data) => {
        try {
            
            console.log(` Ricevuta offer da ${data.from}`);
            
            // Se esiste già una connessione, chiudila
            if (peerConnections.current[data.from]) {
                console.log(` Chiudo connessione esistente con ${data.from}`);
                closePeer(data.from);
            }
            
            const pc = createPeerConnection(data.from); //creo nuova connessione
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer)); //setto descrizione remota

            // se avevamo marcato pending offer verso questo peer, rimuovo            
            pendingOffersRef.current.delete(data.from);
            clearPendingOfferTimeout(data.from);

            if (pc.pendingIceCandidates && pc.pendingIceCandidates.length > 0) {
                console.log(` Processo ${pc.pendingIceCandidates.length} ICE candidates in coda`);
                for (const candidate of pc.pendingIceCandidates) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate)); //aggiungo candidate in coda
                }
                pc.pendingIceCandidates = []; //pulisco la coda
            }
            
            const answer = await pc.createAnswer(); //creo risposta SDP
            await pc.setLocalDescription(answer); //setto come descrizione locale
            
            // Invio la risposta tramite socket
            socketService.sendAnswer(data.from, answer);
            console.log(` Answer inviata a ${data.from}`);
        } catch (error) {
            console.error(` Errore gestione offer da ${data.from}:`, error);
        }
    }, [createPeerConnection, closePeer, clearPendingOfferTimeout]);

    const handleAnswer = useCallback(async (data) => {
        try {
            console.log(` Ricevuta answer da ${data.from}`);
            const pc = peerConnections.current[data.from];
            
            if (!pc) {
                console.log(` PeerConnection non trovata per ${data.from}, ignoro answer`);
                return;
            }

            // Controllo lo stato prima di settare remote description
            if (pc.signalingState !== 'have-local-offer') {
                console.log(`⚠️ Stato signaling errato (${pc.signalingState}), ignoro answer`);
                return;
            }
            
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            pendingOffersRef.current.delete(data.from); // Rimuovo da pending
            clearPendingOfferTimeout(data.from);

            
            if (pc.pendingIceCandidates && pc.pendingIceCandidates.length > 0) {
                console.log(` Processo ${pc.pendingIceCandidates.length} ICE candidates in coda`);
                for (const candidate of pc.pendingIceCandidates) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                }
                pc.pendingIceCandidates = [];
            }
            console.log(` Answer processata da ${data.from}`);
        } catch (error) {
            console.error(` Errore gestione answer da ${data.from}:`, error);
        }
    }, []);

    const handleIceCandidate = useCallback(async (data) => {
        try {
            const pc = peerConnections.current[data.from];
            
            if (!pc) {
                console.log(` PeerConnection non trovata per ${data.from}, ignoro ICE candidate`);
                return;
            }

            if (!data.candidate) {
                console.log(` ICE candidate vuoto da ${data.from}`);
                return;
            }

            if (!pc.remoteDescription) {
                console.log(` Remote description non ancora settata per ${data.from}, salvo in coda...`);
                
                if (!pc.pendingIceCandidates) {
                    pc.pendingIceCandidates = [];
                }
                pc.pendingIceCandidates.push(data.candidate);
                return;
            }

            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            console.log(` ICE candidate aggiunto per ${data.from}`);
            
        } catch (error) {
            // Non loggo errori "Unknown ufrag" (sono normali durante reconnect)
            if (!error.message.includes('Unknown ufrag')) {
                console.error(` Errore gestione ICE candidate da ${data.from}:`, error);
            }
        }
    }, []);

    // ==================== SETUP P2P RITARDATO ====================
    // Dopo il join, se ci sono streamer esistenti, creo connessioni P2P
    // con un useEffect separato per evitare race condition
    useEffect(() => {
        if (needsP2PSetupRef.current && isStreaming && roomState.streamers.length > 0) { // evito setup in momenti sbagliati
            console.log(' Setup P2P con streamer esistenti...');
            console.log(' Streamers nella room:', roomState.streamers);
            
            const mySocketId = socketService.socket?.id; // evito di creare una connessione verso me stesso
            
            roomState.streamers.forEach(streamer => {
                if (streamer.socketId !== mySocketId && !peerConnections.current[streamer.socketId]) {
                    // schedule createOffer e traccio timer per cancellazione se necessario
                    const t = setTimeout(() => {
                        // double-check prima di invocare
                        if (!isStreamingRef.current) return;
                        const stillThere = roomState.streamers.find(s => s.socketId === streamer.socketId);
                        if (!stillThere) return;
                        createOffer(streamer.socketId);
                        scheduledTimersRef.current.delete(streamer.socketId);
                    }, 500);
                    scheduledTimersRef.current.set(streamer.socketId, t);
                }
            });

            needsP2PSetupRef.current = false;
        }
    }, [roomState.streamers, isStreaming, createOffer]);

    // ==================== SETUP LISTENERS ====================

    useEffect(() => {
        if (listenersSetupRef.current) {
            console.log('⚠️ Listeners già configurati, skip');
            return;
        }

        console.log(' Setup listeners UNICO...'); 
        listenersSetupRef.current = true; 

        const handleLiveRoomUpdate = (newState) => { // Aggiorna stato live room
            console.log(' Room update:', newState);
            setRoomState(newState);
        };

        const handleLiveJoined = (data) => { // Conferma join live
            console.log(' Joined live!', data);
            setIsStreaming(true);
            setMyPosition(data.position);
            setIsRequestingJoin(false);

            if (data.roomState) { // Aggiorno stato room se fornito
                console.log(' Room state ricevuto con live-joined:', data.roomState);
                setRoomState(data.roomState);
            }

            console.log(' [IMMEDIATO] Assegnazione video locale...'); 
            const immediateSuccess = attachStreamToVideo();
            console.log(' [IMMEDIATO] Risultato:', immediateSuccess);

            // abilito il flag per far partire lo useEffect centrale che crea le offer
            const t = setTimeout(() => {
                needsP2PSetupRef.current = true;
            }, 500);
            generalTimersRef.current.add(t); 
        };

        const handleLiveError = (error) => {
            console.log(' Live error:', error.message);
            setError(error.message);
            setIsRequestingJoin(false);
            stopLocalStream();
        };

        const handleStreamerJoined = (data) => {
            console.log(' Nuovo streamer:', data.username);
            const mySocketId = socketService.socket?.id;
            
            if (isStreamingRef.current && data.streamerId !== mySocketId) {
                console.log(` Nuovo streamer rilevato, schedule createOffer per ${data.username}`);
                const t = setTimeout(() => {
                    if (!isStreamingRef.current) return;
                    // double-check in roomState
                    createOffer(data.streamerId);
                    scheduledTimersRef.current.delete(data.streamerId);
                }, 800);
                scheduledTimersRef.current.set(data.streamerId, t);
            }
        };

        const handleStreamerLeft = (data) => {
            console.log(' Streamer uscito:', data.username);
            closePeer(data.streamerId);
            console.log(` Connessione P2P chiusa con ${data.username}`);
        };

        const handleLiveLeft = () => {
            console.log(' Uscito dalla live');
            setIsStreaming(false);
            setMyPosition(null);
        };

        socketService.onLiveRoomUpdate(handleLiveRoomUpdate);
        socketService.onLiveJoined(handleLiveJoined);
        socketService.onLiveError(handleLiveError);
        socketService.onStreamerJoined(handleStreamerJoined);
        socketService.onStreamerLeft(handleStreamerLeft);
        socketService.onLiveLeft(handleLiveLeft);
        socketService.onOffer(handleOffer);
        socketService.onAnswer(handleAnswer);
        socketService.onIceCandidate(handleIceCandidate);

        return () => {
            console.log(' Cleanup listeners FINALE');
            listenersSetupRef.current = false;
            socketService.removeLiveListeners();
            clearAllScheduledTimers();
        };
    }, [
        attachStreamToVideo,
        stopLocalStream,
        handleOffer,
        handleAnswer,
        handleIceCandidate,
        createOffer,
        closePeer,
        clearAllScheduledTimers
        //roomState.streamers
    ]);

    useEffect(() => {
        return () => {
            console.log(' Global cleanup');
            stopLocalStream();
            try { socketService.removeLiveListeners(); } catch (e) { /* ignore */ }
        };
    }, [stopLocalStream]);

    // ==================== COMPUTED VALUES ====================

    const canJoinLive = roomState.availableSlots > 0 && !isStreaming && !isRequestingJoin;

    // ==================== RETURN ====================

    return {
        isStreaming,
        roomState,
        myPosition,
        error,
        isRequestingJoin,
        isAudioEnabled,
        isVideoEnabled,
        localVideoRef,
        remoteStreamsRefs,
        requestJoinLive,
        leaveLive,
        toggleAudio,
        toggleVideo,
        canJoinLive,
        attachStreamToVideo
    };
};