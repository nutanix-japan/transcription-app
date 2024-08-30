const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");
const mic = require('mic');
const dotenv = require("dotenv");
const session = require('express-session');
const deepl = require('deepl-node');

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(session({
  secret: process.env.SESSION_SECRET || 'your_session_secret',
  resave: false,
  saveUninitialized: true,
}));

app.get('/', (req, res) => {
  res.send('Server is running');
});

const sendDebugToClient = (ws, message) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'debug', data: message }));
  }
};

const authKey = process.env.DEEPL_AUTH_KEY; // Add this to your .env file
const translator = new deepl.Translator(authKey);

const supportedLanguages = {
  'ja': 'Japanese',
  'ko': 'Korean',
  'ZH-HANT': 'Chinese (Traditional)',
  'es': 'Spanish'
};

wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection');
  sendDebugToClient(ws, 'New WebSocket connection established');
  
  let deepgramConnection;
  let micInstance;
  let isDeepgramConnected = false;
  let totalAudioBytesSent = 0;
  let lastAudioSentTimestamp = 0;
  let currentLanguage = 'ja'; // Default to Japanese
  let isReceivingAudio = false;
  let isMuted = false;
  let isWebSocketClosed = false;

  const setupDeepgram = () => {
    if (isDeepgramConnected || isWebSocketClosed) return;

    const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

    console.log("Creating Deepgram connection...");
    sendDebugToClient(ws, "Creating Deepgram connection...");
    
    deepgramConnection = deepgram.listen.live({
      model: "nova-2",
      language: "en-US",
      smart_format: true,
      interim_results: false,
      punctuate: true,
      encoding: "linear16",
      channels: 1,
      sample_rate: 16000,
      endpointing: 300
    });

    deepgramConnection.addListener(LiveTranscriptionEvents.Open, () => {
      if (isWebSocketClosed) {
        console.log("WebSocket closed, closing Deepgram connection");
        deepgramConnection.finish();
        return;
      }
      console.log("Deepgram connection opened.");
      sendDebugToClient(ws, "Deepgram connection opened");
      isDeepgramConnected = true;
      ws.send(JSON.stringify({ type: 'status', data: 'Connected' }));

      deepgramConnection.addListener(LiveTranscriptionEvents.Transcript, async (data) => {
        const transcript = data.channel.alternatives[0].transcript;
        sendDebugToClient(ws, `Raw transcript data: ${JSON.stringify(data)}`);
        sendDebugToClient(ws, `Extracted transcript: ${transcript}`);
        
        if (transcript && transcript.trim() !== '') {
          sendDebugToClient(ws, `Received non-empty transcript: ${transcript}`);
          
          try {
            const result = await translator.translateText(transcript, null, currentLanguage);
            sendDebugToClient(ws, `Translated text: ${result.text}`);
            ws.send(JSON.stringify({ 
              type: 'transcript', 
              data: { 
                original: transcript, 
                translated: result.text,
                language: supportedLanguages[currentLanguage]
              }
            }));
          } catch (error) {
            console.error('Translation error:', error);
            sendDebugToClient(ws, `Translation error: ${error.message}`);
          }
        } else {
          sendDebugToClient(ws, "Received empty transcript");
        }
      });

      setupMicrophone();
    });

    deepgramConnection.addListener(LiveTranscriptionEvents.Error, (err) => {
      console.error('Deepgram error:', err);
      sendDebugToClient(ws, `Deepgram error: ${err.message}`);
      ws.send(JSON.stringify({ type: 'error', data: 'Transcription error occurred' }));
    });

    deepgramConnection.addListener(LiveTranscriptionEvents.Close, () => {
      console.log('Deepgram connection closed');
      sendDebugToClient(ws, 'Deepgram connection closed');
      isDeepgramConnected = false;
      ws.send(JSON.stringify({ type: 'status', data: 'Disconnected' }));
      
      if (!isWebSocketClosed && ws.readyState === WebSocket.OPEN) {
        setTimeout(() => {
          sendDebugToClient(ws, 'Attempting to reconnect to Deepgram...');
          setupDeepgram();
        }, 5000);
      }
    });

    deepgramConnection.addListener('error', (error) => {
      console.error('Unhandled Deepgram error:', error);
      sendDebugToClient(ws, `Unhandled Deepgram error: ${error.message}`);
    });
  };

  const setupMicrophone = () => {
    micInstance = mic({
      rate: '16000',
      channels: '1',
      debug: false,
      channels: 1,
      interim_results: false,
      punctuate: true,
      sample_rate: 16000,
      endpointing: 300,
      exitOnSilence: 6
    });

    const micInputStream = micInstance.getAudioStream();

    micInputStream.on('data', (data) => {
      if (isDeepgramConnected && deepgramConnection.getReadyState() === WebSocket.OPEN) {
        deepgramConnection.send(data);
        totalAudioBytesSent += data.length;
        const now = Date.now();
        if (now - lastAudioSentTimestamp >= 5000) {  // Log every 5 seconds
          sendDebugToClient(ws, `Sent ${totalAudioBytesSent} total bytes of audio data to Deepgram`);
          lastAudioSentTimestamp = now;
        }
      } else {
        sendDebugToClient(ws, `Microphone data received, but Deepgram connection is not open. Ready state: ${deepgramConnection ? deepgramConnection.getReadyState() : 'undefined'}, isDeepgramConnected: ${isDeepgramConnected}`);
        
        // If Deepgram is not connected, attempt to reconnect
        if (!isDeepgramConnected) {
          sendDebugToClient(ws, 'Attempting to reconnect to Deepgram...');
          setupDeepgram();
        }
      }
    });

    micInputStream.on('error', (err) => {
      console.error('Microphone input stream error:', err);
      sendDebugToClient(ws, `Microphone input stream error: ${err.message}`);
      ws.send(JSON.stringify({ type: 'error', data: 'Microphone error occurred' }));
    });

    micInstance.start();
    sendDebugToClient(ws, 'Microphone started');
  };

  setupDeepgram();

  ws.on('message', (message) => {
    const data = JSON.parse(message);
    if (data.type === 'setLanguage') {
      currentLanguage = data.language;
      sendDebugToClient(ws, `Language set to: ${supportedLanguages[currentLanguage]}`);
    } else if (data.type === 'audioData') {
      if (!isMuted && isDeepgramConnected && deepgramConnection.getReadyState() === WebSocket.OPEN) {
        deepgramConnection.send(data.audio);
        totalAudioBytesSent += data.audio.length;
        const now = Date.now();
        if (now - lastAudioSentTimestamp >= 5000) {  // Log every 5 seconds
          sendDebugToClient(ws, `Sent ${totalAudioBytesSent} total bytes of audio data to Deepgram`);
          lastAudioSentTimestamp = now;
        }
      }
    } else if (data.type === 'mute') {
      isMuted = true;
      sendDebugToClient(ws, 'Client is muted, stopping audio data transmission.');
    } else if (data.type === 'unmute') {
      isMuted = false;
      sendDebugToClient(ws, 'Client is unmuted, resuming audio data transmission.');
    }
  });  

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    sendDebugToClient(ws, 'WebSocket connection closed');
    isWebSocketClosed = true;
    if (micInstance) {
      micInstance.stop();
      sendDebugToClient(ws, 'Microphone stopped');
    }
    if (deepgramConnection) {
      deepgramConnection.finish();
      sendDebugToClient(ws, 'Deepgram connection finished');
      isDeepgramConnected = false;
    }
    isReceivingAudio = false;
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    sendDebugToClient(ws, `WebSocket error: ${error.message}`);
  });
});

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});