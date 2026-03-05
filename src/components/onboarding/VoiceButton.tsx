'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Volume2 } from 'lucide-react';

// Type declarations for Web Speech API
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionClass {
  new (): SpeechRecognitionInstance;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionClass;
    webkitSpeechRecognition: SpeechRecognitionClass;
  }
}

interface VoiceButtonProps {
  onTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  isListening: boolean;
  setIsListening: (listening: boolean) => void;
  isSpeaking?: boolean;
  disabled?: boolean;
}

export function VoiceButton({
  onTranscript,
  onInterimTranscript,
  isListening,
  setIsListening,
  isSpeaking,
  disabled,
}: VoiceButtonProps) {
  const [isSupported, setIsSupported] = useState(false);
  const [audioLevels, setAudioLevels] = useState<number[]>([0, 0, 0, 0, 0]);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Check for Web Speech API support
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognitionAPI);
  }, []);

  useEffect(() => {
    if (!isSupported) return;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimText = '';
      let finalText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      if (finalText) {
        onTranscript(finalText);
      }
      if (interimText && onInterimTranscript) {
        onInterimTranscript(interimText);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      if (isListening) {
        // Restart if still supposed to be listening
        try {
          recognition.start();
        } catch {
          setIsListening(false);
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
  }, [isSupported, onTranscript, onInterimTranscript, setIsListening, isListening]);

  // Audio visualization
  useEffect(() => {
    if (isListening) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioContextRef.current = new AudioContextClass();
        analyserRef.current = audioContextRef.current.createAnalyser();
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(analyserRef.current);
        analyserRef.current.fftSize = 32;

        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const updateLevels = () => {
          if (!analyserRef.current || !isListening) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          const levels = Array.from(dataArray.slice(0, 5)).map((v) => v / 255);
          setAudioLevels(levels);
          animationFrameRef.current = requestAnimationFrame(updateLevels);
        };

        updateLevels();
      });
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      setAudioLevels([0, 0, 0, 0, 0]);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [isListening]);

  const toggleListening = () => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (error) {
        console.error('Failed to start recognition:', error);
      }
    }
  };

  if (!isSupported) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={toggleListening}
      disabled={disabled || isSpeaking}
      className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all ${
        isListening
          ? 'bg-white text-black'
          : isSpeaking
          ? 'bg-white/10 text-white/50 cursor-not-allowed'
          : 'bg-white/[0.06] text-white/70 hover:bg-white/10 hover:text-white'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
      aria-label={isListening ? 'Stop listening' : 'Start voice input'}
    >
      <AnimatePresence mode="wait">
        {isSpeaking ? (
          <motion.div
            key="speaking"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
          >
            <Volume2 className="w-5 h-5" />
          </motion.div>
        ) : isListening ? (
          <motion.div
            key="listening"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="relative"
          >
            <MicOff className="w-5 h-5" />
            {/* Audio level visualization */}
            <div className="absolute -inset-3 flex items-center justify-center gap-0.5 pointer-events-none">
              {audioLevels.map((level, i) => (
                <motion.div
                  key={i}
                  className="w-0.5 bg-black/40 rounded-full"
                  animate={{ height: 4 + level * 16 }}
                  transition={{ duration: 0.05 }}
                />
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
          >
            <Mic className="w-5 h-5" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pulse ring when listening */}
      {isListening && (
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-white"
          initial={{ scale: 1, opacity: 0.5 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      )}
    </button>
  );
}
