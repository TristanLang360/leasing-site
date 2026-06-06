import confetti from 'canvas-confetti'

// A celebratory burst when an agent completes a task.
export function celebrate() {
  const end = Date.now() + 800
  const colors = ['#16a34a', '#22c55e', '#84cc16', '#0ea5e9', '#f59e0b']
  ;(function frame() {
    confetti({ particleCount: 4, angle: 60, spread: 70, origin: { x: 0 }, colors })
    confetti({ particleCount: 4, angle: 120, spread: 70, origin: { x: 1 }, colors })
    if (Date.now() < end) requestAnimationFrame(frame)
  })()
  confetti({ particleCount: 120, spread: 90, startVelocity: 42, origin: { y: 0.6 }, colors })
}
