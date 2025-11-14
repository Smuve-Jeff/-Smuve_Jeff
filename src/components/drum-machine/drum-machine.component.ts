



import { Component, ChangeDetectionStrategy, signal, OnDestroy, AfterViewInit, output, input } from '@angular/core';
import { CommonModule } from '@angular/common';
// FIX: Correctly import 'kits' and 'SAMPLE_LIBRARY' which are now exported from 'samples.ts'.
import { SAMPLES, Kit, Pad, kits, SAMPLE_LIBRARY } from './samples';
import { SampleLibraryComponent } from '../sample-library/sample-library.component'; // New: Import SampleLibraryComponent

const MIDI_NOTE_TO_PAD_MAP: { [key: number]: number } = {
  36: 0, 37: 1, 38: 2, 39: 3, // C1 (Kick) to D#1 (Clap)
  40: 4, 41: 5, 42: 6, 43: 7, // E1 (Snare 2) to G1 (CHH)
  44: 8, 45: 9, 46: 10, 47: 11, // G#1 to B1 (OHH)
  48: 12, 49: 13, 50: 14, 51: 15, // C2 (Tom) to D#2 (Ride)
};

const KEY_TO_PAD_MAP: { [key: string]: number } = {
  '1': 0, '2': 1, '3': 2, '4': 3,
  'q': 4, 'w': 5, 'e': 6, 'r': 7,
  'a': 8, 's': 9, 'd': 10, 'f': 11,
  'z': 12, 'x': 13, 'c': 14, 'v': 15,
};

@Component({
  selector: 'app-drum-machine',
  templateUrl: './drum-machine.component.html',
  styleUrls: ['./drum-machine.component.css'],
  imports: [CommonModule, SampleLibraryComponent],
  host: {
    '(window:keydown)': 'handleKeyDown($event)',
  },
})
export class DrumMachineComponent implements AfterViewInit, OnDestroy {
  audioContext: AudioContext | null = null;
  
  // State
  kits = kits;
  activeKit = signal<Kit>(kits[0]);
  pads = signal<Pad[]>(kits[0].pads.map(p => ({...p}))); // Clone pads for independent modification
  bpm = signal(120);
  isPlaying = signal(false);
  currentStep = signal(-1);
  sequence = signal<Map<string, boolean[]>>(new Map()); // Initialized in constructor

  // UI State for Sample Library
  showSampleLibrary = signal(false);
  selectedPadIndex = signal<number | null>(null);
  
  // New: Inputs for routing state from parent
  isDrumRoutedA = input(false);
  isDrumRoutedB = input(false);

  // Outputs for routing
  routeToDeck = output<{ stream: MediaStream, deckId: 'A' | 'B' | null }>();
  unrouteDeck = output<'A' | 'B'>(); // For explicit unrouting

  // Visuals
  litPads = signal<Set<number>>(new Set());
  
  private audioBuffers = new Map<string, AudioBuffer>();
  private customSampleData = new Map<string, string>(); // New: Store custom sample base64 data
  private customSampleCounter = 0; // For unique custom sample keys

  private mediaStreamDestinationNode?: MediaStreamAudioDestinationNode; // New: For routing output
  private timerId?: number;

  constructor() {
    // Initialize sequence based on initial pads
    this.sequence.set(this.createEmptySequence());
  }

  ngAfterViewInit(): void {
    // Defer audio init to first user interaction to comply with autoplay policies
  }

  ngOnDestroy(): void {
    this.stop();
    this.audioContext?.close().catch(e => console.error("Error closing AudioContext:", e));
  }
  
  handleKeyDown(event: KeyboardEvent): void {
    if (event.repeat) return;
    const padIndex = KEY_TO_PAD_MAP[event.key.toLowerCase()];
    if (padIndex !== undefined) {
      this.triggerPad(padIndex);
    }
  }

  private async initAudio(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'running') return;
  
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.mediaStreamDestinationNode = this.audioContext.createMediaStreamDestination();
      await this.loadSamplesForKit(this.pads());
      await this.setupMidi();
    }
    
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  private async loadSamplesForKit(padsToLoad: Pad[]): Promise<void> {
    if (!this.audioContext) return;
    const context = this.audioContext;
    // Do not clear all buffers, just update the ones for padsToLoad.
    // This allows keeping custom samples loaded.
    // For a full kit change, we might clear, but for single pad changes, this is better.

    const loadPromises = padsToLoad.map(async (pad) => {
      if (this.audioBuffers.has(pad.sampleKey)) return; // Already loaded

      const sampleSrc = this.customSampleData.get(pad.sampleKey) || SAMPLES[pad.sampleKey];
      if (!sampleSrc) {
        console.warn(`Sample source not found for ${pad.sampleKey}`);
        return;
      }
      try {
        const response = await fetch(sampleSrc);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await context.decodeAudioData(arrayBuffer);
        this.audioBuffers.set(pad.sampleKey, audioBuffer);
      } catch (error) {
        console.error(`Error loading sample ${pad.sampleKey}:`, error);
      }
    });
    await Promise.all(loadPromises);
  }

  private async setupMidi(): Promise<void> {
    if (navigator.requestMIDIAccess) {
      try {
        const midiAccess = await navigator.requestMIDIAccess();
        midiAccess.inputs.forEach(input => {
          input.onmidimessage = this.onMidiMessage.bind(this);
        });
      } catch (error) {
        console.warn("MIDI access not granted or not available.", error);
      }
    }
  }

  private onMidiMessage(message: MIDIMessageEvent): void {
    const [command, note] = message.data;
    // Note On command = 0x90
    if (command === 144 && note) {
      const padIndex = MIDI_NOTE_TO_PAD_MAP[note];
      if (padIndex !== undefined) {
        this.triggerPad(padIndex);
      }
    }
  }

  triggerPad(padIndex: number): void {
    const pad = this.pads()[padIndex];
    if (!pad) return;

    this.playSound(pad.sampleKey);
    
    // Visual feedback
    this.litPads.update(current => {
      current.add(padIndex);
      return new Set(current);
    });
    setTimeout(() => {
      this.litPads.update(current => {
        current.delete(padIndex);
        return new Set(current);
      });
    }, 100);
  }
  
  private async playSound(sampleKey: string): Promise<void> {
    await this.initAudio();
    if (!this.audioContext) return;

    const audioBuffer = this.audioBuffers.get(sampleKey);
    if (audioBuffer) {
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      
      // Connect to the destination node for routing to the decks
      if (this.mediaStreamDestinationNode) {
        source.connect(this.mediaStreamDestinationNode);
      }
      // Also connect to the main output so we can hear it from the drum machine itself
      source.connect(this.audioContext.destination);
      
      source.start(0);
    } else {
      console.warn(`Buffer for sample ${sampleKey} not found.`);
    }
  }

  // Sequencer logic
  async togglePlay(): Promise<void> {
    await this.initAudio();
    if (this.isPlaying()) {
      this.stop();
    } else {
      this.start();
    }
  }

  start(): void {
    if (this.isPlaying()) return;
    this.isPlaying.set(true);
    this.currentStep.set(this.currentStep() === -1 ? 0 : this.currentStep()); // Start from beginning if stopped
    this.scheduleNextStep();
  }

  stop(): void {
    this.isPlaying.set(false);
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = undefined;
    }
    // Don't reset currentStep to -1, so it can be resumed.
  }

  resetSequencer(): void {
    this.stop();
    this.currentStep.set(-1);
  }
  
  private scheduleNextStep(): void {
    if (!this.isPlaying()) return;

    this.playStep(this.currentStep());

    const secondsPerBeat = 60.0 / this.bpm();
    const secondsPerStep = secondsPerBeat / 4; // 16th notes

    this.timerId = window.setTimeout(() => {
      this.currentStep.update(s => (s + 1) % 16);
      this.scheduleNextStep();
    }, secondsPerStep * 1000);
  }

  private playStep(step: number): void {
    if (step < 0) return;
    this.pads().forEach((pad, padIndex) => {
      const padSequence = this.sequence().get(pad.sampleKey);
      if (padSequence?.[step]) {
        this.playSound(pad.sampleKey);
         // Visual feedback for sequencer step
        this.litPads.update(current => {
          current.add(padIndex);
          return new Set(current);
        });
        setTimeout(() => {
          this.litPads.update(current => {
            current.delete(padIndex);
            return new Set(current);
          });
        }, 100);
      }
    });
  }

  toggleStep(padIndex: number, stepIndex: number): void {
    const pad = this.pads()[padIndex];
    if (!pad) return;

    this.sequence.update(currentSequence => {
      const padSequence = currentSequence.get(pad.sampleKey);
      if (padSequence) {
        padSequence[stepIndex] = !padSequence[stepIndex];
      }
      return new Map(currentSequence);
    });
  }

  onBpmChange(event: Event): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value) && value > 0) {
      this.bpm.set(value);
    }
  }

  changeKit(kitName: string): void {
    const kit = this.kits.find(k => k.name === kitName);
    if (!kit) return;
    
    this.stop();
    this.activeKit.set(kit);
    this.pads.set(kit.pads.map(p => ({...p})));
    this.sequence.set(this.createEmptySequence());
    this.loadSamplesForKit(this.pads());
  }

  // Sample library interaction
  openSampleLibrary(padIndex: number): void {
    this.selectedPadIndex.set(padIndex);
    this.showSampleLibrary.set(true);
  }

  closeSampleLibrary(): void {
    this.showSampleLibrary.set(false);
    this.selectedPadIndex.set(null);
  }

  assignSampleToPad(event: { sampleKey: string; base64Data?: string }): void {
    const padIndex = this.selectedPadIndex();
    if (padIndex === null) return;

    const { sampleKey, base64Data } = event;

    if (base64Data) {
      this.customSampleData.set(sampleKey, base64Data);
    }

    this.pads.update(pads => {
      const newPads = [...pads];
      const oldSampleKey = newPads[padIndex].sampleKey;
      newPads[padIndex] = { ...newPads[padIndex], sampleKey };
      
      this.sequence.update(currentSequence => {
        const padSequence = currentSequence.get(oldSampleKey);
        if (padSequence) {
            currentSequence.delete(oldSampleKey);
            currentSequence.set(sampleKey, padSequence);
        }
        return new Map(currentSequence);
      });
      
      return newPads;
    });

    this.loadSamplesForKit([this.pads()[padIndex]]);
    this.closeSampleLibrary();
  }
  
  private createEmptySequence(): Map<string, boolean[]> {
    const newSequence = new Map<string, boolean[]>();
    this.pads().forEach(pad => {
      newSequence.set(pad.sampleKey, Array(16).fill(false));
    });
    return newSequence;
  }

  // --- New/Fixed Methods for UI Interaction ---

  savePattern(): void {
    alert('Save pattern functionality is not yet implemented.');
  }

  handlePatternUpload(event: Event): void {
    alert('Load pattern functionality is not yet implemented.');
    const input = event.target as HTMLInputElement;
    if (input) {
      input.value = '';
    }
  }

  exportAsWav(): void {
    alert('Export as WAV functionality is not yet implemented.');
  }

  routeDrumToDeck(deckId: 'A' | 'B'): void {
    this.toggleRouteToDeck(deckId);
  }

  unrouteDrum(deckId: 'A' | 'B'): void { // parameter unused, but exists in template call
    this.routeToDeck.emit({ stream: this.mediaStreamDestinationNode!.stream, deckId: null });
  }

  // --- Routing Logic ---
  async toggleRouteToDeck(deckId: 'A' | 'B'): Promise<void> {
    await this.initAudio();
    const isCurrentlyRouted = deckId === 'A' ? this.isDrumRoutedA() : this.isDrumRoutedB();
    
    if (isCurrentlyRouted) {
      // Unroute from this deck (unroutes all in parent)
      this.routeToDeck.emit({ stream: this.mediaStreamDestinationNode!.stream, deckId: null });
    } else {
      // Route to this deck (and unroute from the other if necessary)
      this.routeToDeck.emit({ stream: this.mediaStreamDestinationNode!.stream, deckId });
    }
  }
}
