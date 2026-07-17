export const speak = (text: string): Promise<void> => {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    return Promise.reject(new Error('Speech synthesis is not supported in this browser.'));
  }

  window.speechSynthesis.cancel();

  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);

    utterance.onend = () => resolve();
    utterance.onerror = () => reject(new Error('The browser could not read this question aloud.'));

    window.speechSynthesis.speak(utterance);
  });
};
