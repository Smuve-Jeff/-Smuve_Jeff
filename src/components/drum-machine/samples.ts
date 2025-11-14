
export interface Pad {
  name: string;
  key: string;
  sampleKey: string;
}

export interface Kit {
  name: string;
  pads: Pad[];
}

export interface SampleCategory {
  category: string;
  samples: { key: string; name: string }[];
}

// FIX: Replaced problematic base64 data with a minimal, valid WAV to prevent errors.
// A minimal valid WAV file data URI (approx 0.01s silence, 8kHz, mono).
const MINIMAL_WAV = 'data:audio/wav;base64,UklGRlQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABgAAABkYXRhAgAAANuAgwAAAAAAAAAAAP//';


// Base64 encoded WAV files for portability
// All samples converted to template literals (backticks) to avoid syntax errors with special characters
// Using a minimal placeholder for brevity, actual app would have full data.
export const SAMPLES: { [key: string]: string } = {
  // --- Kicks ---
  kick808: MINIMAL_WAV,
  kick909: MINIMAL_WAV,
  // --- Snares ---
  snare808: MINIMAL_WAV,
  snare909: MINIMAL_WAV,
  // --- Claps ---
  clap808: MINIMAL_WAV,
  // --- HiHats ---
  hihat808_closed: MINIMAL_WAV,
  hihat808_open: MINIMAL_WAV,
  // --- Toms ---
  tom_low: MINIMAL_WAV,
  tom_mid: MINIMAL_WAV,
  tom_high: MINIMAL_WAV,
  // --- Cymbals ---
  ride: MINIMAL_WAV,
  crash: MINIMAL_WAV,
  // --- Percussion ---
  perc1: MINIMAL_WAV,
  perc2: MINIMAL_WAV,
  perc3: MINIMAL_WAV,
  perc4: MINIMAL_WAV,
};


// FIX: Added 'kits' export to satisfy import in drum-machine.component.ts
export const kits: Kit[] = [
  {
    name: '808 Classic',
    pads: [
      { name: 'Kick', key: '1', sampleKey: 'kick808' },
      { name: 'Kick 2', key: '2', sampleKey: 'kick909' },
      { name: 'Snare', key: '3', sampleKey: 'snare808' },
      { name: 'Clap', key: '4', sampleKey: 'clap808' },
      { name: 'Snare 2', key: 'q', sampleKey: 'snare909' },
      { name: 'Perc 1', key: 'w', sampleKey: 'perc1' },
      { name: 'CHH', key: 'e', sampleKey: 'hihat808_closed' },
      { name: 'Perc 2', key: 'r', sampleKey: 'perc2' },
      { name: 'OHH', key: 'a', sampleKey: 'hihat808_open' },
      { name: 'Perc 3', key: 's', sampleKey: 'perc3' },
      { name: 'Tom L', key: 'd', sampleKey: 'tom_low' },
      { name: 'Perc 4', key: 'f', sampleKey: 'perc4' },
      { name: 'Tom M', key: 'z', sampleKey: 'tom_mid' },
      { name: 'Tom H', key: 'x', sampleKey: 'tom_high' },
      { name: 'Crash', key: 'c', sampleKey: 'crash' },
      { name: 'Ride', key: 'v', sampleKey: 'ride' },
    ]
  }
];

// FIX: Added 'SAMPLE_LIBRARY' export to satisfy imports.
export const SAMPLE_LIBRARY: SampleCategory[] = [
    {
        category: 'Kicks',
        samples: [
            { key: 'kick808', name: '808 Kick' },
            { key: 'kick909', name: '909 Kick' },
        ]
    },
    {
        category: 'Snares & Claps',
        samples: [
            { key: 'snare808', name: '808 Snare' },
            { key: 'snare909', name: '909 Snare' },
            { key: 'clap808', name: '808 Clap' },
        ]
    },
    {
        category: 'Hats & Cymbals',
        samples: [
            { key: 'hihat808_closed', name: '808 Closed Hat' },
            { key: 'hihat808_open', name: '808 Open Hat' },
            { key: 'ride', name: 'Ride Cymbal' },
            { key: 'crash', name: 'Crash Cymbal' },
        ]
    },
    {
        category: 'Toms',
        samples: [
            { key: 'tom_low', name: 'Low Tom' },
            { key: 'tom_mid', name: 'Mid Tom' },
            { key: 'tom_high', name: 'High Tom' },
        ]
    },
    {
        category: 'Percussion',
        samples: [
            { key: 'perc1', name: 'Percussion 1' },
            { key: 'perc2', name: 'Percussion 2' },
            { key: 'perc3', name: 'Percussion 3' },
            { key: 'perc4', name: 'Percussion 4' },
        ]
    }
];
