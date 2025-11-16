import React, { useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCollaborativeLive } from '../hooks/useCollaborativeLive';
import socketService from '../services/socketService';

const LiveRoom = () => {
    const { profile } = useAuth();
    const {
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
        attachStreamToVideo //Callback per assegnazione manuale
    } = useCollaborativeLive();

    const remoteRefs = useRef({ //Refs per i video remoti
        ref1: useRef(null),
        ref2: useRef(null),
        ref3: useRef(null),
        ref4: useRef(null)
    });

    // Assegna refs ai video remoti
    useEffect(() => {
        const newRefs = {};
        const refs = remoteRefs.current;
        
        roomState.streamers.forEach((streamer, index) => {
            const mySocketId = socketService.socket?.id; // escludo me stesso
            if (streamer.socketId !== mySocketId) {
                const refKey = `ref${index + 1}`; // ref1, ref2, ...
                if (refs[refKey]?.current) {
                    newRefs[streamer.socketId] = refs[refKey].current; // assegno ref
                }
            }
        });
        
        remoteStreamsRefs.current = newRefs;
    }, [roomState.streamers, remoteStreamsRefs]);

    // Prova ad assegnare il video quando localVideoRef è pronto
    useEffect(() => {
        if (isStreaming && localVideoRef.current) {
            console.log(' [LiveRoom] Video ref pronto, provo assegnazione...');
            const timer = setTimeout(() => {
                attachStreamToVideo(); // responsabile di settare localVideoRef.current.srcObject = localStream 
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [isStreaming, attachStreamToVideo]);

    const getGridLayout = () => {
        //  calcola la griglia CSS in base al numero di streamer
        const total = roomState.streamers.length;
        if (total <= 1) return '1fr';
        if (total <= 2) return 'repeat(2, 1fr)';
        return 'repeat(2, 1fr)';
    };

    const renderVideoSlot = (index) => { // costruisce ogni card di slot
        const streamer = roomState.streamers[index];
        const mySocketId = socketService.socket?.id;
        const isMe = streamer?.socketId === mySocketId; // è il mio slot?
        const refs = remoteRefs.current;

        return (
            <div
                key={`slot-${index}`}
                style={{
                    backgroundColor: '#000',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    position: 'relative',
                    aspectRatio: '16/9',
                    border: isMe ? '3px solid #007bff' : '1px solid #333'
                }}
            >
                {streamer ? (
                    <>
                        {/* VIDEO ELEMENT */}
                        <video
                            ref={isMe ? localVideoRef : refs[`ref${index + 1}`]} // ref dinamico
                            autoPlay
                            playsInline
                            muted={isMe}
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                transform: isMe ? 'scaleX(-1)' : 'none',
                                backgroundColor: '#000'
                            }}
                        />
                        
                        {/* BADGE USERNAME */}
                        <div style={{
                            position: 'absolute',
                            bottom: '8px',
                            left: '8px',
                            backgroundColor: 'rgba(0,0,0,0.8)',
                            color: 'white',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <div style={{
                                width: '8px',
                                height: '8px',
                                backgroundColor: '#dc3545',
                                borderRadius: '50%',
                                animation: 'pulse 2s infinite'
                            }}></div>
                            <span style={{ fontWeight: '600' }}>
                                {streamer.username} {isMe && '(Tu)'}
                            </span>
                            {isMe && (
                                <div style={{
                                    display: 'flex',
                                    gap: '4px',
                                    marginLeft: '8px',
                                    paddingLeft: '8px',
                                    borderLeft: '1px solid rgba(255,255,255,0.3)'
                                }}>
                                    <span>{isAudioEnabled ? '🎤' : '🔇'}</span>
                                    <span>{isVideoEnabled ? '📹' : '📵'}</span>
                                </div>
                            )}
                        </div>

                        {/* CONTROLLI (solo per me) */}
                        {isMe && (
                            <div style={{
                                position: 'absolute',
                                top: '8px',
                                right: '8px',
                                display: 'flex',
                                gap: '8px'
                            }}>
                                <button
                                    onClick={toggleAudio}
                                    style={{
                                        padding: '10px 12px',
                                        backgroundColor: isAudioEnabled ? '#28a745' : '#dc3545',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        fontSize: '1.2rem'
                                    }}
                                >
                                    {isAudioEnabled ? '🎤' : '🔇'}
                                </button>
                                
                                <button
                                    onClick={toggleVideo}
                                    style={{
                                        padding: '10px 12px',
                                        backgroundColor: isVideoEnabled ? '#28a745' : '#dc3545',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        fontSize: '1.2rem'
                                    }}
                                >
                                    {isVideoEnabled ? '📹' : '📵'}
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        color: '#666'
                    }}>
                        
                        <span>Free Slot</span>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={{
            backgroundColor: '#f8f9fa',
            padding: '1.5rem',
            borderRadius: '8px',
            border: '1px solid #dee2e6',
            height: '100%',
            display: 'flex',
            flexDirection: 'column'
        }}>
            {/* HEADER */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem'
            }}>
                <h3 style={{ margin: 0 }}>Collaborative Live Room </h3>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                {!isStreaming ? (
                    <button
                        onClick={requestJoinLive}
                        disabled={!canJoinLive || isRequestingJoin}
                        style={{
                            padding: '0.75rem 1.5rem',
                            backgroundColor: (canJoinLive && !isRequestingJoin) ? '#28a745' : '#6c757d',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: (canJoinLive && !isRequestingJoin) ? 'pointer' : 'not-allowed',
                            fontSize: '1rem',
                            fontWeight: '500'
                        }}
                    >
                        {isRequestingJoin ? ' Entrando...' : 
                         !canJoinLive ? ' Live Piena' : 
                         'Join Live'}
                    </button>
                ) : (
                    <button
                        onClick={leaveLive}
                        style={{
                            padding: '0.75rem 1.5rem',
                            backgroundColor: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '1rem',
                            fontWeight: '500'
                        }}
                    >
                         Esci
                    </button>
                )}
                </div>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: '#666' }}>
                    <span>Streamers: {roomState.streamers.length}/{roomState.maxStreamers}</span>
                    <span>Viewers: {roomState.viewersCount}</span>
                    <span>Users: {roomState.totalUsers}</span>
                </div>
            </div>

            {/* ERRORE */}
            {error && (
                <div style={{
                    backgroundColor: '#f8d7da',
                    color: '#721c24',
                    padding: '0.75rem',
                    borderRadius: '4px',
                    marginBottom: '1rem'
                }}>
                    {error}
                </div>
            )}

            

            {/* GRIGLIA VIDEO */}
            <div style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: getGridLayout(),
                gap: '1rem',
                marginBottom: '1rem'
            }}>
                {[0, 1, 2, 3].map(renderVideoSlot)}
            </div>


            {/* INFO STREAMING */}
            {isStreaming && (
                <div style={{
                    marginTop: '1rem',
                    padding: '0.75rem',
                    backgroundColor: '#d1ecf1',
                    borderRadius: '4px',
                    fontSize: '0.85rem',
                    color: '#0c5460',
                    textAlign: 'center',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                }}>
                    <span> In live come <strong>{profile?.username}</strong></span>
                    {myPosition && <span>(Pos. {myPosition})</span>}
                    <span style={{ 
                        marginLeft: '8px', 
                        paddingLeft: '8px', 
                        borderLeft: '1px solid #0c5460' 
                    }}>
                        {isAudioEnabled ? '🎤' : '🔇'} {isVideoEnabled ? '📹' : '📵'}
                    </span>
                </div>
            )}

            <style>
                {`
                    @keyframes pulse {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.5; }
                    }
                `}
            </style>
        </div>
    );
};

export default LiveRoom;