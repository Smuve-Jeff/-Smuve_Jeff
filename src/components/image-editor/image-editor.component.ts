import { Component, ChangeDetectionStrategy, signal, ElementRef, viewChild, output, input, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GoogleGenAI } from '@google/genai'; // Changed to direct named import

@Component({
  selector: 'app-image-editor',
  templateUrl: './image-editor.component.html',
  styleUrls: ['./image-editor.component.css'],
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageEditorComponent {
  // NEW: Input for initial prompt
  initialPrompt = input<string | null>(null);

  originalImageUrl = signal<string | null>(null);
  editPrompt = signal('');
  generatedImageUrls = signal<string[]>([]);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  isAiAvailable = signal(true); // NEW: Signal to track AI service availability

  fileInputRef = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  imageSelected = output<string>(); // NEW: Output for selected image URL

  private genAI?: GoogleGenAI; // Use direct GoogleGenAI, make optional

  constructor() {
    const apiKey = this.getSanitizedApiKey();
    if (apiKey) {
      try {
        this.genAI = new GoogleGenAI({ apiKey });
      } catch (e) {
        console.error("Fatal: Failed to initialize GoogleGenAI. AI features will be disabled.", e);
        this.isAiAvailable.set(false);
        this.errorMessage.set('AI services are unavailable due to a configuration error.');
      }
    } else {
      console.warn("Google GenAI API key is not available. AI features will be disabled.");
      this.isAiAvailable.set(false);
      this.errorMessage.set('AI services are unavailable. An API key is required.');
    }
    
    // Effect to update editPrompt when initialPrompt changes (e.g., from chatbot)
    effect(() => {
      const prompt = this.initialPrompt();
      if (prompt && prompt !== this.editPrompt()) {
        this.editPrompt.set(prompt);
      }
    });
  }

  private getSanitizedApiKey(): string | null {
    // Defensive check for process and process.env existence
    if (typeof process === 'undefined' || !process.env) {
      console.warn("API_KEY: 'process' or 'process.env' is not available in this environment.");
      return null;
    }

    const rawApiKey = process.env.API_KEY;

    // 1. Must be a string. Handles null, undefined, numbers, etc.
    if (typeof rawApiKey !== 'string') {
      console.warn(`API_KEY: Received non-string type: ${typeof rawApiKey}. Expected string.`);
      return null;
    }
    
    const trimmedApiKey = rawApiKey.trim();

    // 2. Check for empty string after trimming
    if (trimmedApiKey === '') {
      console.warn("API_KEY: Received an empty string after trimming. API key is required.");
      return null;
    }

    // 3. Check for common placeholder strings (case-insensitive)
    const lowercasedKey = trimmedApiKey.toLowerCase();
    if (lowercasedKey === 'undefined' || lowercasedKey === 'null' || lowercasedKey === '[api_key]' || lowercasedKey === 'your_api_key') {
      console.warn(`API_KEY: Received a common placeholder string: '${trimmedApiKey}'. API key is not set.`);
      return null;
    }

    // 4. Heuristic length check: real Gemini API keys are typically ~39 characters.
    // A minimum length of 30 is a reasonable heuristic to filter out clearly invalid short strings.
    if (trimmedApiKey.length < 30) {
      console.warn(`API_KEY: Received a suspiciously short key (length ${trimmedApiKey.length}). Expected a real API key.`);
      return null;
    }

    console.log(`API_KEY: Validated key of length ${trimmedApiKey.length} will be used.`);
    return trimmedApiKey;
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
    if (!this.isAiAvailable() || !this.genAI) {
      this.errorMessage.set('AI features are unavailable. Please check your configuration.');
      return;
    }
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
      // Removed the alert here, parent will handle feedback via modal
    } else {
      this.errorMessage.set('No image to use as album art.');
    }
  }
}