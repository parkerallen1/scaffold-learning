import { httpsCallable } from 'firebase/functions';

import { firebaseRuntime, functions } from '@/lib/firebase';

const synthesizeSpeech = httpsCallable<
  { text: string; speed: number },
  { audioBase64: string; mimeType: 'audio/mpeg'; model: 'gpt-4o-mini-tts' }
>(functions, 'synthesizeSpeech', firebaseRuntime.callableOptions);

let activeAudio: HTMLAudioElement | null = null;

const playOpenAiSpeech = async (text: string, rate: number): Promise<void> => {
  const response = await synthesizeSpeech({ text, speed: Math.min(2, Math.max(0.5, rate)) });
  const binary = atob(response.data.audioBase64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: response.data.mimeType }));
  activeAudio?.pause();
  const audio = new Audio(url);
  activeAudio = audio;
  await new Promise<void>((resolve, reject) => {
    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (activeAudio === audio) activeAudio = null;
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      if (activeAudio === audio) activeAudio = null;
      reject(new Error('The generated audio could not be played.'));
    };
    void audio.play().catch(reject);
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
    utterance.onerror = () => reject(new Error('The browser could not read this question aloud.'));

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
