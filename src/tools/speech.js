/**
 * 事件语音播报（Web Speech API）
 * 实时播报关键交通事件（事故、管制、故障）
 */
let enabled = true
let queue = []

export const setSpeechEnabled = (v) => {
  enabled = v
  if (!v) {
    window.speechSynthesis?.cancel()
    queue = [] // 清空待播队列，避免重新启用后集中爆播
  }
}

export const isSpeechEnabled = () => enabled

export function speak(text) {
  if (!enabled) return
  if (!('speechSynthesis' in window)) return
  queue.push(text)
  if (queue.length === 1) playNext()
}

function playNext() {
  if (!enabled || !queue.length) return
  const text = queue.shift()
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = 'zh-CN'
  utter.rate = 1.05
  utter.onend = () => playNext()
  utter.onerror = () => playNext()
  window.speechSynthesis.speak(utter)
}
