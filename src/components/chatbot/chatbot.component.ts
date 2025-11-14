
import { Component, ChangeDetectionStrategy, signal, output, ElementRef, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GoogleGenAI, Chat, GenerateContentResponse, Type, GenerateContentParameters } from "@google/genai"; // Changed to direct named import

// FIX: Correctly declare SpeechRecognition and related event types for TypeScript
declare interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
  readonly resultIndex: number;
  // Add other properties if needed for detailed usage, but these are sufficient for the current code.
  readonly emma: Document | null;
  readonly interpretation: any;
}

declare interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string; // Simplified, could be a specific enum type
  readonly message: string;
}

// FIX: Augment the Window interface to include SpeechRecognition and webkitSpeechRecognition as constructors
declare global {
  interface Window {
    SpeechRecognition: {
      new (): SpeechRecognition;
      prototype: SpeechRecognition;
    };
    webkitSpeechRecognition: {
      new (): SpeechRecognition;
      prototype: SpeechRecognition;
    };
    SpeechSynthesisUtterance: typeof SpeechSynthesisUtterance;
    // Removed redundant 'speechSynthesis: SpeechSynthesis;' as it's already globally defined
  }
}

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  urls?: { uri: string; title?: string }[]; // New: Optional field for grounding URLs
}

const getApiKey = (): string => {
  const rawApiKey = process.env.API_KEY;
  // Explicitly check for the string literal "undefined"
  if (rawApiKey === undefined || rawApiKey === null || String(rawApiKey).trim() === '' || String(rawApiKey) === 'undefined') {
    return ''; // Return an empty string for any problematic values, including the string literal "undefined"
  }
  return rawApiKey;
};

@Component({
  selector: 'app-chatbot',
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.css'],
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatbotComponent {
  close = output<void>();
  appCommand = output<{ action: string; parameters: any }>(); // New: Output for application commands

  messages = signal<ChatMessage[]>([]);
  userMessage = signal('');
  isLoading = signal(false);
  isVoiceInputActive = signal(false); // NEW: Signal for voice input
  isSpeaking = signal(false); // NEW: Signal if the chatbot is speaking
  isDeepQueryActive = signal(false); // NEW: Signal for deep query mode

  chatHistoryRef = viewChild<ElementRef<HTMLDivElement>>('chatHistory');

  private genAI: GoogleGenAI; // Use direct GoogleGenAI
  private chatInstance: Chat; // For gemini-2.5-flash
  private speechRecognition: SpeechRecognition | null = null; // NEW: SpeechRecognition instance
  private speechUtterance: SpeechSynthesisUtterance | null = null; // NEW: SpeechSynthesisUtterance instance

  constructor() {
    const apiKey = getApiKey();
    this.genAI = new GoogleGenAI({ apiKey }); // Use direct GoogleGenAI and ensure API key is a string
    this.chatInstance = this.genAI.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: `You are S.M.U.V.E (Strategic Music Uplift & Vision Engine), an expert AI in music management, marketing, promotion, and song creation. You provide detailed recommendations, tips, and insights. You can also answer general questions about music, artists, and industry trends. When asked for information that requires up-to-date knowledge (e.g., recent events, current charts), the user may explicitly ask you to "Search Google for..." or "Google for..." a topic.

Your responses should be enthusiastic, helpful, and concise.

You can also control the user's music application. If the user explicitly asks you to perform an action related to music, like "add a track", "play a song", or "remove from playlist", you MUST respond in the following format, and nothing else:
COMMAND:::[ACTION_NAME]:::key='value';key2='value'

Otherwise, for general chat, respond in the following format:
CHAT:::Your natural language response here.

Here are the available actions and their parameters (as a key-value string for the third part of the command format). Note that values MUST be enclosed in single quotes.
- **ACTION**: \`addTrackToPlaylist\`
  - **PARAMETERS**: \`title='...';artist='...';albumArtUrl='...';audioSrc='...'\` (artist, albumArtUrl, audioSrc are optional)
- **ACTION**: \`playTrackInPlayer\`
  - **PARAMETERS**: \`index='1'\` OR \`title='...'\`
- **ACTION**: \`removeTrackFromPlaylist\`
  - **PARAMETERS**: \`index='0'\` OR \`title='...'\`

Prioritize using 'title' for track identification if provided. If an index is provided, use that.

EXAMPLE USER PROMPT: "Add a new track named 'My New Song' by 'The AI Artist' to my playlist."
EXAMPLE RESPONSE: COMMAND:::addTrackToPlaylist:::title='My New Song';artist='The AI Artist'

EXAMPLE USER PROMPT: "What's the best way to promote a new single?"
EXAMPLE RESPONSE: CHAT:::The best way to promote a new single involves a multi-pronged approach. First, you should build a strong social media presence...
`,
      },
    });

    // NEW: Initialize SpeechRecognition
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      this.speechRecognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
      this.speechRecognition.continuous = false; // Only get one result per speech segment
      this.speechRecognition.interimResults = false;
      this.speechRecognition.lang = 'en-US';

      this.speechRecognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript;
        this.userMessage.set(transcript);
        this.sendMessage(); // Send the transcribed message
        this.stopVoiceInput(); // Stop listening after result
      };

      this.speechRecognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech') {
          // Do nothing, just means no speech was detected.
        } else {
          this.messages.update(msgs => [...msgs, { role: 'model', content: `Voice input error: ${event.error}. Please try again.` }]);
        }
        this.stopVoiceInput();
      };

      this.speechRecognition.onend = () => {
        this.isVoiceInputActive.set(false);
      };
    } else {
      console.warn('Speech Recognition API not supported in this browser.');
    }
  }

  async sendMessage(): Promise<void> {
    const message = this.userMessage().trim();
    if (!message) return;

    this.messages.update(msgs => [...msgs, { role: 'user', content: message }]);
    this.userMessage.set(''); // Clear input
    this.isLoading.set(true);
    this.stopSpeaking(); // Stop any ongoing speech before processing new message

    if (this.isDeepQueryActive()) {
      await this.sendDeepQuery(message);
      this.isDeepQueryActive.set(false); // Reset deep query mode after one message
    } else if (message.toLowerCase().startsWith('search google for') || message.toLowerCase().startsWith('google for')) {
      const query = message.toLowerCase().startsWith('google for')
        ? message.substring('google for'.length).trim()
        : message.substring('search google for'.length).trim();
      await this.sendGoogleSearchQuery(query);
    } else {
      try {
        const response: GenerateContentResponse = await this.chatInstance.sendMessage({ message });
        const rawAiResponse = response.text;

        if (typeof rawAiResponse !== 'string' || rawAiResponse.trim() === '') {
          console.warn('Gemini API returned empty or non-string response:', rawAiResponse);
          const fallbackContent = 'S.M.U.V.E received an empty response. Please try rephrasing.';
          this.messages.update(msgs => [...msgs, { role: 'model', content: fallbackContent }]);
          this.speakResponse(fallbackContent);
          this.isLoading.set(false);
          this.scrollToBottom();
          return;
        }

        const trimmedResponse = rawAiResponse.trim();
        const parts = trimmedResponse.split(':::');

        if (parts.length >= 2 && parts[0] === 'CHAT') {
            const chatContent = parts.slice(1).join(':::');
            this.messages.update(msgs => [...msgs, { role: 'model', content: chatContent }]);
            this.speakResponse(chatContent);
        } else if (parts.length >= 2 && parts[0] === 'COMMAND') { // Can be 2 or 3 parts now
            const action = parts[1].trim();
            const paramsString = (parts[2] || '').trim();
            try {
                const parameters: { [key: string]: any } = {};
                if (paramsString) {
                  const regex = /(\w+)\s*=\s*'([^']*)'/g;
                  let match;
                  while ((match = regex.exec(paramsString)) !== null) {
                    const key = match[1];
                    const value = match[2];
                    // Attempt to convert numeric strings to numbers for keys like 'index'
                    parameters[key] = /^\d+$/.test(value) ? parseInt(value, 10) : value;
                  }
                }
                
                this.appCommand.emit({ action, parameters });
                const aiContent = `Executing command: ${action}`;
                this.messages.update(msgs => [...msgs, { role: 'model', content: aiContent }]);
                this.speakResponse(aiContent);
            } catch (parseError) {
                console.error("Failed to parse command parameters:", parseError, "from string:", paramsString);
                const errorContent = `S.M.U.V.E sent a command I couldn't understand. Please try again.`;
                this.messages.update(msgs => [...msgs, { role: 'model', content: errorContent }]);
                this.speakResponse(errorContent);
            }
        } else {
            // Fallback if the format is not recognized. This is important.
            console.warn('AI response did not match expected CHAT/COMMAND format:', trimmedResponse);
            this.messages.update(msgs => [...msgs, { role: 'model', content: trimmedResponse }]);
            this.speakResponse(trimmedResponse);
        }

      } catch (error) {
        console.error('Error sending message to Gemini API:', error);
        const errorContent = 'Oops! Something went wrong. Please try again.';
        this.messages.update(msgs => [...msgs, { role: 'model', content: errorContent }]);
        this.speakResponse(errorContent);
      }
    }
    this.isLoading.set(false);
    this.scrollToBottom();
  }

  // NEW: Method for Google Search Grounding
  private async sendGoogleSearchQuery(query: string): Promise<void> {
    const apiKey = getApiKey();
    const ai = new GoogleGenAI({ apiKey }); // Ensure API key is a string
    try {
      // Create a GenerateContentParameters object
      const generateContentParameters: GenerateContentParameters = {
        model: 'gemini-2.5-flash',
        contents: [{ text: query }],
        config: {
          tools: [{ googleSearch: {} }],
          // DO NOT set responseMimeType or responseSchema for googleSearch tool
        },
      };

      const response: GenerateContentResponse = await ai.models.generateContent(generateContentParameters);
      const aiResponseText = response.text;

      // Extract grounding chunks for URLs
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const urls: { uri: string; title?: string }[] = [];
      if (groundingChunks) {
        for (const chunk of groundingChunks) {
          if (chunk.web && chunk.web.uri) {
            urls.push({ uri: chunk.web.uri, title: chunk.web.title });
          }
        }
      }

      const messageContent: ChatMessage = {
        role: 'model',
        content: aiResponseText,
        urls: urls.length > 0 ? urls : undefined,
      };
      this.messages.update(msgs => [...msgs, messageContent]);
      this.speakResponse(aiResponseText);
    } catch (error) {
      console.error('Error sending Google Search query to Gemini API:', error);
      const errorContent = 'Oops! Failed to perform Google Search. Please try again.';
      this.messages.update(msgs => [...msgs, { role: 'model', content: errorContent }]);
      this.speakResponse(errorContent);
    }
  }

  // NEW: Method for Deep Query (gemini-2.5-pro with thinking budget)
  async sendDeepQuery(message: string): Promise<void> {
    const apiKey = getApiKey();
    const ai = new GoogleGenAI({ apiKey }); // Ensure API key is a string
    try {
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash", // Changed to gemini-2.5-flash as gemini-2.5-pro is deprecated.
        contents: [{ text: message }],
        config: {
          thinkingConfig: { thinkingBudget: 32768 },
        },
      });
      const aiResponseText = response.text;
      this.messages.update(msgs => [...msgs, { role: 'model', content: `[DEEP QUERY RESPONSE]: ${aiResponseText}` }]);
      this.speakResponse(aiResponseText);
    } catch (error) {
      console.error('Error sending deep query to Gemini API:', error);
      const errorContent = 'Oops! Deep query failed. Please try again.';
      this.messages.update(msgs => [...msgs, { role: 'model', content: errorContent }]);
      this.speakResponse(errorContent);
    }
  }

  // NEW: Toggle voice input
  toggleVoiceInput(): void {
    if (this.isVoiceInputActive()) {
      this.stopVoiceInput();
    } else {
      this.startVoiceInput();
    }
  }

  // NEW: Start Speech Recognition
  private startVoiceInput(): void {
    if (!this.speechRecognition) {
      alert('Speech Recognition is not supported in your browser.');
      return;
    }
    this.stopSpeaking(); // Stop speaking if AI is talking
    this.isVoiceInputActive.set(true);
    this.userMessage.set('Listening...'); // Provide visual feedback
    try {
      this.speechRecognition.start();
    } catch (e) {
      console.error('Error starting speech recognition:', e);
      this.isVoiceInputActive.set(false);
      this.userMessage.set('');
      this.messages.update(msgs => [...msgs, { role: 'model', content: 'Could not start voice input. Please ensure microphone permissions are granted.' }]);
    }
  }

  // NEW: Stop Speech Recognition
  private stopVoiceInput(): void {
    if (this.speechRecognition && this.isVoiceInputActive()) {
      this.speechRecognition.stop();
      this.isVoiceInputActive.set(false);
    }
  }

  // NEW: Convert text to speech
  private speakResponse(text: string): void {
    this.stopSpeaking(); // Stop any previous speech
    if ('speechSynthesis' in window) {
      this.speechUtterance = new SpeechSynthesisUtterance(text);
      this.speechUtterance.lang = 'en-US';
      this.speechUtterance.rate = 1; // You can adjust rate and pitch
      this.speechUtterance.pitch = 1;

      this.speechUtterance.onstart = () => {
        this.isSpeaking.set(true);
      };
      this.speechUtterance.onend = () => {
        this.isSpeaking.set(false);
        this.speechUtterance = null;
      };
      this.speechUtterance.onerror = (event) => {
        console.error('SpeechSynthesisUtterance.onerror', event);
        this.isSpeaking.set(false);
        this.speechUtterance = null;
      };
      speechSynthesis.speak(this.speechUtterance);
    } else {
      console.warn('Speech Synthesis API not supported in this browser.');
    }
  }

  // NEW: Stop any current speech
  private stopSpeaking(): void {
    if (this.speechUtterance && speechSynthesis.speaking) {
      speechSynthesis.cancel();
      this.isSpeaking.set(false);
      this.speechUtterance = null;
    }
  }

  // NEW: Toggle Deep Query mode
  toggleDeepQuery(): void {
    this.isDeepQueryActive.update(val => !val);
    if (this.isDeepQueryActive()) {
      this.messages.update(msgs => [...msgs, { role: 'model', content: 'Deep Query mode activated. Your next message will use Gemini 2.5 Flash with enhanced thinking. Be patient for the response.' }]);
      this.speakResponse('Deep Query mode activated. Your next message will use Gemini 2.5 Flash with enhanced thinking. Be patient for the response.');
    } else {
      this.messages.update(msgs => [...msgs, { role: 'model', content: 'Deep Query mode deactivated.' }]);
      this.speakResponse('Deep Query mode deactivated.');
    }
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      const chatHistoryElement = this.chatHistoryRef()?.nativeElement;
      if (chatHistoryElement) {
        chatHistoryElement.scrollTop = chatHistoryElement.scrollHeight;
      }
    }, 0);
  }

  onClose(): void {
    this.stopVoiceInput();
    this.stopSpeaking();
    this.close.emit();
  }
}
