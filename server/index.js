const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());

const PORT = process.env.PORT || 5050;

let connectedUsers = new Map();

// Struttura Live Room globale
let liveRoom = {
  streamers: new Map(),
  viewers: new Set(),
  maxStreamers: 4,
  roomId: 'main-live-room'
};

// Route di test
app.get('/', (req, res) => {
  res.json({ 
    message: 'Server WebRTC Live attivo!',
    timestamp: new Date().toISOString(),
    connectedUsers: connectedUsers.size,
    activeStreamers: liveRoom.streamers.size,
    viewers: liveRoom.viewers.size
  });
});

function getRoomStats() {
  const streamersCount = liveRoom.streamers.size;
  const viewersCount = liveRoom.viewers.size;
  const totalUsers = connectedUsers.size;
  
  return {
    streamersCount,
    viewersCount,
    totalUsers,
    availableSlots: liveRoom.maxStreamers - streamersCount
  };
}



// Gestione connessioni Socket.IO
io.on('connection', (socket) => {
  console.log('Nuovo utente connesso:', socket.id);

  socket.on('join-chat', (userData) => {
    // Salvo i dati dell'utente
    socket.userData = userData;
    connectedUsers.set(socket.id, userData);

    // Unisciti alla room generale
    socket.join(liveRoom.roomId);

    // Aggiungo utente come viewer di default
    if(!liveRoom.streamers.has(socket.id)){
      liveRoom.viewers.add(socket.id);
    }

    const stats = getRoomStats();
    console.log(`👤 Utente ${userData.username} si è unito alla live room.`);

    socket.to(liveRoom.roomId).emit('user-joined', {
      username: userData.username,
      message: `${userData.username} si è unito alla chat.`,
    });

    // Invia lo stato attuale della live room al nuovo utente
    sendLiveRoomUpdate();
  });

  socket.on('chat-message', (data) => {
    if (socket.userData) {
      const messageData = {
        id: Date.now() + Math.random(),
        username: socket.userData.username,
        message: data.message,
        timestamp: new Date().toISOString(),
        userId: socket.userData.id,
        type: data.type || 'message',
        isStreamer: liveRoom.streamers.has(socket.id)
      };

      console.log(` Messaggio da ${socket.userData.username}: ${messageData.message}`); 
      io.to(liveRoom.roomId).emit('new-message', messageData);
    }
  });

  // === LIVE STREAMING EVENTS ===
  socket.on('request-join-live', () => {
    const userData = socket.userData;

    if (!userData) {
      console.log(' Dati utente non trovati per:', socket.id);
      socket.emit('live-error', {message: 'Dati utente non trovati'});
      return;
    }

    // Controllo se già è streamer
    if (liveRoom.streamers.has(socket.id)){
      console.log(' Utente già streamer:', userData.username);
      socket.emit('live-error', {message: 'Sei già uno streamer'});
      return;
    }

    // Controlla se c'è posto
    if (liveRoom.streamers.size >= liveRoom.maxStreamers){
      console.log(' Live room piena');
      socket.emit('live-error', {
        message: `Live room piena! Massimo ${liveRoom.maxStreamers} streamer.`
      });
      return;
    }

    // Aggiungo come streamer
    liveRoom.streamers.set(socket.id, {
      userData: userData,
      joinedAt: new Date().toISOString(),
      socketId: socket.id
    });

    // Rimuovo da viewer
    liveRoom.viewers.delete(socket.id);

    //const stats = getRoomStats();
    console.log(` ${userData.username} è entrato in live! (${liveRoom.streamers.size}/${liveRoom.maxStreamers})`);


    const updatedRoomState = {
        streamers: Array.from(liveRoom.streamers.entries()).map(([socketId, data]) => ({
            socketId: socketId,
            username: data.userData.username,
            userId: data.userData.id,
            joinedAt: data.joinedAt
        })),
        maxStreamers: liveRoom.maxStreamers,
        viewersCount: liveRoom.viewers.size,
        availableSlots: liveRoom.maxStreamers - liveRoom.streamers.size,
        totalUsers: connectedUsers.size
    };

    // Prima invia conferma al richiedente
    socket.emit('live-joined', {
      streamerId: socket.id,
      position: liveRoom.streamers.size,
      success: true,
      roomState: updatedRoomState
    });
    console.log(`Segnale live-joined inviato a ${userData.username}`);

    // Poi notifico a tutti gli altri
    socket.to(liveRoom.roomId).emit('streamer-joined', {
      streamerId: socket.id,
      username: userData.username,
      message: ` ${userData.username} è entrato in live!`
    });

    io.to(liveRoom.roomId).emit('live-room-update', updatedRoomState);
    console.log(` Live room update IMMEDIATO: ${updatedRoomState.streamers.length} streamer`);
    // Infine aggiorna lo stato
    setTimeout(() => sendLiveRoomUpdate(), 100); // Piccolo delay per sincronizzazione
  });

  socket.on('leave-live', () => {
    if (liveRoom.streamers.has(socket.id)) {
      const streamerData = liveRoom.streamers.get(socket.id);
      
      // Rimuovi da streamer
      liveRoom.streamers.delete(socket.id);
      
      // Aggiungi a viewer
      if (connectedUsers.has(socket.id)){
        liveRoom.viewers.add(socket.id);
      }

      const stats = getRoomStats();
      console.log(`${streamerData.userData.username} ha lasciato la live`);

      // Notifica a tutti
      io.to(liveRoom.roomId).emit('streamer-left', {
        streamerId: socket.id,
        username: streamerData.userData.username,
        message: ` ${streamerData.userData.username} ha lasciato la live`
      });

      socket.emit('live-left');
      sendLiveRoomUpdate();
    }
  });

  // WEBRTC SIGNALING
  socket.on('offer', (data) => {
    console.log(` Offer da ${socket.userData?.username} a ${data.targetId}`);
    io.to(data.targetId).emit('offer', {
      from: socket.id,
      fromUsername: socket.userData?.username,
      offer: data.offer
    });
  });

  socket.on('answer', (data) => {
    console.log(` Answer da ${socket.userData?.username} a ${data.targetId}`);
    io.to(data.targetId).emit('answer', {
      from: socket.id,
      fromUsername: socket.userData?.username,
      answer: data.answer
    });
  });
  
  socket.on('ice-candidate', (data) => {
    console.log(` ICE candidate da ${socket.userData?.username} a ${data.targetId}`);
    io.to(data.targetId).emit('ice-candidate', {
      from: socket.id,
      fromUsername: socket.userData?.username,
      candidate: data.candidate
    });
  });

  socket.on('disconnect', () => {
    if (socket.userData) {
      console.log(` ${socket.userData.username} si è disconnesso`);

      // Rimuovo da streamer se era presente
      if(liveRoom.streamers.has(socket.id)) {
        const streamerData = liveRoom.streamers.get(socket.id);
        liveRoom.streamers.delete(socket.id);
        
        io.to(liveRoom.roomId).emit('streamer-left', {
          streamerId: socket.id,
          username: streamerData.userData.username,
          message: ` ${streamerData.userData.username} si è disconnesso dalla live`
        });
      }

      // Rimuovo da viewer
      liveRoom.viewers.delete(socket.id);

      // Rimuovo da utenti connessi
      connectedUsers.delete(socket.id);

      const stats = getRoomStats();
      console.log(` Dopo disconnessione | Totale: ${stats.totalUsers}, Streamers: ${stats.streamersCount}, Viewers: ${stats.viewersCount}`);
      // Notifica disconnessione generale
      socket.to(liveRoom.roomId).emit('user-left', {
        username: socket.userData.username,
        message: `${socket.userData.username} ha lasciato la chat.`,
      });

      sendLiveRoomUpdate();
    }
  });

  socket.on('error', (error) => {
    console.error(' Errore Socket.IO:', error);
  });
});

// Funzione per aggiornamento stato live room
function sendLiveRoomUpdate() {
  const streamers = Array.from(liveRoom.streamers.entries()).map(([socketId, data]) => ({
    socketId: socketId, // Questo è l'ID del socket
    username: data.userData.username,
    userId: data.userData.id, // Questo è l'ID utente Supabase
    joinedAt: data.joinedAt
  }));

  const stats = getRoomStats();

  const roomState = {
    streamers: streamers,
    maxStreamers: liveRoom.maxStreamers,
    viewersCount: liveRoom.viewers.size,
    availableSlots: liveRoom.maxStreamers - liveRoom.streamers.size,
    totalUsers: connectedUsers.size
  };

  io.to(liveRoom.roomId).emit('live-room-update', roomState);
  console.log(`📊 Live room update: ${streamers.length} streamer, ${liveRoom.viewers.size} viewer`);
}

server.listen(PORT, () => {
  console.log(` Server WebRTC in ascolto sulla porta ${PORT}`);
  console.log(` Live Room collaborativa attiva (Max ${liveRoom.maxStreamers} streamer)`);
});