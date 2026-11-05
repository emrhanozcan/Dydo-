import { MESSAGE, type ExtensionMessage } from "../shared/messages";

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type !== MESSAGE.PLAY_ALARM) return;
  playAlarm(message.volume);
});

function playAlarm(volume: number): void {
  const context = new AudioContext();
  const gain = context.createGain();
  gain.gain.value = Math.max(0, Math.min(1, volume)) * 0.2;
  gain.connect(context.destination);
  [0, 0.24, 0.48].forEach((offset, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = index === 1 ? 1046 : 880;
    oscillator.connect(gain);
    oscillator.start(context.currentTime + offset);
    oscillator.stop(context.currentTime + offset + 0.16);
  });
  window.setTimeout(() => void context.close(), 1200);
}
