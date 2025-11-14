



import { Component, ChangeDetectionStrategy, input, output, signal, inject, ElementRef, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
// FIX: The import itself is correct, but the imported members were missing from the source file. This is now fixed in samples.ts.
import { Pad, SampleCategory, SAMPLE_LIBRARY, SAMPLES } from '../drum-machine/samples';

@Component({
  selector: 'app-sample-library',
  templateUrl: './sample-library.component.html',
  styleUrls: ['./sample-library.component.css'],
  // Removed standalone: true as it's default in Angular v20+
  imports: [CommonModule],
})
export class SampleLibraryComponent {
  pads = input.required<Pad[]>();
  selectedPadIndex = input.required<number | null>();

  close = output<void>();
  sampleAssigned = output<{ sampleKey: string; base64Data?: string }>();

  sampleCategories: SampleCategory[] = SAMPLE_LIBRARY;
  selectedCategory = signal<string | null>(null);
  filteredSamples = signal<{ key: string; name: string }[]>([]);
  customSampleInput = viewChild<ElementRef<HTMLInputElement>>('customSampleInput');
  
  private audioContext: AudioContext | null = null;
  private currentAudioSource: AudioBufferSourceNode | null = null;
  private uniqueIdCounter = 0;

  constructor() {
    this.selectedCategory.set(this.sampleCategories[0]?.category || null);
    this.updateFilteredSamples();
  }

  onCategoryChange(category: string): void {
    this.selectedCategory.set(category);
    this.updateFilteredSamples();
  }

  updateFilteredSamples(): void {
    const category = this.selectedCategory();
    const samples = this.sampleCategories.find(cat => cat.category === category)?.samples || [];
    this.filteredSamples.set(samples);
  }

  assignSample(sampleKey: string, base64Data?: string): void {
    this.sampleAssigned.emit({ sampleKey, base64Data });
  }

  async previewSample(sampleKey: string, dataUrl?: string): Promise<void> {
    this.ensureAudioContext();
    if (!this.audioContext) return;

    if (this.currentAudioSource) {
      this.currentAudioSource.stop();
      this.currentAudioSource.disconnect();
      this.currentAudioSource = null;
    }

    const audioData = dataUrl || SAMPLES[sampleKey];
    if (!audioData) {
      console.warn(`No audio data found for sample key: ${sampleKey}`);
      return;
    }

    try {
      const response = await fetch(audioData);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      this.currentAudioSource = this.audioContext.createBufferSource();
      this.currentAudioSource.buffer = audioBuffer;
      this.currentAudioSource.connect(this.audioContext.destination);
      this.currentAudioSource.start(0);
      this.currentAudioSource.onended = () => {
        if (this.currentAudioSource) {
          this.currentAudioSource.disconnect();
          this.currentAudioSource = null;
        }
      };
    } catch (error) {
      console.error('Error previewing sample:', error);
    }
  }

  async handleCustomSampleUpload(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      alert('Please upload an audio file (e.g., .wav, .mp3).');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const base64Data = e.target?.result as string;
        const customSampleKey = `custom-${file.name}-${this.uniqueIdCounter++}`;
        
        // Add to SAMPLES temporarily for preview/assignment within this session
        // This is not persistent, but allows dynamic loading.
        (SAMPLES as any)[customSampleKey] = base64Data; 

        // Add to a temporary category or a "Custom" category for selection
        let customCategory = this.sampleCategories.find(cat => cat.category === 'Custom');
        if (!customCategory) {
          customCategory = { category: 'Custom', samples: [] };
          this.sampleCategories = [...this.sampleCategories, customCategory];
        }
        customCategory.samples.push({ key: customSampleKey, name: file.name });
        
        this.selectedCategory.set('Custom');
        this.updateFilteredSamples();

        // Automatically select the uploaded sample
        this.assignSample(customSampleKey, base64Data);

      } catch (error) {
        console.error("Error processing custom sample:", error);
        alert("Failed to process custom sample. Ensure it's a valid audio file.");
      }
    };
    reader.readAsDataURL(file);

    if (this.customSampleInput()) {
      this.customSampleInput().nativeElement.value = ''; // Reset file input
    }
  }

  private ensureAudioContext(): void {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  onClose(): void {
    if (this.currentAudioSource) {
      this.currentAudioSource.stop();
      this.currentAudioSource.disconnect();
      this.currentAudioSource = null;
    }
    this.close.emit();
  }
}
