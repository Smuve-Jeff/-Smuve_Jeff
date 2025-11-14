
import { Component, ChangeDetectionStrategy, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EqBand, Enhancements } from '../../app.component';

@Component({
  selector: 'app-eq-panel',
  templateUrl: './eq-panel.component.html',
  styleUrls: ['./eq-panel.component.css'],
  // Removed standalone: true as it's default in Angular v20+
  imports: [CommonModule],
})
export class EqPanelComponent {
  eqSettings = input.required<EqBand[]>();
  enhancements = input.required<Enhancements>();

  close = output<void>();
  eqChange = output<EqBand[]>();
  enhancementsChange = output<Enhancements>();

  onEqBandChange(index: number, event: Event): void {
    const newValue = parseInt((event.target as HTMLInputElement).value, 10);
    const newSettings = this.eqSettings().map((band, i) => 
      i === index ? { ...band, value: newValue } : band
    );
    this.eqChange.emit(newSettings);
  }

  onEnhancementToggle(key: keyof Enhancements, event: Event): void {
    const isChecked = (event.target as HTMLInputElement).checked;
    const newEnhancements = { ...this.enhancements(), [key]: isChecked };
    this.enhancementsChange.emit(newEnhancements);
  }

  onClose(): void {
    this.close.emit();
  }
}
