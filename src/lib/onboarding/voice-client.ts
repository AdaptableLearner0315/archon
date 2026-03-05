/**
 * Voice Client for Onboarding
 *
 * Uses native Web Speech API for speech-to-text and text-to-speech.
 * No external services required.
 */

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

export interface VoiceSupport {
  speechRecognition: boolean;
  speechSynthesis: boolean;
}

export interface TranscriptChunk {
  interim?: string;
  final?: string;
}

export class VoiceClient {
  private recognition: SpeechRecognitionInstance | null = null;
  private synthesis: SpeechSynthesis | null = null;
  private preferredVoice: SpeechSynthesisVoice | null = null;
  private isListeningFlag = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initRecognition();
      this.initSynthesis();
    }
  }

  private initRecognition() {
    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognitionAPI) {
      this.recognition = new SpeechRecognitionAPI();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';
    }
  }

  private initSynthesis() {
    if ('speechSynthesis' in window) {
      this.synthesis = window.speechSynthesis;

      // Load voices (may be async)
      const loadVoices = () => {
        const voices = this.synthesis?.getVoices() ?? [];

        // Prefer high-quality voices
        const preferredVoices = [
          'Samantha', // macOS
          'Google US English', // Chrome
          'Microsoft David', // Windows
          'Alex', // macOS fallback
        ];

        for (const name of preferredVoices) {
          const voice = voices.find(
            (v) => v.name.includes(name) && v.lang.startsWith('en')
          );
          if (voice) {
            this.preferredVoice = voice;
            break;
          }
        }

        // Fallback to first English voice
        if (!this.preferredVoice) {
          this.preferredVoice =
            voices.find((v) => v.lang.startsWith('en')) ?? null;
        }
      };

      // Voices may load asynchronously
      if (this.synthesis.getVoices().length > 0) {
        loadVoices();
      } else {
        this.synthesis.onvoiceschanged = loadVoices;
      }
    }
  }

  /**
   * Check what voice features are supported
   */
  isSupported(): VoiceSupport {
    return {
      speechRecognition: this.recognition !== null,
      speechSynthesis: this.synthesis !== null,
    };
  }

  /**
   * Start listening for speech input
   * Returns an async generator that yields transcript chunks
   */
  async *listen(): AsyncGenerator<TranscriptChunk> {
    if (!this.recognition) {
      throw new Error('Speech recognition not supported');
    }

    if (this.isListeningFlag) {
      return;
    }

    this.isListeningFlag = true;

    // Create a queue for results
    const resultQueue: TranscriptChunk[] = [];
    let resolveNext: ((value: TranscriptChunk | null) => void) | null = null;
    let done = false;

    const enqueue = (chunk: TranscriptChunk) => {
      if (resolveNext) {
        resolveNext(chunk);
        resolveNext = null;
      } else {
        resultQueue.push(chunk);
      }
    };

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let finalText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }

      if (finalText) {
        enqueue({ final: finalText });
      } else if (interim) {
        enqueue({ interim });
      }
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'no-speech') {
        // Restart on no-speech
        if (this.isListeningFlag) {
          try {
            this.recognition?.start();
          } catch {
            // Ignore
          }
        }
      }
    };

    this.recognition.onend = () => {
      if (this.isListeningFlag) {
        // Auto-restart if still supposed to be listening
        try {
          this.recognition?.start();
        } catch {
          done = true;
          if (resolveNext) {
            resolveNext(null);
          }
        }
      } else {
        done = true;
        if (resolveNext) {
          resolveNext(null);
        }
      }
    };

    try {
      this.recognition.start();
    } catch (error) {
      this.isListeningFlag = false;
      throw error;
    }

    // Yield results as they come
    while (!done || resultQueue.length > 0) {
      if (resultQueue.length > 0) {
        yield resultQueue.shift()!;
      } else {
        const chunk = await new Promise<TranscriptChunk | null>((resolve) => {
          resolveNext = resolve;
        });
        if (chunk) {
          yield chunk;
        }
      }
    }
  }

  /**
   * Stop listening for speech
   */
  stopListening(): void {
    this.isListeningFlag = false;
    this.recognition?.stop();
  }

  /**
   * Speak text aloud
   */
  async speak(text: string, options?: { rate?: number; pitch?: number }): Promise<void> {
    if (!this.synthesis) {
      throw new Error('Speech synthesis not supported');
    }

    // Cancel any ongoing speech
    this.synthesis.cancel();

    return new Promise((resolve, reject) => {
      // Clean text (remove markdown, special markers)
      const cleanText = text
        .replace(/\*\*/g, '')
        .replace(/\[INSIGHT:[^\]]+\]/g, '')
        .replace(/\[CREDITS:[^\]]+\]/g, '')
        .replace(/\[COMPLETE\]/g, '')
        .replace(/\n+/g, ' ')
        .trim();

      if (!cleanText) {
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);

      if (this.preferredVoice) {
        utterance.voice = this.preferredVoice;
      }

      utterance.rate = options?.rate ?? 1.1;
      utterance.pitch = options?.pitch ?? 1.0;

      utterance.onend = () => resolve();
      utterance.onerror = (event) => {
        if (event.error === 'canceled') {
          resolve();
        } else {
          reject(new Error(`Speech synthesis error: ${event.error}`));
        }
      };

      this.synthesis!.speak(utterance);
    });
  }

  /**
   * Stop any ongoing speech
   */
  stopSpeaking(): void {
    this.synthesis?.cancel();
  }

  /**
   * Check if currently speaking
   */
  isSpeaking(): boolean {
    return this.synthesis?.speaking ?? false;
  }

  /**
   * Check if currently listening
   */
  isCurrentlyListening(): boolean {
    return this.isListeningFlag;
  }

  /**
   * Get available voices
   */
  getVoices(): SpeechSynthesisVoice[] {
    return this.synthesis?.getVoices() ?? [];
  }

  /**
   * Set preferred voice by name
   */
  setVoice(voiceName: string): boolean {
    const voices = this.getVoices();
    const voice = voices.find((v) => v.name === voiceName);
    if (voice) {
      this.preferredVoice = voice;
      return true;
    }
    return false;
  }
}

// Singleton instance
let voiceClientInstance: VoiceClient | null = null;

export function getVoiceClient(): VoiceClient {
  if (!voiceClientInstance) {
    voiceClientInstance = new VoiceClient();
  }
  return voiceClientInstance;
}
