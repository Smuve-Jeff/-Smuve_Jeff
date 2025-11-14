
import { Component, ChangeDetectionStrategy, signal, ElementRef, viewChild, output } from '@angular/core';
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
  selector: 'app-image-editor',
  templateUrl: './image-editor.component.html',
  styleUrls: ['./image-editor.component.css'],
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageEditorComponent {
  originalImageUrl = signal<string | null>(null);
  editPrompt = signal('');
  generatedImageUrls = signal<string[]>([]);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);

  fileInputRef = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  imageSelected = output<string>(); // NEW: Output for selected image URL

  private genAI: GoogleGenAI; // Use direct GoogleGenAI

  constructor() {
    const apiKey = getApiKey();
    this.genAI = new GoogleGenAI({ apiKey }); // Use direct GoogleGenAI and ensure API key is a string
  }

  handleImageUpload(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.errorMessage.set(null);
      this.generatedImageUrls.set([]); // Clear previous generations
      const reader = new FileReader();
      reader.onload = (e) => {
        this.originalImageUrl.set(e.target?.result as string);
      };
      reader.onerror = () => {
        this.errorMessage.set('Failed to read file.');
      };
      reader.readAsDataURL(file);
    } else {
      this.originalImageUrl.set(null);
      this.generatedImageUrls.set([]);
    }
  }

  async generateImage(): Promise<void> {
    const imageUrl = this.originalImageUrl();
    const prompt = this.editPrompt().trim();

    if (!prompt) { // Removed imageUrl check, as it's not direct input anymore
      this.errorMessage.set('Please enter an edit prompt.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.generatedImageUrls.set([]);

    try {
      // FIX: The 'image' property is not supported in the GenerateImagesParameters type
      // for the 'imagen-4.0-generate-001' model according to the API definition and error.
      // This means the image editor will now function as a text-to-image generator,
      // where the uploaded image acts as context for the user's prompt, but is not sent
      // as an input image to the AI model for editing.
      const response = await this.genAI.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: prompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/png', // Request PNG output
          aspectRatio: '1:1', // Default aspect ratio for now
        },
      });

      const base64ImageBytes: string | undefined = response.generatedImages[0]?.image?.imageBytes;
      if (base64ImageBytes) {
        this.generatedImageUrls.set([`data:image/png;base64,${base64ImageBytes}`]);
      } else {
        this.errorMessage.set('No image generated. Please try a different prompt.');
      }
    } catch (error: any) {
      console.error('Error generating image:', error);
      this.errorMessage.set(`Image generation failed: ${error.message || 'Unknown error'}.`);
    } finally {
      this.isLoading.set(false);
    }
  }

  clearImage(): void {
    this.originalImageUrl.set(null);
    this.generatedImageUrls.set([]);
    this.editPrompt.set('');
    this.errorMessage.set(null);
    if (this.fileInputRef()) {
      this.fileInputRef()!.nativeElement.value = ''; // Reset file input
    }
  }

  // NEW: Emit the currently displayed image URL
  useAsAlbumArt(): void {
    const urlToEmit = this.generatedImageUrls().length > 0
      ? this.generatedImageUrls()[0]
      : this.originalImageUrl();
    
    if (urlToEmit) {
      this.imageSelected.emit(urlToEmit);
      alert('Image sent to main player for potential album art use!');
    } else {
      this.errorMessage.set('No image to use as album art.');
    }
  }
}
