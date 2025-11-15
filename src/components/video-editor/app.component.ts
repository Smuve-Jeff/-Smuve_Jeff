import { Component, ChangeDetectionStrategy, signal, ElementRef, viewChild, effect, OnDestroy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EqPanelComponent } from '../eq-panel/eq-panel.component';
import { MatrixBackgroundComponent } from '../matrix-background/matrix-background.component';
import { DrumMachineComponent } from '../audio-visualizer/chatbot/drum-machine/drum-machine.component';
import { ChatbotComponent } from '../audio-visualizer/chatbot/chatbot.component';
import { ImageEditorComponent } from '../image-editor/image-editor.component';
import { VideoEditorComponent } from './video-editor.component';
import { AudioVisualizerComponent } from '../audio-visualizer/chatbot/audio-visualizer.component';

export interface Track {
  title: string;
  artist: string;
  albumArtUrl: string;
  audioSrc: string;
  videoSrc?: string;
}

export interface EqBand {
  label: string;
  value: number;
}

export interface Enhancements {
  bassBoost: boolean;
  surroundSound: boolean;
}

export interface DeckState {
  track: Track;
  isPlaying: boolean;
  progress: number;
  duration: number;
  playbackRate: number; // Pitch
  filterFreq: number; // FX (Low-pass filter frequency)
  loop: boolean;
  gain: number;
  eqHigh: number;
  eqMid: number;
  eqLow: number;
  drumInputVolume: number; // New for routed drum machine
  wasPlayingBeforeScratch?: boolean; // NEW: To restore play state after scratch
}

export const initialDeckState: DeckState = {
  track: {
    title: 'NO SIGNAL',
    artist: 'Load a track into deck',
    albumArtUrl: 'https://picsum.photos/seed/placeholder/500/500',
    audioSrc: '',
  },
  isPlaying: false,
  progress: 0,
  duration: 0,
  playbackRate: 1,
  filterFreq: 20000, // Start with filter wide open
  loop: false,
  gain: 50, // 0-100
  eqHigh: 50, // 0-100
  eqMid: 50, // 0-100
  eqLow: 50, // 0-100
  drumInputVolume: 0, // Default to off
  wasPlayingBeforeScratch: false,
};

type ScratchState = {
  active: boolean;
  lastAngle: number;
  platterElement: HTMLElement | null;
  initialTouchX?: number; // NEW
  initialTouchY?: number; // NEW
};

// New: Theme interface and predefined themes
export interface AppTheme {
  name: string;
  primary: string; // Tailwind color name (e.g., 'green', 'amber')
  accent: string;  // Tailwind color name for DJ mode (e.g., 'amber', 'blue')
  neutral: string; // Tailwind color name for neutral backgrounds/text (e.g., 'neutral', 'stone')
  purple: string; // Added for editor themes, though usually generic, using it for specific editors
  red: string; // Added for editor themes, though usually generic, using it for specific editors
}

const THEMES: AppTheme[] = [
  { name: 'Green Vintage', primary: 'green', accent: 'amber', neutral: 'neutral', purple: 'purple', red: 'red' },
  { name: 'Blue Retro', primary: 'blue', accent: 'fuchsia', neutral: 'zinc', purple: 'purple', red: 'red' },
  { name: 'Red Glitch', primary: 'red', accent: 'cyan', neutral: 'stone', purple: 'purple', red: 'red' },
  { name: 'Amber Glow', primary: 'amber', accent: 'green', neutral: 'neutral', purple: 'purple', red: 'red' },
  { name: 'Purple Haze', primary: 'purple', accent: 'lime', neutral: 'slate', purple: 'purple', red: 'red' },
  { name: 'Cyan Wave', primary: 'cyan', accent: 'violet', neutral: 'gray', purple: 'purple', red: 'red' },
  { name: 'Yellow Neon', primary: 'yellow', accent: 'red', neutral: 'stone', purple: 'purple', red: 'red' },
];

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Removed standalone: true as it's default in Angular v20+
  imports: [CommonModule, EqPanelComponent, MatrixBackgroundComponent, DrumMachineComponent, ChatbotComponent, ImageEditorComponent, VideoEditorComponent, AudioVisualizerComponent], // NEW: Add VideoEditorComponent, AudioVisualizerComponent
  host: {
    // Moved host listeners from @HostListener decorators to the host object
    '(window:mousemove)': 'onScratch($event)',
    '(window:touchmove)': 'onScratch($event)',
    '(window:mouseup)': 'onScratchEnd()',
    '(window:touchend)': 'onScratchEnd()',
  },
})
export class AppComponent implements OnDestroy {
  audioPlayerARef = viewChild<ElementRef<HTMLAudioElement>>('audioPlayerA');
  videoPlayerARef = viewChild<ElementRef<HTMLVideoElement>>('videoPlayerA');
  audioPlayerBRef = viewChild<ElementRef<HTMLAudioElement>>('audioPlayerB');
  videoPlayerBRef = viewChild<ElementRef<HTMLVideoElement>>('videoPlayerB');
  fileInputRef = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  // App mode
  mainViewMode = signal<'player' | 'dj' | 'drum' | 'image-editor' | 'video-editor'>('player'); // NEW: Added video-editor
  showChatbot = signal(false); // NEW: Chatbot is a modal, starts open for initial greeting

  // DJ State
  deckA = signal<DeckState>({ ...initialDeckState });
  deckB = signal<DeckState>({ ...initialDeckState });
  crossfade = signal(0); // -1 is full A, 1 is full B
  loadingTargetDeck = signal<'A' | 'B' | null>(null);

  // Scratching State
  isScratchingA = signal(false);
  isScratchingB = signal(false);
  scratchRotationA = signal('');
  scratchRotationB = signal('');
  private scratchStateA: ScratchState = { active: false, lastAngle: 0, platterElement: null };
  private scratchStateB: ScratchState = { active: false, lastAngle: 0, platterElement: null };
  private readonly SCRATCH_SENSITIVITY = 2.5; // Adjust to control scratch responsiveness

  // Player State
  playlist = signal<Track[]>([]);
  currentTrackIndex = signal<number>(-1);
  currentPlayerTrack = computed<Track | null>(() => {
    const idx = this.currentTrackIndex();
    const list = this.playlist();
    return (idx >= 0 && idx < list.length) ? list[idx] : null;
  });

  // Master State
  volume = signal(0.75);
  showEqPanel = signal(false);
  
  // Search state
  searchQuery = signal('');
  isSearching = signal(false);
  searchResults = signal<Track[]>([]);

  // Master Effects State
  eqSettings = signal<EqBand[]>([
    { label: '60Hz', value: 50 }, { label: '310Hz', value: 50 }, { label: '1KHz', value: 50 },
    { label: '6KHz', value: 50 }, { label: '16KHz', value: 50 },
  ]);
  enhancements = signal<Enhancements>({ bassBoost: false, surroundSound: false });

  // Recording State
  isRecording = signal(false);
  recordingTime = signal(0);
  recordedMixUrl = signal<string | null>(null);
  private recordedBlob = signal<Blob | null>(null);
  canShare = computed(() => !!(navigator.share && this.recordedBlob()));

  // VU Meter State
  vuLevelA = signal(0);
  vuLevelB = signal(0);
  vuLevelMaster = signal(0);
  vuBars = Array(12).fill(0); // For template iteration

  // Drum Machine Routing State
  isDrumRoutedA = signal(false);
  isDrumRoutedB = signal(false);

  // NEW: Microphone State
  micEnabled = signal(false);
  micVolume = signal(50); // 0-100
  micEqHigh = signal(50); // 0-100
  micEqMid = signal(50); // 0-100
  micEqLow = signal(50); // 0-100
  micFilterFreq = signal(20000); // Low-pass filter frequency, 20Hz-20KHz
  vuLevelMic = signal(0); // VU level for microphone

  // NEW: Theming State
  readonly THEMES = THEMES;
  currentTheme = signal<AppTheme>(THEMES[0]);
  
  // Computed CSS classes for dynamic theming
  mainBorderClass = computed(() => `border-${this.currentTheme().primary}-400/50`);
  mainTextColorClass = computed(() => `text-${this.currentTheme().primary}-400`);
  mainHoverBgClass = computed(() => `hover:bg-${this.currentTheme().primary}-400 hover:text-black`);
  mainBg90050Class = computed(() => `bg-${this.currentTheme().primary}-900/50`);

  djBorderClass = computed(() => `border-${this.currentTheme().accent}-500/30`);
  djTextColorClass = computed(() => `text-${this.currentTheme().accent}-400`);
  djActiveBgClass = computed(() => `bg-${this.currentTheme().accent}-500`);
  djHoverBgClass = computed(() => `hover:bg-${this.currentTheme().accent}-500 hover:text-black`);
  djBg80050Class = computed(() => `bg-${this.currentTheme().neutral}-800/50`);
  djTextAccent300Class = computed(() => `text-${this.currentTheme().accent}-300`);
  djTextNeutral400Class = computed(() => `text-${this.currentTheme().neutral}-400`);
  djBgStone900 = computed(() => `bg-${this.currentTheme().neutral}-900`);
  djBgStone700 = computed(() => `bg-${this.currentTheme().neutral}-700`);
  djBgStone800 = computed(() => `bg-${this.currentTheme().neutral}-800`);

  // NEW: Store last selected image URL from image editor
  lastImageEditorImageUrl = signal<string | null>(null);
  showApplyAlbumArtModal = signal(false); // NEW: For applying image from editor

  // NEW: Initial prompts for AI editors (from chatbot commands)
  imageEditorInitialPrompt = signal<string | null>(null);
  videoEditorInitialPrompt = signal<string | null>(null);

  // NEW: Application-wide error signal
  appError = signal<string | null>(null);

  // Web Audio API properties
  private audioContext?: AudioContext;
  private sourceA?: MediaElementAudioSourceNode; private trimNodeA?: GainNode; private eqHighNodeA?: BiquadFilterNode; private eqMidNodeA?: BiquadFilterNode; private eqLowNodeA?: BiquadFilterNode; private filterNodeA?: BiquadFilterNode; private gainNodeA?: GainNode; private analyserA?: AnalyserNode;
  private sourceB?: MediaElementAudioSourceNode; private trimNodeB?: GainNode; private eqHighNodeB?: BiquadFilterNode; private eqMidNodeB?: BiquadFilterNode; private eqLowNodeB?: BiquadFilterNode; private filterNodeB?: BiquadFilterNode; private gainNodeB?: GainNode; private analyserB?: AnalyserNode;
  private masterBus?: GainNode; private analyserMaster?: AnalyserNode; // Made analyserMaster public for visualizer
  private eqNodes: BiquadFilterNode[] = [];
  private bassBoostNode?: BiquadFilterNode;
  private mediaStreamDestination?: MediaStreamAudioDestinationNode;
  private mediaRecorder?: MediaRecorder;
  private recordedChunks: Blob[] = [];
  private recordingIntervalId?: number;
  private animationFrameId?: number;
  private vuDataArrayA?: Uint8Array; private vuDataArrayB?: Uint8Array; private vuDataArrayMaster?: Uint8Array;

  // New: Drum machine routing nodes for each deck
  private drumInputSourceA?: MediaStreamAudioSourceNode; private drumInputGainA?: GainNode;
  private drumInputSourceB?: MediaStreamAudioSourceNode; private drumInputGainB?: GainNode;
  private dummyDrumStream?: MediaStream;

  // NEW: Web Audio API properties for Microphone
  private micStream?: MediaStream;
  private micSourceNode?: MediaStreamAudioSourceNode;
  private micGainNode?: GainNode; // Main gain for microphone input
  private micEqHighNode?: BiquadFilterNode;
  private micEqMidNode?: BiquadFilterNode;
  private micEqLowNode?: BiquadFilterNode;
  private micFilterNode?: BiquadFilterNode; // Low-pass filter for mic
  private micAnalyser?: AnalyserNode;
  private vuDataArrayMic?: Uint8Array;


  constructor() {
    this.setupAudioEffects();
    effect(() => {
        const track = this.currentPlayerTrack();
        if (track && this.mainViewMode() === 'player') {
            this.loadTrack(track, 'A', this.deckA().isPlaying || this.playlist().length === 1);
        } else if (this.playlist().length === 0 && this.mainViewMode() === 'player') {
            this.deckA.set({...initialDeckState, track: {...initialDeckState.track, artist: 'Load a track to start'}});
        }
    });
  }
  
  ngOnDestroy(): void {
    this.audioContext?.close().catch(e => console.error("Error closing AudioContext:", e));
    this.stopVuLoop();
    if (this.recordingIntervalId) clearInterval(this.recordingIntervalId);
    if (this.micStream) { // NEW: Stop microphone tracks on destroy
      this.micStream.getTracks().forEach(track => track.stop());
    }
  }

  private setupAudioEffects(): void {
    // Deck A effects
    effect(() => {
        const player = this.audioPlayerARef()?.nativeElement;
        if (!player) return;
        const deck = this.deckA();
        if (deck.isPlaying && !this.isScratchingA()) player.play().catch(console.error); else player.pause();
        
        const newSrc = deck.track.audioSrc;
        if (player.src !== newSrc) {
            player.src = newSrc;
            player.load();
        }
        player.playbackRate = deck.playbackRate;
        player.loop = deck.loop;
    });
    effect(() => {
        const player = this.videoPlayerARef()?.nativeElement;
        if (!player) return;
        const deck = this.deckA();
        const videoSrc = deck.track.videoSrc || '';
        if (deck.isPlaying) player.play().catch(console.error); else player.pause();
        if (player.src !== videoSrc) {
            player.src = videoSrc;
            player.load();
        }
    });
    effect(() => this.filterNodeA?.frequency.setValueAtTime(this.deckA().filterFreq, this.audioContext?.currentTime ?? 0));
    effect(() => this.trimNodeA?.gain.setValueAtTime(this.deckA().gain / 50, this.audioContext?.currentTime ?? 0));
    effect(() => this.eqHighNodeA?.gain.setValueAtTime((this.deckA().eqHigh - 50) * (12 / 50), this.audioContext?.currentTime ?? 0));
    effect(() => this.eqMidNodeA?.gain.setValueAtTime((this.deckA().eqMid - 50) * (12 / 50), this.audioContext?.currentTime ?? 0));
    effect(() => this.eqLowNodeA?.gain.setValueAtTime((this.deckA().eqLow - 50) * (12 / 50), this.audioContext?.currentTime ?? 0));
    effect(() => this.drumInputGainA?.gain.setValueAtTime(this.deckA().drumInputVolume / 100, this.audioContext?.currentTime ?? 0));

    // Deck B effects
    effect(() => {
        const player = this.audioPlayerBRef()?.nativeElement;
        if (!player) return;
        const deck = this.deckB();
        if (deck.isPlaying && !this.isScratchingB()) player.play().catch(console.error); else player.pause();

        const newSrc = deck.track.audioSrc;
        if (player.src !== newSrc) {
            player.src = newSrc;
            player.load();
        }
        player.playbackRate = deck.playbackRate;
        player.loop = deck.loop;
    });
    effect(() => {
        const player = this.videoPlayerBRef()?.nativeElement;
        if (!player) return;
        const deck = this.deckB();
        const videoSrc = deck.track.videoSrc || '';
        if (deck.isPlaying) player.play().catch(console.error); else player.pause();
        if (player.src !== videoSrc) {
            player.src = videoSrc;
            player.load();
        }
    });
    effect(() => this.filterNodeB?.frequency.setValueAtTime(this.deckB().filterFreq, this.audioContext?.currentTime ?? 0));
    effect(() => this.trimNodeB?.gain.setValueAtTime(this.deckB().gain / 50, this.audioContext?.currentTime ?? 0));
    effect(() => this.eqHighNodeB?.gain.setValueAtTime((this.deckB().eqHigh - 50) * (12 / 50), this.audioContext?.currentTime ?? 0));
    effect(() => this.eqMidNodeB?.gain.setValueAtTime((this.deckB().eqMid - 50) * (12 / 50), this.audioContext?.currentTime ?? 0));
    effect(() => this.eqLowNodeB?.gain.setValueAtTime((this.deckB().eqLow - 50) * (12 / 50), this.audioContext?.currentTime ?? 0));
    effect(() => this.drumInputGainB?.gain.setValueAtTime(this.deckB().drumInputVolume / 100, this.audioContext?.currentTime ?? 0));

    // Mixer effects
    effect(() => this.masterBus?.gain.setValueAtTime(this.volume(), this.audioContext?.currentTime ?? 0));
    effect(() => {
      if (!this.gainNodeA || !this.gainNodeB || !this.audioContext) return;
      const x = (this.crossfade() + 1) / 2; // Map [-1, 1] to [0, 1]
      const gainA = Math.cos(x * 0.5 * Math.PI);
      const gainB = Math.cos((1 - x) * 0.5 * Math.PI);
      this.gainNodeA.gain.setValueAtTime(gainA, this.audioContext.currentTime);
      this.gainNodeB.gain.setValueAtTime(gainB, this.audioContext.currentTime);
    });

    // Master EQ/Enhancements effects
    effect(() => this.eqNodes.forEach((node, i) => node.gain.setValueAtTime((this.eqSettings()[i].value - 50) * (12/50), this.audioContext?.currentTime ?? 0)));
    effect(() => this.bassBoostNode?.gain.setValueAtTime(this.enhancements().bassBoost ? 6 : 0, this.audioContext?.currentTime ?? 0));

    // NEW: Microphone Effects
    effect(() => this.micGainNode?.gain.setValueAtTime(this.micVolume() / 50, this.audioContext?.currentTime ?? 0));
    effect(() => this.micEqHighNode?.gain.setValueAtTime((this.micEqHigh() - 50) * (12 / 50), this.audioContext?.currentTime ?? 0));
    // FIX: Correctly access signal values for micEqMid and micEqLow
    effect(() => this.micEqMidNode?.gain.setValueAtTime((this.micEqMid() - 50) * (12 / 50), this.audioContext?.currentTime ?? 0));
    effect(() => this.micEqLowNode?.gain.setValueAtTime((this.micEqLow() - 50) * (12 / 50), this.audioContext?.currentTime ?? 0));
    effect(() => {
      const freq = this.micFilterFreq();
      if (this.micFilterNode) {
        // Ensure the filter frequency is within the AudioParam's acceptable range (typically 0 to context.sampleRate / 2)
        // A simple clamp between a reasonable min and max (e.g., 20Hz and 20kHz) is good.
        this.micFilterNode.frequency.setValueAtTime(Math.max(20, Math.min(20000, freq)), this.audioContext?.currentTime ?? 0);
      }
    });

    // FIX: Audio/Video Synchronization
    effect(() => {
        const audioPlayer = this.audioPlayerARef()?.nativeElement;
        const videoPlayer = this.videoPlayerARef()?.nativeElement;
        if (videoPlayer && audioPlayer && this.deckA().isPlaying && !this.isScratchingA()) {
            const timeDiff = audioPlayer.currentTime - videoPlayer.currentTime;
            if (Math.abs(timeDiff) > 0.5) { // Resync if more than 500ms out of sync
                videoPlayer.currentTime = audioPlayer.currentTime;
            }
        }
    });
    effect(() => {
        const audioPlayer = this.audioPlayerBRef()?.nativeElement;
        const videoPlayer = this.videoPlayerBRef()?.nativeElement;
        if (videoPlayer && audioPlayer && this.deckB().isPlaying && !this.isScratchingB()) {
            const timeDiff = audioPlayer.currentTime - videoPlayer.currentTime;
            if (Math.abs(timeDiff) > 0.5) { // Resync if more than 500ms out of sync
                videoPlayer.currentTime = audioPlayer.currentTime;
            }
        }
    });
  }

  private initAudioContext(): void {
    if (this.audioContext) return;
    const audioElA = this.audioPlayerARef()?.nativeElement;
    const audioElB = this.audioPlayerBRef()?.nativeElement;
    if (!audioElA || !audioElB) return;
    
    this.audioContext = new AudioContext();
    this.masterBus = this.audioContext.createGain();
    this.analyserMaster = this.audioContext.createAnalyser();
    this.analyserMaster.fftSize = 256;
    this.vuDataArrayMaster = new Uint8Array(this.analyserMaster.frequencyBinCount);

    // FIX: Create a valid dummy MediaStream with an audio track to prevent errors.
    const dummyOscillator = this.audioContext.createOscillator();
    dummyOscillator.type = 'sine'; // A very quiet sine wave
    dummyOscillator.frequency.setValueAtTime(0, this.audioContext.currentTime); // 0Hz to make it silent
    const dummyGain = this.audioContext.createGain();
    dummyGain.gain.setValueAtTime(0, this.audioContext.currentTime); // Ensure it's completely silent
    dummyOscillator.connect(dummyGain);
    const dummyDestination = this.audioContext.createMediaStreamDestination();
    dummyGain.connect(dummyDestination);
    dummyOscillator.start();
    this.dummyDrumStream = dummyDestination.stream;
    // dummyOscillator.stop() - no need to stop immediately, it will just produce silent data.

    // Deck A Chain
    this.sourceA = this.audioContext.createMediaElementSource(audioElA);
    this.trimNodeA = this.audioContext.createGain();
    this.eqHighNodeA = new BiquadFilterNode(this.audioContext, { type: 'highshelf', frequency: 10000 });
    this.eqMidNodeA = new BiquadFilterNode(this.audioContext, { type: 'peaking', frequency: 1000, Q: 0.8 });
    this.eqLowNodeA = new BiquadFilterNode(this.audioContext, { type: 'lowshelf', frequency: 250 });
    this.filterNodeA = new BiquadFilterNode(this.audioContext, { type: 'lowpass', Q: 1});
    this.analyserA = this.audioContext.createAnalyser();
    this.analyserA.fftSize = 256;
    this.vuDataArrayA = new Uint8Array(this.analyserA.frequencyBinCount);
    this.gainNodeA = this.audioContext.createGain();
    
    // New: Drum input for Deck A
    this.drumInputSourceA = this.audioContext.createMediaStreamSource(this.dummyDrumStream);
    this.drumInputGainA = this.audioContext.createGain();
    this.drumInputGainA.gain.value = 0; // Initially muted

    this.sourceA.connect(this.trimNodeA);
    this.trimNodeA.connect(this.eqLowNodeA);
    this.drumInputSourceA.connect(this.drumInputGainA); // Connect drum input
    this.drumInputGainA.connect(this.eqLowNodeA); // Mix drum input into EQ chain
    this.eqLowNodeA.connect(this.eqMidNodeA).connect(this.eqHighNodeA).connect(this.filterNodeA).connect(this.analyserA).connect(this.gainNodeA).connect(this.masterBus);

    // Deck B Chain
    this.sourceB = this.audioContext.createMediaElementSource(audioElB);
    this.trimNodeB = this.audioContext.createGain();
    this.eqHighNodeB = new BiquadFilterNode(this.audioContext, { type: 'highshelf', frequency: 10000 });
    this.eqMidNodeB = new BiquadFilterNode(this.audioContext, { type: 'peaking', frequency: 1000, Q: 0.8 });
    this.eqLowNodeB = new BiquadFilterNode(this.audioContext, { type: 'lowshelf', frequency: 250 });
    this.filterNodeB = new BiquadFilterNode(this.audioContext, { type: 'lowpass', Q: 1});
    this.analyserB = this.audioContext.createAnalyser();
    this.analyserB.fftSize = 256;
    this.vuDataArrayB = new Uint8Array(this.analyserB.frequencyBinCount);
    this.gainNodeB = this.audioContext.createGain();

    // New: Drum input for Deck B
    this.drumInputSourceB = this.audioContext.createMediaStreamSource(this.dummyDrumStream);
    this.drumInputGainB = this.audioContext.createGain();
    this.drumInputGainB.gain.value = 0; // Initially muted

    this.sourceB.connect(this.trimNodeB);
    this.trimNodeB.connect(this.eqLowNodeB);
    this.drumInputSourceB.connect(this.drumInputGainB); // Connect drum input
    this.drumInputGainB.connect(this.eqLowNodeB); // Mix drum input into EQ chain
    this.eqLowNodeB.connect(this.eqMidNodeB).connect(this.eqHighNodeB).connect(this.filterNodeB).connect(this.analyserB).connect(this.gainNodeB).connect(this.masterBus);

    // Master Chain (For Player Mode)
    const freqs = [60, 310, 1000, 6000, 16000];
    this.eqNodes = freqs.map((f, i) => new BiquadFilterNode(this.audioContext!, {
        type: i === 0 ? 'lowshelf' : i === freqs.length - 1 ? 'highshelf' : 'peaking',
        frequency: f,
    }));
    this.bassBoostNode = new BiquadFilterNode(this.audioContext, { type: 'lowshelf', frequency: 150 });
    this.mediaStreamDestination = this.audioContext.createMediaStreamDestination();

    // Connect master bus to the EQ nodes, then bass boost, then master analyser, then audioContext.destination and mediaStreamDestination
    if (this.masterBus) {
      let currentNode: AudioNode = this.masterBus;
      this.eqNodes.forEach(node => {
        currentNode.connect(node);
        currentNode = node;
      });
      if (this.bassBoostNode) {
        currentNode.connect(this.bassBoostNode);
        currentNode = this.bassBoostNode;
      }
      if (this.analyserMaster) { // NEW: Connect master analyser here for the visualizer
        currentNode.connect(this.analyserMaster);
        currentNode = this.analyserMaster;
      }
      currentNode.connect(this.audioContext.destination);
      if (this.mediaStreamDestination) {
        currentNode.connect(this.mediaStreamDestination);
      }
    }


    // NEW: Microphone Nodes initialization (initially disconnected)
    this.micGainNode = this.audioContext.createGain();
    this.micEqHighNode = new BiquadFilterNode(this.audioContext, { type: 'highshelf', frequency: 10000 });
    this.micEqMidNode = new BiquadFilterNode(this.audioContext, { type: 'peaking', frequency: 1000, Q: 0.8 });
    this.micEqLowNode = new BiquadFilterNode(this.audioContext, { type: 'lowshelf', frequency: 250 });
    this.micFilterNode = new BiquadFilterNode(this.audioContext, { type: 'lowpass', Q: 1 });
    this.micAnalyser = this.audioContext.createAnalyser();
    this.micAnalyser.fftSize = 256;
    this.vuDataArrayMic = new Uint8Array(this.micAnalyser.frequencyBinCount);
  }

  private ensureAudioContext(): void {
    if (!this.audioContext) {
      this.initAudioContext();
      this.startVuLoop();
    }
    if (this.audioContext?.state === 'suspended') this.audioContext.resume();
  }
  
  togglePlayPause(deckId: 'A' | 'B'): void {
    const deck = deckId === 'A' ? this.deckA : this.deckB;
    if (deck().track.audioSrc) {
      this.ensureAudioContext();
      deck.update(d => ({ ...d, isPlaying: !d.isPlaying, wasPlayingBeforeScratch: !d.isPlaying })); // Store play state
    } else if (this.mainViewMode() === 'player' && this.playlist().length > 0) {
        this.playTrackFromPlaylist(this.currentTrackIndex() >= 0 ? this.currentTrackIndex() : 0);
    }
  }

  onProgressChange(event: Event, deckId: 'A' | 'B'): void {
    const player = deckId === 'A' ? this.audioPlayerARef()?.nativeElement : this.audioPlayerBRef()?.nativeElement;
    const videoPlayer = deckId === 'A' ? this.videoPlayerARef()?.nativeElement : this.videoPlayerBRef()?.nativeElement;
    if (!player) return;
    const value = parseFloat((event.target as HTMLInputElement).value);
    player.currentTime = value;
    if (videoPlayer) {
      videoPlayer.currentTime = value;
    }
    (deckId === 'A' ? this.deckA : this.deckB).update(d => ({ ...d, progress: value }));
  }

  onTimeUpdate(event: Event, deckId: 'A' | 'B'): void { 
      const isScratching = deckId === 'A' ? this.isScratchingA() : this.isScratchingB();
      if (isScratching) return;
      (deckId === 'A' ? this.deckA : this.deckB).update(d => ({ ...d, progress: (event.target as HTMLAudioElement).currentTime }));
  }
  onLoadedMetadata(event: Event, deckId: 'A' | 'B'): void { (deckId === 'A' ? this.deckA : this.deckB).update(d => ({ ...d, duration: (event.target as HTMLAudioElement).duration })); }

  onEnded(deckId: 'A' | 'B'): void {
    if (this.mainViewMode() === 'player' && deckId === 'A' && this.playlist().length > 0) {
      if (this.currentTrackIndex() < this.playlist().length - 1) { this.playNext(); return; }
    }
    const deck = deckId === 'A' ? this.deckA : this.deckB;
    if (!deck().loop) {
        deck.update(d => ({...d, isPlaying: false, progress: 0}));
        const player = deckId === 'A' ? this.audioPlayerARef()?.nativeElement : this.audioPlayerBRef()?.nativeElement;
        if(player) player.currentTime = 0;
    }
  }

  onPitchChange(event: Event, deckId: 'A' | 'B'): void { (deckId === 'A' ? this.deckA : this.deckB).update(d => ({ ...d, playbackRate: parseFloat((event.target as HTMLInputElement).value) })); }
  onFilterChange(event: Event, deckId: 'A' | 'B'): void {
      const value = parseFloat((event.target as HTMLInputElement).value); // 0 to 1
      const minFreq = 20;
      const maxFreq = 20000;
      // Convert linear slider value (0-1) back to logarithmic frequency
      const freq = minFreq * Math.pow((maxFreq / minFreq), value);
      (deckId === 'A' ? this.deckA : this.deckB).update(d => ({ ...d, filterFreq: freq }));
  }
  onGainChange(event: Event, deckId: 'A' | 'B'): void { (deckId === 'A' ? this.deckA : this.deckB).update(d => ({ ...d, gain: parseInt((event.target as HTMLInputElement).value, 10) })); }
  onEqChange(event: Event, deckId: 'A' | 'B', band: 'High' | 'Mid' | 'Low'): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    (deckId === 'A' ? this.deckA : this.deckB).update(d => ({ ...d, [`eq${band}`]: value }));
  }
  onDrumInputVolumeChange(event: Event, deckId: 'A' | 'B'): void {
    (deckId === 'A' ? this.deckA : this.deckB).update(d => ({ ...d, drumInputVolume: parseInt((event.target as HTMLInputElement).value, 10) }));
  }


  onCrossfadeChange(event: Event): void { this.crossfade.set(parseFloat((event.target as HTMLInputElement).value)); }
  onVolumeChange(event: Event): void { this.volume.set(parseFloat((event.target as HTMLInputElement).value)); }
  toggleLoop(deckId: 'A' | 'B'): void { (deckId === 'A' ? this.deckA : this.deckB).update(d => ({ ...d, loop: !d.loop })); }
  openFilePickerForDeck(deckId: 'A' | 'B' | null): void {
    this.loadingTargetDeck.set(deckId);
    this.fileInputRef()?.nativeElement.click();
  }

  handleFileInput(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      const objectURL = URL.createObjectURL(file);
      const newTrack: Track = {
        title: file.name.replace(/\.[^/.]+$/, ""), artist: 'Local File',
        albumArtUrl: `https://picsum.photos/seed/${Math.random()}/500/500`,
        audioSrc: file.type.startsWith('video') ? objectURL : objectURL,
        videoSrc: file.type.startsWith('video') ? objectURL : undefined,
      };
      if (this.mainViewMode() === 'player') {
          this.addTrackToPlaylist(newTrack, true);
      } else {
          const targetDeck = this.loadingTargetDeck();
          if (targetDeck) {
            this.loadTrackToDeck(newTrack, targetDeck);
            // If a track is loaded, unroute the drum machine from this deck
            this.unrouteDrumMachine(targetDeck);
            this.loadingTargetDeck.set(null);
          }
      }
      (event.target as HTMLInputElement).value = ''; // Reset input
    }
  }

  addTrackToPlaylist(track: Track, playImmediate = false): void {
      this.playlist.update(p => [...p, track]);
      if (playImmediate || this.currentTrackIndex() === -1) {
          this.currentTrackIndex.set(this.playlist().length - 1);
      }
      this.searchResults.set([]);
      this.searchQuery.set('');
  }

  removeTrackFromPlaylist(identifier: { index?: number; title?: string }): void {
    this.playlist.update(currentPlaylist => {
      let indexToRemove = -1;
      if (identifier.index !== undefined) {
        indexToRemove = identifier.index;
      } else if (identifier.title) {
        indexToRemove = currentPlaylist.findIndex(t => t.title.toLowerCase() === identifier.title!.toLowerCase());
      }

      if (indexToRemove >= 0 && indexToRemove < currentPlaylist.length) {
        const newPlaylist = currentPlaylist.filter((_, i) => i !== indexToRemove);
        // Adjust currentTrackIndex if the removed track was the current one or before it
        if (this.currentTrackIndex() === indexToRemove) {
          this.currentTrackIndex.set(-1); // Stop playback or reset
          this.deckA.set({...initialDeckState}); // Clear the player
        } else if (this.currentTrackIndex() > indexToRemove) {
          this.currentTrackIndex.update(idx => idx - 1);
        }
        return newPlaylist;
      }
      return currentPlaylist; // No change if track not found
    });
  }
  
  loadTrack(track: Track, deckId: 'A' | 'B', autoplay: boolean): void {
    const deck = deckId === 'A' ? this.deckA : this.deckB;
    this.ensureAudioContext();
    deck.set({ ...initialDeckState, track, isPlaying: autoplay, wasPlayingBeforeScratch: autoplay }); // Also set wasPlayingBeforeScratch
  }

  loadTrackToDeck(track: Track, deckId: 'A' | 'B'): void {
    this.loadTrack(track, deckId, true);
    this.searchResults.set([]);
    this.searchQuery.set('');
  }

  async performSearch(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.searchQuery().trim()) return;
    this.isSearching.set(true); this.searchResults.set([]);
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network
    const query = this.searchQuery();
    const mockResults: Track[] = [
      { title: `${query} - Mix 1`, artist: 'Online', albumArtUrl: `https://picsum.photos/seed/${query}1/500/500`, audioSrc: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', videoSrc: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4'},
      { title: `${query} - Wave 2`, artist: 'Synth', albumArtUrl: `https://picsum.photos/seed/${query}2/500/500`, audioSrc: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3'},
      { title: `${query} - Beat 3`, artist: 'Chill', albumArtUrl: `https://picsum.photos/seed/${query}3/500/500`, audioSrc: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3'}
    ];
    this.searchResults.set(mockResults); this.isSearching.set(false);
  }

  playTrackFromPlaylist(index: number): void {
    const playlist = this.playlist();
    if (index >= 0 && index < playlist.length) {
      this.currentTrackIndex.set(index);
      // Automatically play the track if it's the player mode
      if (this.mainViewMode() === 'player') {
        this.deckA.set({ ...initialDeckState, track: playlist[index], isPlaying: true, wasPlayingBeforeScratch: true });
      }
    } else {
      console.warn('Invalid playlist index provided.');
    }
  }
  playNext(): void { this.currentTrackIndex.update(idx => (idx + 1) % this.playlist().length); }
  playPrevious(): void { this.currentTrackIndex.update(idx => (idx - 1 + this.playlist().length) % this.playlist().length); }
  
  // Renamed from toggleViewMode
  toggleMainViewMode(): void {
    const modes: Array<'player' | 'dj' | 'drum' | 'image-editor' | 'video-editor'> = ['player', 'dj', 'drum', 'image-editor', 'video-editor']; // Cycle order
    this.mainViewMode.update(current => {
      const currentIndex = modes.indexOf(current);
      const nextIndex = (currentIndex + 1) % modes.length;
      const newMode = modes[nextIndex];

      if (newMode === 'player') {
        this.crossfade.set(-1); // Pan hard to Deck A
        this.deckB.set({ ...initialDeckState });
        this.unrouteDrumMachine('A');
        this.unrouteDrumMachine('B');
      } else if (newMode === 'dj') {
        this.crossfade.set(0); // Center crossfader for DJ mode
      }
      return newMode;
    });
  }

  // NEW: Toggle Chatbot visibility
  toggleChatbot(): void {
    this.showChatbot.update(v => !v);
  }

  formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds === 0) return '0:00';
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }

  toggleEqPanel(): void { this.showEqPanel.update(v => !v); }
  onMasterEqChange(newSettings: EqBand[]): void { this.eqSettings.set(newSettings); }
  onEnhancementsChange(newEnhancements: Enhancements): void { this.enhancements.set(newEnhancements); }
  onSearchQueryInput(event: Event): void { this.searchQuery.set((event.target as HTMLInputElement).value); }

  private updateVuMeters = (): void => {
    if (!this.audioContext || this.audioContext.state !== 'running') return;
    const calculatePeak = (analyser: AnalyserNode, dataArray: Uint8Array) => {
        analyser.getByteTimeDomainData(dataArray);
        return dataArray.reduce((max, current) => Math.max(max, Math.abs(current - 128)), 0) / 128;
    };
    if (this.analyserA && this.vuDataArrayA) this.vuLevelA.set(calculatePeak(this.analyserA, this.vuDataArrayA));
    if (this.analyserB && this.vuDataArrayB) this.vuLevelB.set(calculatePeak(this.analyserB, this.vuDataArrayB));
    if (this.analyserMaster && this.vuDataArrayMaster) this.vuLevelMaster.set(calculatePeak(this.analyserMaster, this.vuDataArrayMaster));
    // NEW: Microphone VU
    if (this.micAnalyser && this.vuDataArrayMic && this.micEnabled()) {
      this.micAnalyser.getByteFrequencyData(this.vuDataArrayMic); // Use frequency data for microphone VU
      let sum = 0;
      for (let i = 0; i < this.vuDataArrayMic.length; i++) {
          sum += this.vuDataArrayMic[i];
      }
      const average = sum / this.vuDataArrayMic.length;
      this.vuLevelMic.set(average / 255); // Normalize to 0-1
    } else if (!this.micEnabled()) {
      this.vuLevelMic.set(0);
    }

    this.animationFrameId = requestAnimationFrame(this.updateVuMeters);
  }
  private startVuLoop(): void { if (!this.animationFrameId) this.updateVuMeters(); }
  private stopVuLoop(): void { if (this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = undefined; } }

  toggleRecording(): void {
    if (this.isRecording()) {
      this.mediaRecorder?.stop();
      this.isRecording.set(false);
      if (this.recordingIntervalId) clearInterval(this.recordingIntervalId);
    } else {
      this.ensureAudioContext();
      if (!this.mediaStreamDestination) { console.error("Media stream destination not available."); return; }
      if (!this.mediaRecorder) {
        this.mediaRecorder = new MediaRecorder(this.mediaStreamDestination.stream);
        this.mediaRecorder.ondataavailable = event => this.recordedChunks.push(event.data);
        this.mediaRecorder.onstop = () => {
          const blob = new Blob(this.recordedChunks, { type: 'audio/webm;codecs=opus' });
          this.recordedBlob.set(blob);
          this.recordedMixUrl.set(URL.createObjectURL(blob));
          this.recordedChunks = [];
        };
      }
      this.recordedMixUrl.set(null); this.recordedBlob.set(null); this.recordingTime.set(0);
      this.mediaRecorder.start(); this.isRecording.set(true);
      this.recordingIntervalId = window.setInterval(() => this.recordingTime.update(t => t + 1), 1000);
    }
  }

  async shareMix(): Promise<void> {
    const blob = this.recordedBlob();
    if (blob && navigator.share && navigator.canShare) {
      const file = new File([blob], 'aura-mix.webm', { type: blob.type });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ title: 'My Aura DJ Mix', text: 'Check out this mix I made!', files: [file] });
        } catch (error) { console.error('Error sharing mix:', error); }
      }
    }
  }

  // --- Drum Machine Routing Logic ---
  handleDrumRoute(event: { stream: MediaStream, deckId: 'A' | 'B' | null }): void {
    this.ensureAudioContext();
    const { stream, deckId } = event;

    // Disconnect any existing drum stream from both decks first
    this.unrouteDrumMachine('A');
    this.unrouteDrumMachine('B');

    if (!deckId || !stream) { // Unrouting or no stream
      this.isDrumRoutedA.set(false);
      this.isDrumRoutedB.set(false);
      return;
    }

    if (deckId === 'A' && this.drumInputSourceA && this.drumInputGainA && this.eqLowNodeA) {
      // Disconnect existing if any and reconnect new stream
      this.drumInputSourceA.disconnect();
      this.drumInputGainA.disconnect();
      this.drumInputSourceA = this.audioContext!.createMediaStreamSource(stream);
      this.drumInputSourceA.connect(this.drumInputGainA);
      this.drumInputGainA.connect(this.eqLowNodeA); // Reconnect to deck A's EQ chain
      this.drumInputGainA.gain.value = this.deckA().drumInputVolume / 100; // Apply current volume
      this.isDrumRoutedA.set(true);
      this.deckA.update(d => ({ ...d, isPlaying: false })); // Pause track playback if routed
    } else if (deckId === 'B' && this.drumInputSourceB && this.drumInputGainB && this.eqLowNodeB) {
      // Disconnect existing if any and reconnect new stream
      this.drumInputSourceB.disconnect();
      this.drumInputGainB.disconnect();
      this.drumInputSourceB = this.audioContext!.createMediaStreamSource(stream);
      this.drumInputSourceB.connect(this.drumInputGainB);
      this.drumInputGainB.connect(this.eqLowNodeB); // Reconnect to deck B's EQ chain
      this.drumInputGainB.gain.value = this.deckB().drumInputVolume / 100; // Apply current volume
      this.isDrumRoutedB.set(true);
      this.deckB.update(d => ({ ...d, isPlaying: false })); // Pause track playback if routed
    }
  }

  unrouteDrumMachine(deckId: 'A' | 'B'): void {
    if (deckId === 'A') {
      if (this.drumInputSourceA && this.drumInputGainA && this.eqLowNodeA && this.dummyDrumStream) {
        this.drumInputSourceA.disconnect();
        this.drumInputGainA.disconnect();
        // Recreate with dummy stream to prevent errors if connect is called again
        this.drumInputSourceA = this.audioContext!.createMediaStreamSource(this.dummyDrumStream);
        this.drumInputSourceA.connect(this.drumInputGainA);
        this.drumInputGainA.connect(this.eqLowNodeA);
        this.drumInputGainA.gain.value = 0; // Mute
      }
      this.isDrumRoutedA.set(false);
      this.deckA.update(d => ({...d, drumInputVolume: 0})); // Reset volume in UI
    } else if (deckId === 'B') {
      if (this.drumInputSourceB && this.drumInputGainB && this.eqLowNodeB && this.dummyDrumStream) {
        this.drumInputSourceB.disconnect();
        this.drumInputGainB.disconnect();
        this.drumInputSourceB = this.audioContext!.createMediaStreamSource(this.dummyDrumStream);
        this.drumInputSourceB.connect(this.drumInputGainB);
        this.drumInputGainB.connect(this.eqLowNodeB);
        this.drumInputGainB.gain.value = 0; // Mute
      }
      this.isDrumRoutedB.set(false);
      this.deckB.update(d => ({...d, drumInputVolume: 0})); // Reset volume in UI
    }
  }


  // --- Scratching Logic ---
  onScratchStart(event: MouseEvent | TouchEvent, deckId: 'A' | 'B'): void {
    event.preventDefault();
    this.ensureAudioContext();
    const isDeckA = deckId === 'A';
    const scratchState = isDeckA ? this.scratchStateA : this.scratchStateB;
    const deckSignal = isDeckA ? this.deckA : this.deckB;
    const audioPlayer = isDeckA ? this.audioPlayerARef()?.nativeElement : this.audioPlayerBRef()?.nativeElement;
    
    if (deckSignal().duration === 0) return;
    if (isDeckA ? this.isDrumRoutedA() : this.isDrumRoutedB()) return; // Cannot scratch routed drum stream

    scratchState.active = true;
    scratchState.platterElement = event.currentTarget as HTMLElement;
    
    const clientX = (event as MouseEvent).clientX ?? (event as TouchEvent).touches[0].clientX;
    const clientY = (event as MouseEvent).clientY ?? (event as TouchEvent).touches[0].clientY;

    const rect = scratchState.platterElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    scratchState.lastAngle = Math.atan2(clientY - centerY, clientX - centerX);
    scratchState.initialTouchX = clientX; // Store for smoother initial scratch
    scratchState.initialTouchY = clientY; // Store for smoother initial scratch

    deckSignal.update(d => ({ ...d, isPlaying: false, wasPlayingBeforeScratch: d.isPlaying })); // Pause, store current playing state
    if (isDeckA) { this.isScratchingA.set(true); } else { this.isScratchingB.set(true); }
    if (audioPlayer) audioPlayer.pause();
  }

  onScratch(event: MouseEvent | TouchEvent): void {
    if (!this.scratchStateA.active && !this.scratchStateB.active) return;
    
    this.ensureAudioContext();

    const clientX = (event as MouseEvent).clientX ?? (event as TouchEvent).touches[0].clientX;
    const clientY = (event as MouseEvent).clientY ?? (event as TouchEvent).touches[0].clientY;

    const processDeck = (deckId: 'A' | 'B', scratchState: ScratchState, deckSignal: typeof this.deckA, playerRef: typeof this.audioPlayerARef, isScratchingSignal: typeof this.isScratchingA, scratchRotationSignal: typeof this.scratchRotationA) => {
      if (!scratchState.active || !scratchState.platterElement || !isScratchingSignal()) return;

      const audioPlayer = playerRef()?.nativeElement;
      if (!audioPlayer || deckSignal().duration === 0) return;

      const rect = scratchState.platterElement.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const currentAngle = Math.atan2(clientY - centerY, clientX - centerX);
      let deltaAngle = currentAngle - scratchState.lastAngle;

      // Handle angle wrap-around
      if (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
      if (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;

      // Adjust playback position based on scratch
      const audioTimeChange = deltaAngle * this.SCRATCH_SENSITIVITY / (2 * Math.PI); // Convert angle to seconds
      audioPlayer.currentTime = Math.max(0, Math.min(audioPlayer.duration, audioPlayer.currentTime + audioTimeChange));

      // Update platter rotation for visual feedback
      // This is a simplified rotation based on relative movement
      let currentRotation = parseFloat(scratchRotationSignal().replace('rotate(', '').replace('deg)', '') || '0');
      currentRotation += (deltaAngle * 180 / Math.PI); // Convert radians to degrees
      scratchRotationSignal.set(`rotate(${currentRotation}deg)`);

      scratchState.lastAngle = currentAngle;
    };

    processDeck('A', this.scratchStateA, this.deckA, this.audioPlayerARef, this.isScratchingA, this.scratchRotationA);
    processDeck('B', this.scratchStateB, this.deckB, this.audioPlayerBRef, this.isScratchingB, this.scratchRotationB);
  }

  onScratchEnd(): void {
    const restoreDeck = (deckId: 'A' | 'B', scratchState: ScratchState, deckSignal: typeof this.deckA, playerRef: typeof this.audioPlayerARef, videoPlayerRef: typeof this.videoPlayerARef, isScratchingSignal: typeof this.isScratchingA) => {
      if (scratchState.active) {
        scratchState.active = false;
        if (isScratchingSignal()) {
          isScratchingSignal.set(false);
          const audioPlayer = playerRef()?.nativeElement;
          const videoPlayer = videoPlayerRef()?.nativeElement;
          if (audioPlayer && deckSignal().wasPlayingBeforeScratch) {
            audioPlayer.play().catch(console.error);
            if (videoPlayer) videoPlayer.play().catch(console.error);
          }
          deckSignal.update(d => ({...d, isPlaying: deckSignal().wasPlayingBeforeScratch})); // Restore play state
        }
      }
    };

    restoreDeck('A', this.scratchStateA, this.deckA, this.audioPlayerARef, this.videoPlayerARef, this.isScratchingA);
    restoreDeck('B', this.scratchStateB, this.deckB, this.audioPlayerBRef, this.videoPlayerBRef, this.isScratchingB);
  }

  // NEW: Microphone Controls
  async toggleMicrophone(): Promise<void> {
    this.ensureAudioContext();
    if (!this.audioContext) {
      this.micEnabled.set(false);
      // FIX: Use the newly added `appError` signal instead of `this.error`
      this.appError.set("AudioContext not initialized.");
      return;
    }

    if (this.micEnabled()) {
      // Disable microphone
      this.micStream?.getTracks().forEach(track => track.stop());
      this.micStream = undefined;
      this.micSourceNode?.disconnect();
      this.micSourceNode = undefined;
      this.micGainNode?.disconnect(); // Disconnect chain from master bus
      this.micEqLowNode?.disconnect();
      this.micEqMidNode?.disconnect();
      this.micEqHighNode?.disconnect();
      this.micFilterNode?.disconnect();
      this.micAnalyser?.disconnect();

      this.micEnabled.set(false);
      this.vuLevelMic.set(0); // Reset VU meter
      console.log('Microphone disabled.');
    } else {
      // Enable microphone
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.micStream = stream;
        this.micSourceNode = this.audioContext.createMediaStreamSource(stream);

        // Connect mic chain
        this.micSourceNode.connect(this.micGainNode!);
        this.micGainNode!.connect(this.micEqLowNode!);
        this.micEqLowNode!.connect(this.micEqMidNode!);
        this.micEqMidNode!.connect(this.micEqHighNode!);
        this.micEqHighNode!.connect(this.micFilterNode!);
        this.micFilterNode!.connect(this.micAnalyser!); // Connect to analyser for VU
        this.micAnalyser!.connect(this.masterBus!); // Connect to master output

        this.micEnabled.set(true);
        console.log('Microphone enabled.');
      } catch (err) {
        console.error('Error enabling microphone:', err);
        this.micEnabled.set(false);
        this.appError.set('Could not enable microphone. Please ensure microphone permissions are granted.'); // Use appError
      }
    }
  }

  onMicVolumeChange(event: Event): void {
    this.micVolume.set(parseInt((event.target as HTMLInputElement).value, 10));
  }

  onMicEqChange(event: Event, band: 'High' | 'Mid' | 'Low'): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (band === 'High') { this.micEqHigh.set(value); }
    else if (band === 'Mid') { this.micEqMid.set(value); }
    else if (band === 'Low') { this.micEqLow.set(value); }
  }

  onMicFilterChange(event: Event): void {
    const value = parseFloat((event.target as HTMLInputElement).value); // 0 to 1
    const minFreq = 20;
    const maxFreq = 20000;
    const freq = minFreq * Math.pow((maxFreq / minFreq), value); // Logarithmic scale for frequency
    this.micFilterFreq.set(freq);
  }

  // Helper to get normalized filter value for slider display
  getNormalizedFilterValue(freq: number): number {
    const minFreq = 20;
    const maxFreq = 20000;
    // Handle edge cases to prevent Math.log(0) or division by zero, though unlikely with minFreq=20
    if (freq <= minFreq) return 0;
    if (freq >= maxFreq) return 1;
    return (Math.log(freq) - Math.log(minFreq)) / (Math.log(maxFreq) - Math.log(minFreq));
  }

  // NEW: Handle commands from chatbot
  handleChatbotCommand(command: { action: string; parameters: any }): void {
    console.log("Received command from chatbot:", command);
    const { action, parameters } = command;

    switch (action) {
      case 'addTrackToPlaylist':
        const newTrack: Track = {
          title: parameters.title || 'Unknown Title',
          artist: parameters.artist || 'Unknown Artist',
          albumArtUrl: parameters.albumArtUrl || 'https://picsum.photos/seed/ai-generated/500/500',
          audioSrc: parameters.audioSrc || 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3', // Default generic audio
        };
        this.addTrackToPlaylist(newTrack, true);
        break;
      case 'playTrackInPlayer':
        if (parameters.title) {
          const index = this.playlist().findIndex(t => t.title.toLowerCase() === parameters.title.toLowerCase());
          if (index !== -1) this.playTrackFromPlaylist(index); else alert(`Track "${parameters.title}" not found.`);
        } else if (parameters.index !== undefined) {
          this.playTrackFromPlaylist(parameters.index);
        } else {
          alert('Specify track by title or index to play.');
        }
        break;
      case 'removeTrackFromPlaylist':
        this.removeTrackFromPlaylist(parameters);
        break;
      case 'changeTheme':
        const themeName = parameters.name;
        const targetTheme = this.THEMES.find(t => t.name.toLowerCase() === themeName.toLowerCase());
        if (targetTheme) {
          this.currentTheme.set(targetTheme);
          alert(`Theme changed to ${targetTheme.name}!`);
        } else {
          alert(`Theme "${themeName}" not found. Available themes: ${this.THEMES.map(t => t.name).join(', ')}`);
        }
        break;
      case 'randomizeTheme':
        this.randomizeTheme();
        alert('Theme randomized!');
        break;
      case 'generateImage':
        this.imageEditorInitialPrompt.set(parameters.prompt || '');
        this.mainViewMode.set('image-editor');
        alert('Switched to Image Editor. Prompt pre-filled, click GENERATE to create your image.');
        break;
      case 'generateVideo':
        this.videoEditorInitialPrompt.set(parameters.prompt || '');
        // Determine if image should be used for video generation based on 'fromImage' parameter
        // The VideoEditorComponent's internal logic will handle the imageForVideoGeneration input.
        this.mainViewMode.set('video-editor');
        alert('Switched to Video Editor. Prompt pre-filled, click GENERATE to create your video.');
        break;
      default:
        console.warn(`Unknown command: ${action}`);
        alert(`S.M.U.V.E tried to execute an unknown command: ${action}`);
    }
  }

  // NEW: Randomize theme
  randomizeTheme(): void {
    let newTheme: AppTheme;
    do {
      const randomIndex = Math.floor(Math.random() * this.THEMES.length);
      newTheme = this.THEMES[randomIndex];
    } while (newTheme === this.currentTheme()); // Ensure a different theme is selected
    this.currentTheme.set(newTheme);
  }

  // NEW: Handle image selected from image editor
  handleImageSelectedForAlbumArt(imageUrl: string): void {
    this.lastImageEditorImageUrl.set(imageUrl);
    this.showApplyAlbumArtModal.set(true); // Show modal for selection
    this.mainViewMode.set('player'); // Switch back to player mode for context
  }

  // NEW: Apply the selected image as album art to the chosen target
  applyImageAsAlbumArt(target: 'player' | 'A' | 'B'): void {
    const imageUrl = this.lastImageEditorImageUrl();
    if (!imageUrl) {
      alert('No image available to apply!');
      this.showApplyAlbumArtModal.set(false);
      return;
    }

    if (target === 'player') {
      if (this.currentPlayerTrack()) {
        const currentTrackIndex = this.currentTrackIndex();
        this.playlist.update(currentPlaylist => {
          const updatedPlaylist = [...currentPlaylist];
          updatedPlaylist[currentTrackIndex] = { ...updatedPlaylist[currentTrackIndex], albumArtUrl: imageUrl };
          return updatedPlaylist;
        });
        // Also update deckA if it's currently showing this track
        this.deckA.update(deck => {
          if (deck.track === this.currentPlayerTrack()) { // Check for reference equality
            return { ...deck, track: { ...deck.track, albumArtUrl: imageUrl } };
          }
          return deck;
        });
        alert('Album art applied to current player track!');
      } else {
        alert('No track currently playing in player mode.');
      }
    } else if (target === 'A') {
      this.deckA.update(deck => ({ ...deck, track: { ...deck.track, albumArtUrl: imageUrl } }));
      alert('Album art applied to Deck A!');
    } else if (target === 'B') {
      this.deckB.update(deck => ({ ...deck, track: { ...deck.track, albumArtUrl: imageUrl } }));
      alert('Album art applied to Deck B!');
    }
    this.showApplyAlbumArtModal.set(false);
    this.lastImageEditorImageUrl.set(null); // Clear after use
  }

  // Helper to get master analyser for visualizer
  getMasterAnalyser(): AnalyserNode | undefined {
    return this.analyserMaster;
  }
}