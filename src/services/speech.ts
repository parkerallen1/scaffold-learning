import { httpsCallable } from 'firebase/functions';

import { firebaseRuntime, functions } from '@/lib/firebase';

const synthesizeSpeech = httpsCallable<
  { text: string; speed: number },
  { audioBase64: string; mimeType: 'audio/mpeg'; model: 'gpt-4o-mini-tts' }
>(functions, 'synthesizeSpeech', firebaseRuntime.callableOptions);

let activeAudio: HTMLAudioElement | null = null;
let stopActiveAudio: (() => void) | null = null;

export const stopSpeaking = (): void => {
  stopActiveAudio?.();
  stopActiveAudio = null;
  activeAudio = null;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
};

const playOpenAiSpeech = async (text: string, rate: number): Promise<void> => {
  const response = await synthesizeSpeech({ text, speed: Math.min(2, Math.max(0.5, rate)) });
  const binary = atob(response.data.audioBase64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: response.data.mimeType }));
  stopSpeaking();
  const audio = new Audio(url);
  activeAudio = audio;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (result: 'resolve' | 'reject') => {
      if (settled) return;
      settled = true;
      audio.pause();
      URL.revokeObjectURL(url);
      if (activeAudio === audio) activeAudio = null;
      stopActiveAudio = null;
      if (result === 'resolve') resolve();
      else reject(new Error('The generated audio could not be played.'));
    };
    stopActiveAudio = () => finish('resolve');
    audio.onended = () => {
      finish('resolve');
    };
    audio.onerror = () => {
      finish('reject');
    };
    void audio.play().catch(() => finish('reject'));
  });
};

const playBrowserSpeech = (text: string, rate: number): Promise<void> => {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    return Promise.reject(new Error('Speech synthesis is not supported in this browser.'));
  }

  window.speechSynthesis.cancel();

  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = Math.min(2, Math.max(0.5, rate));

    utterance.onend = () => resolve();
    utterance.onerror = (event) => {
      if (event.error === 'canceled' || event.error === 'interrupted') resolve();
      else reject(new Error('The browser could not read this question aloud.'));
    };

    window.speechSynthesis.speak(utterance);
  });
};

export const speak = async (text: string, rate = 1): Promise<void> => {
  try {
    await playOpenAiSpeech(text, rate);
  } catch {
    await playBrowserSpeech(text, rate);
  }
};
