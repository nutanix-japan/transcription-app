process.removeAllListeners('warning');

const WebSocket = require('ws');
require("dotenv").config();

const API_KEY = process.env.DEEPGRAM_API_KEY;
const SERVER = 'wss://api.deepgram.com/v1/listen';

console.log("Attempting to create Deepgram connection...");

const socket = new WebSocket(SERVER, {
  headers: {
    Authorization: `Token ${API_KEY}`
  }
});

socket.on('open', function open() {
  console.log('Deepgram connection opened successfully.');
  socket.send(JSON.stringify({
    type: 'start',
    model: 'nova-2',
    language: 'en-US',
    smart_format: true,
    interim_results: false,
    encoding: 'linear16',
    sample_rate: 16000
  }));
  
  // Close the connection after successful open
  setTimeout(() => {
    socket.close();
  }, 1000);
});

socket.on('message', function incoming(data) {
  console.log('Received message from Deepgram:', data);
});

socket.on('error', function error(err) {
  console.error('Deepgram connection error:', err);
  console.error('Error message:', err.message);
  console.error('Error stack:', err.stack);
});

socket.on('close', function close(code, reason) {
  console.log('Deepgram connection closed:', code, reason);
});

// Add a timeout to close the script after 10 seconds
setTimeout(() => {
  console.log("Test script timed out after 10 seconds.");
  process.exit(1);
}, 10000);

// Log the Deepgram API key (first 5 characters only for security)
console.log("Using Deepgram API key:", API_KEY.substring(0, 5) + '...');