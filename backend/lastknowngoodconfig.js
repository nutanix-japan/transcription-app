const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");
const mic = require('mic');
const dotenv = require("dotenv");
const session = require('express-session');
const winston = require('winston');

dotenv.config();

// Create Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

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

const sendToClient = (ws, type, message) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, data: message }));
  }
};

wss.on('connection', (ws, req) => {
  logger.info('New WebSocket connection');
  sendToClient(ws, 'debug', 'New WebSocket connection established');
  
  let deepgramConnection;
  let micInstance;
  let isDeepgramConnected = false;
  let totalAudioBytesSent = 0;
  let lastAudioSentTimestamp = 0;

  const setupDeepgram = () => {
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

    logger.info("Creating Deepgram connection...");
    sendToClient(ws, 'debug', "Creating Deepgram connection...");
    
    deepgramConnection = deepgram.listen.live({
      model: "nova-2",
      language: "en-US",
      smart_format: true,
      interim_results: false,
      punctuate: true,
      encoding: "linear16",
      channels: 1,
      sample_rate: 48000,
      endpointing: 100,
    });

    deepgramConnection.addListener(LiveTranscriptionEvents.Open, () => {
      logger.info("Deepgram connection opened.");
      sendToClient(ws, 'debug', "Deepgram connection opened");
      isDeepgramConnected = true;
      sendToClient(ws, 'status', 'Connected');

      deepgramConnection.addListener(LiveTranscriptionEvents.Transcript, (data) => {
        const transcript = data.channel.alternatives[0].transcript;
        if (transcript) {
          logger.debug(`Received transcript: ${transcript}`);
          sendToClient(ws, 'transcript', transcript);
        } else {
          logger.debug("Received empty transcript");
        }
      });

      setupMicrophone();
    });

    deepgramConnection.addListener(LiveTranscriptionEvents.Error, (err) => {
      logger.error('Deepgram error:', err);
      sendToClient(ws, 'error', 'Transcription error occurred');
    });

    deepgramConnection.addListener(LiveTranscriptionEvents.Close, () => {
      logger.info('Deepgram connection closed');
      isDeepgramConnected = false;
      sendToClient(ws, 'status', 'Disconnected');
      
      // Attempt to reconnect to Deepgram
      setTimeout(() => {
        logger.info('Attempting to reconnect to Deepgram...');
        setupDeepgram();
      }, 5000);
    });

    deepgramConnection.addListener('error', (error) => {
      logger.error('Unhandled Deepgram error:', error);
    });
  };

  const setupMicrophone = () => {
    micInstance = mic({
      rate: '16000',
      channels: '1',
      debug: false,
      exitOnSilence: 6
    });

    const micInputStream = micInstance.getAudioStream();

    micInputStream.on('data', (data) => {
      if (isDeepgramConnected && deepgramConnection.getReadyState() === WebSocket.OPEN) {
        deepgramConnection.send(data);
        totalAudioBytesSent += data.length;
        const now = Date.now();
        if (now - lastAudioSentTimestamp >= 5000) {  // Log every 5 seconds
          logger.debug(`Sent ${totalAudioBytesSent} total bytes of audio data to Deepgram`);
          lastAudioSentTimestamp = now;
        }
      } else {
        logger.debug(`Microphone data received, but Deepgram connection is not open. Ready state: ${deepgramConnection ? deepgramConnection.getReadyState() : 'undefined'}, isDeepgramConnected: ${isDeepgramConnected}`);
        
        // If Deepgram is not connected, attempt to reconnect
        if (!isDeepgramConnected) {
          logger.info('Attempting to reconnect to Deepgram...');
          setupDeepgram();
        }
      }
    });

    micInputStream.on('error', (err) => {
      logger.error('Microphone input stream error:', err);
      sendToClient(ws, 'error', 'Microphone error occurred');
    });

    micInstance.start();
    logger.info('Microphone started');
  };

  setupDeepgram();

  ws.on('close', () => {
    logger.info('WebSocket connection closed');
    if (micInstance) {
      micInstance.stop();
      logger.info('Microphone stopped');
    }
    if (deepgramConnection) {
      deepgramConnection.finish();
      logger.info('Deepgram connection finished');
    }
  });

  ws.on('error', (error) => {
    logger.error('WebSocket error:', error);
  });
});

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});