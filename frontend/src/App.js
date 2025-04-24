import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import UserTranscriptionView from './UserTranscriptionView';

const supportedLanguages = {
  'en': 'English',
  'ja': '日本語',
  'ko': '한국어',
  'ZH-HANT': '繁體中文',
  'es': 'Español'
};

const TranscriptionApp = () => {
  const [transcriptions, setTranscriptions] = useState([]);
  const [status, setStatus] = useState('Disconnected');
  const [error, setError] = useState(null);
  const [debugLogs, setDebugLogs] = useState([]);
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [isMicrophoneActive, setIsMicrophoneActive] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  // Panel visibility states
  const [isControlPanelVisible, setIsControlPanelVisible] = useState(true);
  const [isOriginalVisible, setIsOriginalVisible] = useState(true);
  const [isTranslatedVisible, setIsTranslatedVisible] = useState(true);
  const [isDebugVisible, setIsDebugVisible] = useState(false); // Default closed for cleaner UI

  const wsRef = useRef(null);
  const originalRef = useRef(null);
  const translatedRef = useRef(null);
  const debugLogsRef = useRef(null);

  // Check system preference for dark mode
  useEffect(() => {
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setDarkMode(darkModeMediaQuery.matches);

    const handleChange = (e) => setDarkMode(e.matches);
    darkModeMediaQuery.addEventListener('change', handleChange);

    return () => darkModeMediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Apply theme to document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const addDebugLog = useCallback((log) => {
    setDebugLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${log}`]);
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
        setError(null);
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
      const constraints = { audio: selectedDevice ? { deviceId: { exact: selectedDevice } } : true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
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
  }, [connectWebSocket, addDebugLog, selectedDevice]);

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
    if (originalRef.current && isOriginalVisible) {
      originalRef.current.scrollTop = originalRef.current.scrollHeight;
    }
    if (translatedRef.current && isTranslatedVisible) {
      translatedRef.current.scrollTop = translatedRef.current.scrollHeight;
    }
  }, [transcriptions, isOriginalVisible, isTranslatedVisible]);

  useEffect(() => {
    if (debugLogsRef.current && isDebugVisible) {
      debugLogsRef.current.scrollTop = debugLogsRef.current.scrollHeight;
    }
  }, [debugLogs, isDebugVisible]);

  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'setLanguage', language: selectedLanguage }));
      addDebugLog(`Language changed to ${supportedLanguages[selectedLanguage]}`);
    }
  }, [selectedLanguage, addDebugLog]);

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

  const clearTranscriptions = () => {
    setTranscriptions([]);
    addDebugLog('Transcriptions cleared');
  };

  const clearDebugLogs = () => {
    setDebugLogs([]);
  };

  const getStatusColor = () => {
    if (status === 'Connected') return 'bg-emerald-500';
    if (status === 'Disconnected') return 'bg-red-500';
    return 'bg-amber-500';
  };

  // Toggle panel visibility handlers
  const toggleControlPanel = () => setIsControlPanelVisible(prev => !prev);
  const toggleOriginalPanel = () => setIsOriginalVisible(prev => !prev);
  const toggleTranslatedPanel = () => setIsTranslatedVisible(prev => !prev);
  const toggleDebugPane = () => setIsDebugVisible(prev => !prev);

  return (
    <div className="w-full mx-auto p-4 lg:p-6 bg-slate-50 dark:bg-slate-900 min-h-screen transition-colors">
      <header className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl md:text-3xl font-medium text-slate-800 dark:text-white">
              <span className="text-indigo-600 dark:text-indigo-400">Live Translator</span>
            </h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm md:text-base">Transcribe and translate speech in real-time</p>
          </div>
          <button
            onClick={() => setDarkMode(prev => !prev)}
            className="p-2 rounded-full text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            title="Toggle dark/light mode"
            aria-label="Toggle dark mode"
          >
            {darkMode ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-300" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
        {/* Left Column - Controls and Original */}
        <div className="lg:col-span-6 space-y-4 md:space-y-6">
          {/* Controls Panel */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden transition-all duration-200">
            <div
              className="flex justify-between items-center p-4 cursor-pointer border-b border-slate-100 dark:border-slate-700"
              onClick={toggleControlPanel}
            >
              <div className="flex items-center space-x-2">
                <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor()}`}></div>
                <h2 className="font-medium text-slate-800 dark:text-slate-200">Controls</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                  {status}
                </span>
              </div>
              <span className="text-slate-400">
                {isControlPanelVisible ?
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  :
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                  </svg>
                }
              </span>
            </div>

            {isControlPanelVisible && (
              <div className="p-4 bg-white dark:bg-slate-800 transition-colors">
                {/* Main Controls */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Microphone Button */}
                  <button
                    onClick={toggleMicrophone}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
                      ${isMicrophoneActive
                        ? 'bg-red-500 hover:bg-red-600 text-white shadow-md'
                        : 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-md'}`}
                  >
                    {isMicrophoneActive ? (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M13 10a1 1 0 011 1v3a1 1 0 01-2 0v-3a1 1 0 011-1zm-4 0a1 1 0 011 1v3a1 1 0 01-2 0v-3a1 1 0 011-1zm-4 0a1 1 0 011 1v3a1 1 0 01-2 0v-3a1 1 0 011-1z" clipRule="evenodd" />
                        </svg>
                        Stop
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                        </svg>
                        Start
                      </>
                    )}
                  </button>

                  {/* Reconnect Button */}
                  <button
                    onClick={handleReconnect}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                    </svg>
                    Reconnect
                  </button>
                </div>

                {/* Selectors Row */}
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Language Selector */}
                  <div className="space-y-1">
                    <label htmlFor="language" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Translation Language
                    </label>
                    <select
                      id="language"
                      value={selectedLanguage}
                      onChange={handleLanguageChange}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent outline-none transition-all"
                    >
                      {Object.entries(supportedLanguages).map(([code, name]) => (
                        <option key={code} value={code}>{name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Audio Device Selector */}
                  <div className="space-y-1">
                    <label htmlFor="audioDevice" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Audio Input
                    </label>
                    <select
                      id="audioDevice"
                      value={selectedDevice}
                      onChange={handleDeviceChange}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent outline-none transition-all"
                    >
                      {audioDevices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Microphone ${device.deviceId.substring(0, 5)}...`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 text-red-700 dark:text-red-400 rounded">
                    <div className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <p>{error}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Original Transcription */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden transition-all duration-200">
            <div
              className="flex justify-between items-center p-4 cursor-pointer border-b border-slate-100 dark:border-slate-700"
              onClick={toggleOriginalPanel}
            >
              <h2 className="font-medium text-slate-800 dark:text-slate-200">Original Transcription</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    clearTranscriptions();
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  aria-label="Clear transcriptions"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </button>
                <span className="text-slate-400">
                  {isOriginalVisible ?
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    :
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                    </svg>
                  }
                </span>
              </div>
            </div>
            {isOriginalVisible && (
              <div className="h-64 md:h-80 overflow-y-auto p-0 bg-white dark:bg-slate-800 transition-colors" ref={originalRef}>
                {transcriptions.length > 0 ? (
                  <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {transcriptions.map((t, index) => (
                      <div key={index} className="p-4">
                        <p className="text-slate-800 dark:text-slate-200 leading-relaxed">{t.original || 'N/A'}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                      <p className="mt-2 text-slate-500 dark:text-slate-400">Ready to transcribe your speech</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Translated and Debug */}
        <div className="lg:col-span-6 space-y-4 md:space-y-6">
          {/* Translated Text */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden transition-all duration-200">
            <div
              className="flex justify-between items-center p-4 cursor-pointer border-b border-slate-100 dark:border-slate-700"
              onClick={toggleTranslatedPanel}
            >
              <h2 className="font-medium text-slate-800 dark:text-slate-200">
                Translation
                <span className="ml-2 text-sm font-normal text-indigo-500 dark:text-indigo-400">
                  ({supportedLanguages[selectedLanguage]})
                </span>
              </h2>
              <span className="text-slate-400">
                {isTranslatedVisible ?
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  :
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                  </svg>
                }
              </span>
            </div>
            {isTranslatedVisible && (
              <div className="h-64 md:h-80 overflow-y-auto p-0 bg-white dark:bg-slate-800 transition-colors" ref={translatedRef}>
                {transcriptions.length > 0 ? (
                  <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {transcriptions.map((t, index) => (
                      <div key={index} className="p-4">
                        <p className="text-slate-800 dark:text-slate-200 leading-relaxed">{t.translated || 'N/A'}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                      </svg>
                      <p className="mt-2 text-slate-500 dark:text-slate-400">Translations will appear here</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Debug Panel */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden transition-all duration-200">
            <div
              className="flex justify-between items-center p-4 cursor-pointer border-b border-slate-100 dark:border-slate-700"
              onClick={toggleDebugPane}
            >
              <h2 className="font-medium text-slate-800 dark:text-slate-200">Debug Logs</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    clearDebugLogs();
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  aria-label="Clear debug logs"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </button>
                <span className="text-slate-400">
                  {isDebugVisible ?
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    :
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                    </svg>
                  }
                </span>
              </div>
            </div>
            {isDebugVisible && (
              <div className="p-0 h-48 overflow-y-auto font-mono text-sm bg-slate-50 dark:bg-slate-900 transition-colors" ref={debugLogsRef}>
                {debugLogs.length > 0 ? (
                  <div className="divide-y divide-slate-200 dark:divide-slate-700">
                    {debugLogs.map((log, index) => (
                      <div key={index} className="px-4 py-2 text-slate-700 dark:text-slate-300">{log}</div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-slate-500 dark:text-slate-400">No logs available</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const App = () => {
  // Add Tailwind dark mode support
  useEffect(() => {
    // Check for dark mode preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Listen for changes
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = event => {
      if (event.matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    darkModeMediaQuery.addEventListener('change', handleChange);
    return () => darkModeMediaQuery.removeEventListener('change', handleChange);
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<TranscriptionApp />} />
        <Route path="/user" element={<UserTranscriptionView key={Date.now()} />} />
      </Routes>
    </Router>
  );
};

export default App;