import { bootstrapApplication } from '@angular/platform-browser';
import { provideZonelessChangeDetection } from '@angular/core';
import { AppComponent } from './src/components/video-editor/app.component'; // Corrected path

// CRITICAL: Log process.env.API_KEY at startup to diagnose potential low-level parsing issues.
// The "undefined is not valid JSON" error often occurs when the literal string "undefined"
// is substituted for process.env.API_KEY by a build tool or runtime, and then JSON.parse("undefined") is attempted
// by an external library (e.g., @google/genai or its ESM wrapper) before Angular components fully initialize.
const apiKeyAtStartup = typeof process !== 'undefined' && process.env ? process.env.API_KEY : 'process.env not available';
if (typeof apiKeyAtStartup === 'string' && apiKeyAtStartup.toLowerCase() === 'undefined') {
  console.error('index.tsx: Detected literal string "undefined" for API_KEY at startup. This is a common cause of "undefined is not valid JSON" errors. Please ensure API_KEY environment variable is properly set.');
}
// FIX: Corrected the console.log syntax, assuming the intent was to log the API key value with a descriptive label.
console.log('index.tsx: API_KEY value at startup:', apiKeyAtStartup);

bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
  ],
}).catch(err => console.error(err));

// AI Studio always uses an `index.tsx` file for all project types.