import { Component, ChangeDetectionStrategy, input, ElementRef, viewChild, AfterViewInit, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';

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

  private ctx!: CanvasRenderingContext2D;
  private dataArray!: Uint8Array;
  private animationFrameId?: number;

  constructor() {
    effect(() => {
      // Re-initialize visualizer when analyserNode changes or becomes available
      const analyser = this.analyserNode();
      if (analyser) {
        analyser.fftSize = 256; // Smaller FFT size for more responsive bars
        this.dataArray = new Uint8Array(analyser.frequencyBinCount);
        this.startVisualization();
      } else {
        this.stopVisualization();
      }
    });
  }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef().nativeElement;
    const context = canvas.getContext('2d');
    if (!context) {
      console.error("Could not get 2D context for visualizer canvas.");
      return;
    }
    this.ctx = context;
    // Set initial canvas dimensions
    this.resizeCanvas();
    window.addEventListener('resize', this.resizeCanvas.bind(this));
  }

  ngOnDestroy(): void {
    this.stopVisualization();
    window.removeEventListener('resize', this.resizeCanvas.bind(this));
  }

  private resizeCanvas(): void {
    const canvas = this.canvasRef().nativeElement;
    // Set canvas dimensions to its actual rendered size in CSS
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  private startVisualization(): void {
    this.stopVisualization(); // Ensure no multiple loops are running
    this.draw();
  }

  private stopVisualization(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }
    // Optionally clear canvas when stopped
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    }
  }

  private draw = (): void => {
    const analyser = this.analyserNode();
    if (!analyser || !this.ctx || !this.dataArray) {
      this.animationFrameId = requestAnimationFrame(this.draw); // Keep trying to draw
      return;
    }

    analyser.getByteFrequencyData(this.dataArray);

    const canvas = this.ctx.canvas;
    const width = canvas.width;
    const height = canvas.height;
    const barWidth = (width / this.dataArray.length) * 2.5; // Adjust spacing
    let x = 0;

    this.ctx.clearRect(0, 0, width, height); // Clear the entire canvas

    for (let i = 0; i < this.dataArray.length; i++) {
      const barHeight = this.dataArray[i] / 255 * height; // Normalize and scale to canvas height

      // Gradient color for bars (green to yellow to red)
      const r = barHeight + (25 * (i/this.dataArray.length)); // Base red
      const g = 250 - barHeight - (25 * (i/this.dataArray.length)); // Base green
      const b = 50; // Base blue
      
      this.ctx.fillStyle = `rgb(${Math.min(255, r)},${Math.min(255, g)},${Math.min(255, b)})`;
      this.ctx.fillRect(x, height - barHeight, barWidth, barHeight);

      x += barWidth + 2; // Add a small gap between bars
    }

    this.animationFrameId = requestAnimationFrame(this.draw);
  }
}