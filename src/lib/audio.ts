import * as Tone from 'tone'

let synth: Tone.PolySynth | null = null

export async function initAudio() {
  await Tone.start()
  synth = new Tone.PolySynth(Tone.Synth).toDestination()
}

export function playNote(note: string, duration = '8n') {
  if (!synth) return
  synth.triggerAttackRelease(note, duration)
}

export function playChord(notes: string[], duration = '8n') {
  if (!synth) return
  synth.triggerAttackRelease(notes, duration)
}
