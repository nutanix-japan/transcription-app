import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom'; // Import Navigate
import UserTranscriptionView from './UserTranscriptionView';
import { Button } from "./components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"
import { ChevronDown } from "lucide-react"

const supportedLanguages = {
  'ja': '日本語',
  'ko': 'Korean',
  'ZH-HANT': 'Chinese (Traditional)',
  'es': 'Spanish'
};

const TranscriptionApp = () => {
  const [transcriptions, setTranscriptions] = useState([]);
  const [status, setStatus] = useState('Disconnected');
  const [error, setError] = useState(null);
  const [debugLogs, setDebugLogs] = useState([]);
  const [selectedLanguage, setSelectedLanguage] = useState('ja');
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [isMicrophoneActive, setIsMicrophoneActive] = useState(false);
  const [isDebugLogsVisible, setIsDebugLogsVisible] = useState(false);

  const wsRef = useRef(null);
  const originalRef = useRef(null);
  const translatedRef = useRef(null);
  const debugLogsRef = useRef(null);

  const addDebugLog = useCallback((log) => {
    setDebugLogs(prev => [...prev, log]);
  }, []);

  const connectWebSocket = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        addDebugLog('WebSocket already connected');
        resolve();
        return;
      }

      wsRef.current = new WebSocket('ws://localhost:3001');

      wsRef.current.onopen = () => {
        setStatus('Connected');
        setError(null); // Clear any previous errors
        addDebugLog('WebSocket connected');
        resolve();
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        addDebugLog(`WebSocket error: ${error.message || 'Unknown error'}`);
        reject(new Error('WebSocket connection failed'));
      };

      wsRef.current.onclose = (event) => {
        setStatus('Disconnected');
        addDebugLog(`WebSocket disconnected. Code: ${event.code}, Reason: ${event.reason}`);
        // Remove automatic reconnection
      };

      wsRef.current.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'transcript') {
          setTranscriptions(prev => [...prev, message.data]);
          addDebugLog(`Received transcript: ${message.data.original}`);
          addDebugLog(`Translated text (${message.data.language}): ${message.data.translated}`);
        } else if (message.type === 'debug') {
          addDebugLog(`Server debug: ${message.data}`);
        }
      };
    });
  }, [addDebugLog]);

  const activateMicrophone = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      await connectWebSocket();
      if (wsRef.current) {
        wsRef.current.micStream = stream;
        setIsMicrophoneActive(true);
        addDebugLog('Microphone activated and WebSocket connected');
      } else {
        throw new Error('WebSocket connection failed');
      }
    } catch (error) {
      setError(`Error activating microphone: ${error.message}`);
      addDebugLog(`Error activating microphone: ${error.message}`);
    }
  }, [connectWebSocket, addDebugLog, setError]);

  const deactivateMicrophone = useCallback(() => {
    if (wsRef.current && wsRef.current.micStream) {
      wsRef.current.micStream.getTracks().forEach(track => track.stop());
      wsRef.current.micStream = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsMicrophoneActive(false);
    setStatus('Disconnected');
    addDebugLog('Microphone deactivated and WebSocket disconnected');
  }, [addDebugLog]);

  const toggleMicrophone = useCallback(() => {
    if (isMicrophoneActive) {
      // Disconnect WebSocket
      if (wsRef.current) {
        wsRef.current.send(JSON.stringify({ type: 'mute' }));
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsMicrophoneActive(false);
      addDebugLog('Microphone deactivated');
    } else {
      activateMicrophone();
      if (wsRef.current) {
        wsRef.current.send(JSON.stringify({ type: 'unmute' }));
      }
    }
  }, [isMicrophoneActive, activateMicrophone, addDebugLog]);

  useEffect(() => {
    getAudioDevices();
    return () => {
      deactivateMicrophone();
    };
  }, [deactivateMicrophone]);

  useEffect(() => {
    if (originalRef.current) {
      originalRef.current.scrollTop = originalRef.current.scrollHeight;
    }
    if (translatedRef.current) {
      translatedRef.current.scrollTop = translatedRef.current.scrollHeight;
    }
  }, [transcriptions]);

  useEffect(() => {
    if (debugLogsRef.current) {
      debugLogsRef.current.scrollTop = debugLogsRef.current.scrollHeight;
    }
  }, [debugLogs]);

  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'setLanguage', language: selectedLanguage }));
      addDebugLog(`Language changed to ${supportedLanguages[selectedLanguage]}`);
    }
  }, [selectedLanguage, wsRef]);

  const getAudioDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputDevices = devices.filter(device => device.kind === 'audioinput');
      setAudioDevices(audioInputDevices);
      if (audioInputDevices.length > 0) {
        setSelectedDevice(audioInputDevices[0].deviceId);
      }
    } catch (error) {
      setError('Error getting audio devices');
      addDebugLog(`Error getting audio devices: ${error.message}`);
    }
  };

  const handleDeviceChange = (e) => {
    const newDevice = e.target.value;
    setSelectedDevice(newDevice);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'setAudioDevice', deviceId: newDevice }));
      addDebugLog(`Audio device changed to ${newDevice}`);
    }
  };

  const handleReconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    connectWebSocket();
  };

  const handleLanguageChange = (e) => {
    const newLanguage = e.target.value;
    setSelectedLanguage(newLanguage);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'setLanguage', language: newLanguage }));
      addDebugLog(`Language changed to ${supportedLanguages[newLanguage]}`);
    }
  };

  const toggleDebugLogs = () => {
    setIsDebugLogsVisible(!isDebugLogsVisible);
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Real-time Transcription and Translation</h1>
      <div className="mb-4 flex items-center">
        <span className="mr-4">Status: {status}</span>
        <span className="mr-4">Microphone: {isMicrophoneActive ? 'Active' : 'Inactive'}</span>
        <Button 
          onClick={toggleMicrophone} 
          variant={isMicrophoneActive ? "destructive" : "default"}
        >
          {isMicrophoneActive ? 'Mute Microphone' : 'Unmute Microphone'}
        </Button>
        <Select value={selectedLanguage} onValueChange={handleLanguageChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select language" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(supportedLanguages).map(([code, name]) => (
              <SelectItem key={code} value={code}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedDevice} onValueChange={handleDeviceChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select device" />
          </SelectTrigger>
          <SelectContent>
            {audioDevices.map((device) => (
              <SelectItem key={device.deviceId} value={device.deviceId}>
                {device.label || `Microphone ${device.deviceId}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>Error: {error}</AlertDescription>
        </Alert>
      )}
      <div className="flex space-x-4 mb-4">
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Original Transcription</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]" ref={originalRef}>
              {transcriptions.length > 0 ? (
                transcriptions.map((t, index) => (
                  <div key={index} className="mb-2">
                    <p>{t.original || 'N/A'}</p>
                  </div>
                ))
              ) : (
                'Waiting for transcription...'
              )}
            </ScrollArea>
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Translation ({supportedLanguages[selectedLanguage]})</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]" ref={translatedRef}>
              {transcriptions.length > 0 ? (
                transcriptions.map((t, index) => (
                  <div key={index} className="mb-2">
                    <p>{t.translated || 'N/A'}</p>
                  </div>
                ))
              ) : (
                'Waiting for translation...'
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            Debug Logs
            <ChevronDown className="h-4 w-4" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ScrollArea className="h-[200px] mt-2" ref={debugLogsRef}>
            {debugLogs.map((log, index) => (
              <div key={index} className="text-sm">{log}</div>
            ))}
          </ScrollArea>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

const App = () => {
  const [isMicrophoneActive, setIsMicrophoneActive] = useState(false);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/admin" />} />
        <Route path="/admin" element={<TranscriptionApp />} />
        <Route path="/user" element={<UserTranscriptionView key={Date.now()} isMicrophoneActive={isMicrophoneActive} />} />
      </Routes>
    </Router>
  );
};

export default App;