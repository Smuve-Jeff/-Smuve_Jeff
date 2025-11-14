
import { Component, ChangeDetectionStrategy, signal, ElementRef, viewChild, OnDestroy, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GoogleGenAI } from '@google/genai'; // Changed to direct named import

const getApiKey = (): string => {
  const rawApiKey = process.env.API_KEY;
  if (rawApiKey === undefined || rawApiKey === null || String(rawApiKey).trim() === '' || String(rawApiKey) === 'undefined') {
    return ''; // Return an empty string for any problematic values, including the string literal "undefined"
  }
  return rawApiKey;
};

@Component({
  selector: 'app-video-editor',
  templateUrl: './video-editor.component.html',
  styleUrls: ['./video-editor.component.css'],
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoEditorComponent implements OnDestroy {
  // FIX: Changed @input() decorator to input() function for class fields
  imageForVideoGeneration = input<string | null>(null);

  // State for recording
  mediaStream = signal<MediaStream | null>(null);
  isRecording = signal(false);
  recordedVideoBlob = signal<Blob | null>(null);
  recordedVideoUrl = signal<string | null>(null);
  recordingTime = signal(0);
  cameraEnabled = signal(false); // Indicates if camera stream is active in the preview
  isCameraActive = signal(false); // Indicates if camera is actually enabled/streaming

  // State for AI video generation
  videoPrompt = signal('');
  generatedVideoUrl = signal<string | null>(null);
  isGeneratingVideo = signal(false);
  generationProgressMessage = signal<string | null>(null);

  // General UI state
  error = signal<string | null>(null);

  // View children
  liveVideoPreviewRef = viewChild<ElementRef<HTMLVideoElement>>('liveVideoPreview');
  recordedVideoPlayerRef = viewChild<ElementRef<HTMLVideoElement>>('recordedVideoPlayer');

  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingIntervalId?: number;
  private genAI: GoogleGenAI; // Use direct GoogleGenAI

  constructor() {
    const apiKey = getApiKey();
    this.genAI = new GoogleGenAI({ apiKey }); // Use direct GoogleGenAI and ensure API key is a string
  }

  ngOnDestroy(): void {
    this.stopAllMedia();
  }

  // --- Media Stream and Recording ---

  async requestMediaPermissions(): Promise<void> {
    this.error.set(null);
    if (this.mediaStream()) {
      this.stopMediaStream();
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      this.mediaStream.set(stream);
      this.cameraEnabled.set(true);
      this.isCameraActive.set(true);
      if (this.liveVideoPreviewRef()) {
        this.liveVideoPreviewRef()!.nativeElement.srcObject = stream;
        await this.liveVideoPreviewRef()!.nativeElement.play();
      }
      console.log('Camera and microphone access granted.');
    } catch (err: any) {
      console.error('Error accessing media devices:', err);
      this.error.set(`Failed to access camera/microphone: ${err.name || err.message}. Please check permissions.`);
      this.cameraEnabled.set(false);
      this.isCameraActive.set(false);
    }
  }

  stopMediaStream(): void {
    this.mediaStream()?.getTracks().forEach(track => track.stop());
    this.mediaStream.set(null);
    this.isCameraActive.set(false);
    if (this.liveVideoPreviewRef()) {
      this.liveVideoPreviewRef()!.nativeElement.srcObject = null;
    }
    console.log('Media stream stopped.');
  }

  toggleCamera(): void {
    if (this.isCameraActive()) {
      this.stopMediaStream();
      this.cameraEnabled.set(false);
    } else {
      this.requestMediaPermissions();
    }
  }

  startRecording(): void {
    if (!this.mediaStream() || !this.isCameraActive()) {
      this.error.set('Camera is not active. Please enable camera first.');
      return;
    }
    if (this.isRecording()) return;

    this.recordedChunks = [];
    this.recordedVideoBlob.set(null);
    this.recordedVideoUrl.set(null);
    this.recordingTime.set(0);
    this.error.set(null);

    try {
      this.mediaRecorder = new MediaRecorder(this.mediaStream()!, { mimeType: 'video/webm; codecs=vp8,opus' }); // Using webm for broad compatibility

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        this.recordedVideoBlob.set(blob);
        this.recordedVideoUrl.set(URL.createObjectURL(blob));
        console.log('Recording stopped. Blob created.');
        if (this.recordingIntervalId) clearInterval(this.recordingIntervalId);
        this.recordingIntervalId = undefined;
      };

      this.mediaRecorder.onerror = (event: any) => {
        console.error('MediaRecorder error:', event.error);
        this.error.set(`Recording error: ${event.error.name || event.error.message}`);
        this.isRecording.set(false);
        if (this.recordingIntervalId) clearInterval(this.recordingIntervalId);
        this.recordingIntervalId = undefined;
      };

      this.mediaRecorder.start();
      this.isRecording.set(true);
      this.recordingIntervalId = window.setInterval(() => this.recordingTime.update(t => t + 1), 1000);
      console.log('Recording started.');
    } catch (e: any) {
      console.error('Error starting MediaRecorder:', e);
      this.error.set(`Failed to start recording: ${e.message}`);
      this.isRecording.set(false);
    }
  }

  stopRecording(): void {
    if (this.mediaRecorder && this.isRecording()) {
      this.mediaRecorder.stop();
      this.isRecording.set(false);
      console.log('Attempting to stop recording...');
    }
  }

  playRecordedVideo(): void {
    if (this.recordedVideoUrl() && this.recordedVideoPlayerRef()) {
      this.recordedVideoPlayerRef()!.nativeElement.load();
      this.recordedVideoPlayerRef()!.nativeElement.play().catch(e => console.error('Error playing recorded video:', e));
    }
  }

  // --- AI Video Generation ---

  async generateVideo(fromImage: boolean): Promise<void> {
    const prompt = this.videoPrompt().trim();
    if (!prompt) {
      this.error.set('Please enter a prompt for video generation.');
      return;
    }
    if (fromImage && !this.imageForVideoGeneration()) { // FIX: Access input signal with ()
      this.error.set('No image provided for image + prompt generation.');
      return;
    }

    this.isGeneratingVideo.set(true);
    this.generatedVideoUrl.set(null);
    this.error.set(null);
    this.generationProgressMessage.set('Starting video generation...');
    let operation: any;

    try {
      const generateParams: any = {
        model: 'veo-2.0-generate-001',
        prompt: prompt,
        config: {
          numberOfVideos: 1,
        },
      };

      if (fromImage && this.imageForVideoGeneration()) { // FIX: Access input signal with ()
        const imageUrl = this.imageForVideoGeneration(); // FIX: Get image URL from signal
        const base64Data = imageUrl!.split(',')[1];
        const mimeType = imageUrl!.split(';')[0].split(':')[1];
        generateParams.image = {
          imageBytes: base64Data,
          mimeType: mimeType,
        };
        this.generationProgressMessage.set('Generating video from image and prompt...');
      } else {
        this.generationProgressMessage.set('Generating video from text prompt...');
      }

      operation = await this.genAI.models.generateVideos(generateParams);
      console.log('Initial video generation operation started:', operation);

      while (!operation.done) {
        this.generationProgressMessage.set('Video generation in progress... this may take a few minutes.');
        await new Promise(resolve => setTimeout(resolve, 10000)); // Poll every 10 seconds
        operation = await this.genAI.operations.getVideosOperation({ operation: operation });
        console.log('Polling video generation operation:', operation);
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        this.generationProgressMessage.set('Video generated! Fetching video data...');
        // Append API key when fetching from the download link
        const videoResponse = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        if (!videoResponse.ok) {
          throw new Error(`Failed to fetch generated video: ${videoResponse.statusText}`);
        }
        const videoBlob = await videoResponse.blob();
        this.generatedVideoUrl.set(URL.createObjectURL(videoBlob));
        this.generationProgressMessage.set('Video is ready!');
        console.log('Generated video URL:', this.generatedVideoUrl());
      } else {
        this.error.set('Failed to retrieve generated video URL from the response.');
        this.generationProgressMessage.set('Video generation failed.');
      }

    } catch (err: any) {
      console.error('Error during video generation:', err);
      this.error.set(`Video generation failed: ${err.message || 'Unknown error'}. Please try again.`);
      this.generationProgressMessage.set('Video generation failed.');
    } finally {
      this.isGeneratingVideo.set(false);
    }
  }

  // --- Utility Functions ---

  clearAll(): void {
    this.stopAllMedia();
    this.isRecording.set(false);
    if (this.recordingIntervalId) clearInterval(this.recordingIntervalId);
    this.recordingTime.set(0);
    this.recordedVideoBlob.set(null);
    if (this.recordedVideoUrl()) URL.revokeObjectURL(this.recordedVideoUrl()!);
    this.recordedVideoUrl.set(null);

    this.videoPrompt.set('');
    if (this.generatedVideoUrl()) URL.revokeObjectURL(this.generatedVideoUrl()!);
    this.generatedVideoUrl.set(null);
    this.isGeneratingVideo.set(false);
    this.generationProgressMessage.set(null);
    this.error.set(null);
  }

  private stopAllMedia(): void {
    this.stopMediaStream();
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }
}
