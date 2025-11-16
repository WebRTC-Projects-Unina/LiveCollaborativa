WebRTC Collaborative Live-Streaming App

Questa è un'applicazione web per il live-streaming collaborativo. L'app consente ad un numero massimo di 4 utenti di partecipare a una sessione video live mentre altri utenti possono assistere e partecipare a una chat di testo globale in real time.

L'obiettivo principale è dimostrare l'implementazione di un'architettura WebRTC per la comunicazione P2P tra i client, gestita da un server di segnalazione Node.js e un sistema di autenticazione basato su Supabase.

L'applicazione si basa su tre componenti principali che lavorano insieme:

1. Il client (React), responsabile dell'interfaccia utente. AuthContext.js gestisce lo stato globale dell'utente utilizzando il Context di React, useCollaborativeLive.js è un hook custom che incapsula tutta la logica di WebRTC, socketService.js gestisce un'unica connessione Socket.io.

2. Il server (Node.js), fornisce signaling, room manager e chat relay, ma non funziona come media server.

3. Supabase, gestisce l'autenticazione e memorizza gli utenti in un database PostgreSQL