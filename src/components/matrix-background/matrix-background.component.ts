
import { Component, ChangeDetectionStrategy, ElementRef, viewChild, AfterViewInit, OnDestroy } from '@angular/core';

@Component({
  selector: 'app-matrix-background',
  template: `
    <canvas #matrixCanvas class="absolute top-0 left-0 w-full h-full"></canvas>
  `,
  styles: [`
    :host {
      display: block;
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
    }
  `],
  // Removed standalone: true as it's default in Angular v20+
})
export class MatrixBackgroundComponent implements AfterViewInit, OnDestroy {
  canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('matrixCanvas');
  
  private ctx!: CanvasRenderingContext2D;
  private intervalId?: number;

  ngAfterViewInit(): void {
    const canvas = this.canvasRef().nativeElement;
    const context = canvas.getContext('2d');
    
    if (!context) {
        console.error("Could not get 2D context");
        return;
    }
    this.ctx = context;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const alphabet = 'SmuveJeffPresents';

    const fontSize = 16;
    const columns = canvas.width / fontSize;
    const rainDrops: number[] = [];

    for (let x = 0; x < columns; x++) {
      rainDrops[x] = 1;
    }

    const draw = () => {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      this.ctx.fillRect(0, 0, canvas.width, canvas.height);
      this.ctx.fillStyle = '#0F0'; // Green text
      this.ctx.font = fontSize + 'px monospace';

      for (let i = 0; i < rainDrops.length; i++) {
        const text = alphabet.charAt(Math.floor(Math.random() * alphabet.length));
        this.ctx.fillText(text, i * fontSize, rainDrops[i] * fontSize);

        if (rainDrops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          rainDrops[i] = 0;
        }
        rainDrops[i]++;
      }
    };
    
    this.intervalId = window.setInterval(draw, 100);
  }

  ngOnDestroy(): void {
      if (this.intervalId) {
          clearInterval(this.intervalId);
      }
  }
}
