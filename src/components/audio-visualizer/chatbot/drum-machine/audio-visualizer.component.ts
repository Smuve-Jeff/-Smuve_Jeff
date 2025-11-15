import { Component, ChangeDetectionStrategy, input, ElementRef, viewChild, AfterViewInit, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppTheme } from '../../app.component';

@Component({
  selector: 'app-audio-visualizer',
  templateUrl: './audio-visualizer.component.html',
  styleUrls: ['./audio-visualizer.component.css'],
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AudioVisualizerComponent implements AfterViewInit, OnDestroy {
  analyserNode = input<AnalyserNode | undefined>(undefined);
  canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('visualizerCanvas');
  theme = input.required<AppTheme>(); // NEW: Input for current theme

  private ctx!: CanvasRenderingContext2D;
  private dataArray!: Uint8Array;
  private animationFrameId?: number;

  constructor() {
    effect(() => {
      // Re-initialize visualizer when analyserNode changes or becomes available, or theme changes
      const analyser = this.analyserNode();
      const currentTheme = this.theme(); // Trigger effect on theme change to potentially redraw with new colors
      if (analyser) {
        analyser.fftSize = 256;
        this.dataArray = new Uint8Array(analyser.frequencyBinCount);
        this.startVisualizer();
      } else {
        this.stopVisualizer();
      }
    });
  }

  // FIX: Implement ngAfterViewInit lifecycle hook
  ngAfterViewInit(): void {
    const canvas = this.canvasRef().nativeElement;
    const context = canvas.getContext('2d');
    if (context) {
      this.ctx = context;
      // Set initial canvas dimensions
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      // The effect will call startVisualizer if analyserNode is already defined.
    } else {
      console.error("Failed to get 2D rendering context for visualizer canvas.");
    }
  }

  // FIX: Implement ngOnDestroy lifecycle hook
  ngOnDestroy(): void {
    this.stopVisualizer();
  }

  /**
   * Starts the audio visualizer animation loop.
   * Ensures any previous animation is stopped before starting a new one.
   */
  private startVisualizer(): void {
    this.stopVisualizer(); // Clear any existing animation frame
    if (!this.ctx || !this.analyserNode() || !this.dataArray) {
      // Cannot start visualizer without context, analyser, or data array
      return;
    }

    // Ensure canvas dimensions are up-to-date
    const canvas = this.canvasRef().nativeElement;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    this.draw();
  }

  /**
   * Stops the audio visualizer animation loop and clears the canvas.
   */
  private stopVisualizer(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }
    if (this.ctx) {
      const canvas = this.canvasRef().nativeElement;
      this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  /**
   * The main drawing loop for the audio visualizer.
   * Renders frequency data as bars on the canvas.
   */
  private draw = (): void => {
    const analyser = this.analyserNode();
    const canvas = this.canvasRef().nativeElement;
    const ctx = this.ctx;

    // Guard against missing dependencies (e.g., if analyserNode becomes undefined)
    if (!analyser || !ctx || !this.dataArray) {
      this.stopVisualizer();
      return;
    }

    analyser.getByteFrequencyData(this.dataArray);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const barCount = this.dataArray.length;
    const barWidth = (canvas.width / barCount) * 0.9; // Adjust for spacing
    let x = 0;

    for (let i = 0; i < barCount; i++) {
      // Scale bar height to canvas height, normalized to 0-1
      const barHeight = (this.dataArray[i] / 255) * canvas.height;

      // Dynamic color based on frequency index (hue)
      const hue = i * (360 / barCount);
      // Use the theme's primary color as a base for saturation and lightness
      // This is a simple interpretation as direct Tailwind class to HSL conversion is not native.
      // For more specific theming, `AppTheme` would need to provide actual HSL/HEX values.
      // For now, let's just make it vibrant.
      ctx.fillStyle = `hsl(${hue}, 80%, 60%)`; // Vibrant, dynamic color

      // Draw the bar
      ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

      // Move to the next bar position
      x += barWidth + (canvas.width / barCount) * 0.1; // Add small gap
    }

    this.animationFrameId = requestAnimationFrame(this.draw);
  };
}