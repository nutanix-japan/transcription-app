process.removeAllListeners('warning');

const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");
require("dotenv").config();

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

console.log("Attempting to create Deepgram connection...");

const connection = deepgram.listen.live({
  model: "nova-2",
  language: "en-US",
  smart_format: true,
  interim_results: false,
  encoding: "linear16",
  sample_rate: 16000
});

connection.addListener('open', () => {
  console.log("Deepgram connection opened successfully.");
  // Close the connection after successful open
  connection.finish();
});

connection.addListener('error', (error) => {
  console.error('Deepgram connection error:', error);
  console.error('Error type:', error.type);
  console.error('Error message:', error.message);
  console.error('Error stack:', error.stack);
  console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
});

connection.addListener('close', (event) => {
  console.log('Deepgram connection closed:', event);
});

// Add a timeout to close the script after 10 seconds
setTimeout(() => {
  console.log("Test script timed out after 10 seconds.");
  process.exit(1);
}, 10000);

// Log the Deepgram API key (first 5 characters only for security)
console.log("Using Deepgram API key:", process.env.DEEPGRAM_API_KEY.substring(0, 5) + '...');