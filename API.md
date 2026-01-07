# API Documentation

This document provides comprehensive documentation for the Gemini API integration in Quiz Master, including service functions, data formats, error handling, and usage examples.

## Table of Contents

- [Overview](#overview)
- [Service Module](#service-module)
- [Text-to-Speech API](#text-to-speech-api)
- [Question Generation API](#question-generation-api)
- [Helper Functions](#helper-functions)
- [Error Handling](#error-handling)
- [Usage Examples](#usage-examples)
- [API Costs and Limits](#api-costs-and-limits)
- [Troubleshooting](#troubleshooting)

---

## Overview

The Quiz Master application integrates with Google's Gemini API through two main endpoints:

1. **Text-to-Speech (TTS)**: Converts question text to natural-sounding audio
2. **Vision/Question Generation**: Extracts questions from images and PDFs using AI vision

### API Configuration

**Service File**: `services/geminiService.ts` (174 lines)
**SDK**: `@google/genai` v1.27.0
**Authentication**: API key via environment variable

```typescript
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
```

### Environment Setup

Create a `.env.local` file:

```bash
GEMINI_API_KEY=your_api_key_here
```

The API key is:
- Loaded via Vite's environment variable system
- Accessible as `process.env.API_KEY` (configured in `vite.config.ts`)
- Exposed to client code (suitable for development, not production)

---

## Service Module

### Exports

```typescript
export const speak: (text: string) => Promise<void>
export const generateQuestionsFromImage: (fileData: string, mimeType: string) => Promise<Question[]>
```

### Dependencies

```typescript
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { Question } from '../types';
```

---

## Text-to-Speech API

### Function: `speak(text: string)`

**Purpose**: Convert text to speech using Gemini's TTS model
**Location**: `services/geminiService.ts:36-70`

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | `string` | Yes | The text to convert to speech (typically a quiz question) |

#### Returns

`Promise<void>` - Resolves when audio playback starts, rejects on error

#### Implementation Details

**Model**: `gemini-2.5-flash-preview-tts`
**Voice**: Kore (prebuilt voice)
**Response Modality**: Audio
**Audio Format**:
- Encoding: PCM (Pulse Code Modulation)
- Sample Rate: 24000 Hz
- Channels: Mono (1)
- Bit Depth: 16-bit
- Container: Raw base64-encoded PCM data

#### API Request

```typescript
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash-preview-tts",
  contents: [{ parts: [{ text }] }],
  config: {
    responseModalities: [Modality.AUDIO],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: 'Kore' },
      },
    },
  },
});
```

#### API Response Structure

```typescript
{
  candidates: [
    {
      content: {
        parts: [
          {
            inlineData: {
              data: "base64_encoded_pcm_audio_data",
              mimeType: "audio/pcm"
            }
          }
        ]
      }
    }
  ]
}
```

#### Audio Processing Flow

1. **Extract Base64 Audio**:
   ```typescript
   const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
   ```

2. **Create Audio Context**:
   ```typescript
   const audioContext = new AudioContext({ sampleRate: 24000 });
   ```

3. **Decode Base64 to Uint8Array**:
   ```typescript
   const audioBytes = decode(base64Audio);
   ```

4. **Decode PCM to AudioBuffer**:
   ```typescript
   const audioBuffer = await decodeAudioData(audioBytes, audioContext, 24000, 1);
   ```

5. **Play Audio**:
   ```typescript
   const source = audioContext.createBufferSource();
   source.buffer = audioBuffer;
   source.connect(audioContext.destination);
   source.start();
   ```

#### Error Handling

**Environment Error**:
```typescript
if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set.");
}
```

**No Audio Data Error**:
```typescript
if (!base64Audio) {
  throw new Error("No audio data received from API.");
}
```

#### Browser Compatibility

Uses fallback for older browsers:
```typescript
const audioContext = new (
  window.AudioContext || (window as any).webkitAudioContext
)({ sampleRate: 24000 });
```

**Supported Browsers**:
- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ With webkitAudioContext
- Mobile: ✅ iOS Safari, Chrome Mobile

#### Usage Example

```typescript
import { speak } from './services/geminiService';

const handleSpeak = async () => {
  try {
    setIsLoadingTTS(true);
    await speak("What is 5 + 7?");
    // Audio plays automatically
  } catch (error) {
    console.error("TTS error:", error);
    setTtsError("Failed to generate audio");
  } finally {
    setIsLoadingTTS(false);
  }
};
```

---

## Question Generation API

### Function: `generateQuestionsFromImage(fileData: string, mimeType: string)`

**Purpose**: Extract quiz questions from images or PDFs using Gemini's vision capabilities
**Location**: `services/geminiService.ts:72-173`

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fileData` | `string` | Yes | Base64-encoded file content (without MIME prefix) |
| `mimeType` | `string` | Yes | MIME type of the file (e.g., "image/jpeg", "application/pdf") |

#### Returns

`Promise<Question[]>` - Array of extracted questions

**Question Type**:
```typescript
interface Question {
  id: number;
  question: string;
  answer: string;
  data?: {
    type: 'table';
    headers: string[];
    rows: string[][];
  };
}
```

#### Implementation Details

**Model**: `gemini-2.5-pro`
**Response Format**: Structured JSON with schema validation
**Supported File Types**:
- **Images**: JPEG, PNG, WebP, GIF
- **Documents**: PDF

#### Extraction Prompt

```typescript
const prompt = `
  Analyze the provided document (image or PDF).
  Extract all the questions and their corresponding answers.
  Format the output as a valid JSON array. Each object in the array should represent a single question and must conform to the provided schema.
  - Each question must have a unique 'id', starting from 1 and incrementing for each question.
  - The 'question' field should contain the full text of the question.
  - The 'answer' field should contain the correct answer.
  - If a question involves a table, populate the 'data' field. 'type' should be 'table', 'headers' should be an array of the table's column headers, and 'rows' should be an array of arrays, where each inner array represents a row's cells. Convert all table cell values to strings.
  - If there is no table, the 'data' field should be null.

  Return only the raw JSON array, with no surrounding text or markdown formatting.
`;
```

#### JSON Schema

The API uses structured output with a strict JSON schema to ensure consistent formatting:

```typescript
{
  type: Type.ARRAY,
  description: "An array of quiz questions.",
  items: {
    type: Type.OBJECT,
    properties: {
      id: {
        type: Type.NUMBER,
        description: "A unique numeric ID for the question, starting from 1."
      },
      question: {
        type: Type.STRING,
        description: "The text of the question."
      },
      answer: {
        type: Type.STRING,
        description: "The correct answer to the question."
      },
      data: {
        type: Type.OBJECT,
        description: "Optional structured data, like a table, associated with the question.",
        nullable: true,
        properties: {
          type: {
            type: Type.STRING,
            description: "The type of data, should be 'table'."
          },
          headers: {
            type: Type.ARRAY,
            description: "An array of strings for the table headers.",
            items: { type: Type.STRING }
          },
          rows: {
            type: Type.ARRAY,
            description: "An array of arrays, where each inner array represents a table row. All cell values should be converted to strings.",
            items: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        }
      }
    },
    required: ['id', 'question', 'answer']
  }
}
```

#### API Request

```typescript
const response = await ai.models.generateContent({
  model: 'gemini-2.5-pro',
  contents: { parts: [textPart, filePart] },
  config: {
    responseMimeType: "application/json",
    responseSchema: schema,
  },
});
```

**Request Parts**:

1. **Text Part** (prompt):
   ```typescript
   {
     text: prompt
   }
   ```

2. **File Part** (image/PDF):
   ```typescript
   {
     inlineData: {
       data: fileData,      // Base64-encoded
       mimeType: mimeType   // e.g., "image/jpeg"
     }
   }
   ```

#### Response Processing

1. **Extract JSON Text**:
   ```typescript
   const jsonText = response.text;
   ```

2. **Parse JSON**:
   ```typescript
   const parsedJson = JSON.parse(jsonText);
   ```

3. **Validate Array**:
   ```typescript
   if (!Array.isArray(parsedJson)) {
     throw new Error("AI did not return a valid JSON array.");
   }
   ```

4. **Return Typed Questions**:
   ```typescript
   return parsedJson as Question[];
   ```

#### Error Handling

**Environment Error**:
```typescript
if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set.");
}
```

**Parse Error**:
```typescript
try {
  const parsedJson = JSON.parse(jsonText);
  // ...
} catch (e) {
  console.error("Failed to parse JSON response:", jsonText);
  throw new Error("The AI returned an invalid response. Please try a different file or check the console for details.");
}
```

#### File Preparation

Before calling this function, convert the file to base64:

```typescript
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the "data:mime/type;base64," prefix
      resolve(result.split(',')[1]);
    };
    reader.onerror = error => reject(error);
  });
};

// Usage
const base64 = await fileToBase64(uploadedFile);
await generateQuestionsFromImage(base64, uploadedFile.type);
```

#### Usage Example

```typescript
import { generateQuestionsFromImage } from './services/geminiService';

const handleGenerateQuestions = async () => {
  if (!selectedFile) return;

  try {
    setIsGenerating(true);
    setGenerationError(null);

    // Convert file to base64
    const base64 = await fileToBase64(selectedFile);

    // Generate questions
    const newQuestions = await generateQuestionsFromImage(
      base64,
      selectedFile.type
    );

    // Update quiz with new questions
    resetQuiz(newQuestions);
  } catch (error) {
    console.error("Generation error:", error);
    setGenerationError(error.message);
  } finally {
    setIsGenerating(false);
  }
};
```

#### Example Response

Input: Image of a math worksheet

Output:
```json
[
  {
    "id": 1,
    "question": "What is 12 + 8?",
    "answer": "20"
  },
  {
    "id": 2,
    "question": "Solve: 45 - 17 = ?",
    "answer": "28"
  },
  {
    "id": 3,
    "question": "Based on the table below, what is the total number of apples sold?",
    "answer": "150",
    "data": {
      "type": "table",
      "headers": ["Day", "Apples Sold"],
      "rows": [
        ["Monday", "50"],
        ["Tuesday", "60"],
        ["Wednesday", "40"]
      ]
    }
  }
]
```

---

## Helper Functions

### Function: `decode(base64: string): Uint8Array`

**Purpose**: Convert base64 string to binary data
**Location**: `services/geminiService.ts:5-13`

#### Implementation

```typescript
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
```

**Process**:
1. Use `atob()` to decode base64 to binary string
2. Create Uint8Array with same length
3. Copy character codes to byte array
4. Return binary data

### Function: `decodeAudioData(...)`

**Purpose**: Convert raw PCM audio data to Web Audio API AudioBuffer
**Location**: `services/geminiService.ts:16-33`

#### Signature

```typescript
async function decodeAudioData(
  data: Uint8Array,        // Raw PCM audio bytes
  ctx: AudioContext,       // Audio context for playback
  sampleRate: number,      // Sample rate in Hz (24000)
  numChannels: number      // Number of audio channels (1 for mono)
): Promise<AudioBuffer>
```

#### Implementation

```typescript
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  // Convert Uint8Array to Int16Array (16-bit PCM)
  const dataInt16 = new Int16Array(data.buffer);

  // Calculate number of audio frames
  const frameCount = dataInt16.length / numChannels;

  // Create AudioBuffer
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  // Populate each channel
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Normalize 16-bit PCM to float (-1.0 to 1.0)
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }

  return buffer;
}
```

**Process**:
1. Convert bytes to 16-bit integers
2. Calculate frame count (samples per channel)
3. Create AudioBuffer with correct dimensions
4. Normalize PCM values to float range (-1.0 to 1.0)
5. Populate channel data
6. Return playable AudioBuffer

---

## Error Handling

### Common Errors

#### 1. Missing API Key

**Error**: `"API_KEY environment variable not set."`

**Cause**: `.env.local` file missing or API key not set

**Solution**:
```bash
# Create .env.local
echo "GEMINI_API_KEY=your_key_here" > .env.local

# Restart dev server
npm run dev
```

#### 2. No Audio Data

**Error**: `"No audio data received from API."`

**Cause**: Gemini API response doesn't contain audio

**Possible Reasons**:
- API quota exceeded
- Invalid API key
- Model unavailable
- Malformed request

**Solution**:
- Check API key validity in Google AI Studio
- Verify quota in API dashboard
- Check browser console for API errors

#### 3. Invalid JSON Response

**Error**: `"The AI returned an invalid response. Please try a different file or check the console for details."`

**Cause**: Gemini couldn't parse the file or returned malformed JSON

**Possible Reasons**:
- File doesn't contain questions
- File quality is too poor
- File type not supported
- Unexpected file content

**Solution**:
- Ensure file contains clear, readable questions
- Try a different file with better image quality
- Check console for raw API response
- Verify file type is supported

#### 4. Network Errors

**Error**: Network request failed

**Cause**: Network connectivity issues or API endpoint unavailable

**Solution**:
- Check internet connection
- Verify Gemini API status
- Check browser network tab for details

### Error Handling Pattern

```typescript
// In App component
const handleSpeak = async () => {
  try {
    setIsLoadingTTS(true);
    setTtsError(null);
    await speak(currentQuestion.question);
  } catch (error) {
    console.error("TTS Error:", error);
    setTtsError(error.message || "Failed to generate audio");
  } finally {
    setIsLoadingTTS(false);
  }
};

// Render error message
{ttsError && (
  <div className="text-red-500">
    {ttsError}
  </div>
)}
```

---

## Usage Examples

### Complete TTS Integration

```typescript
// Component state
const [isLoadingTTS, setIsLoadingTTS] = useState(false);
const [ttsError, setTtsError] = useState<string | null>(null);

// Handler
const handleSpeak = useCallback(async () => {
  try {
    setIsLoadingTTS(true);
    setTtsError(null);

    await speak(currentQuestion.question);

    // Audio plays automatically
    console.log("Audio playback started");
  } catch (error) {
    console.error("TTS error:", error);
    setTtsError("Unable to play audio. Please try again.");
  } finally {
    setIsLoadingTTS(false);
  }
}, [currentQuestion.question]);

// Render
<button
  onClick={handleSpeak}
  disabled={isLoadingTTS}
  className="btn-primary"
  aria-label={isLoadingTTS ? "Generating audio..." : "Play question audio"}
>
  <SpeakerIcon isLoading={isLoadingTTS} />
</button>

{ttsError && (
  <p className="text-red-500 text-sm mt-2">{ttsError}</p>
)}
```

### Complete Question Generation Integration

```typescript
// Component state
const [selectedFile, setSelectedFile] = useState<File | null>(null);
const [isGenerating, setIsGenerating] = useState(false);
const [generationError, setGenerationError] = useState<string | null>(null);

// File upload handler
const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (file) {
    setSelectedFile(file);
    setGenerationError(null);
  }
};

// File to base64 converter
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = error => reject(error);
  });
};

// Generation handler
const handleGenerateQuestions = async () => {
  if (!selectedFile) {
    setGenerationError("Please select a file first");
    return;
  }

  try {
    setIsGenerating(true);
    setGenerationError(null);

    // Convert to base64
    const base64Data = await fileToBase64(selectedFile);

    // Generate questions
    const newQuestions = await generateQuestionsFromImage(
      base64Data,
      selectedFile.type
    );

    if (newQuestions.length === 0) {
      throw new Error("No questions found in the file");
    }

    // Update quiz
    resetQuiz(newQuestions);

    // Success feedback
    console.log(`Generated ${newQuestions.length} questions`);
  } catch (error) {
    console.error("Generation error:", error);
    setGenerationError(
      error.message || "Failed to generate questions. Please try a different file."
    );
  } finally {
    setIsGenerating(false);
  }
};

// Render
<div className="file-upload-section">
  <input
    type="file"
    accept="image/*,application/pdf"
    onChange={handleFileUpload}
    className="file-input"
  />

  {selectedFile && (
    <p className="text-sm text-gray-600">
      Selected: {selectedFile.name}
    </p>
  )}

  <button
    onClick={handleGenerateQuestions}
    disabled={!selectedFile || isGenerating}
    className="btn-primary"
  >
    {isGenerating ? "Generating..." : "Generate Questions"}
  </button>

  {generationError && (
    <div className="text-red-500 text-sm mt-2">
      {generationError}
    </div>
  )}
</div>
```

---

## API Costs and Limits

### Pricing Model

Gemini API pricing is based on:
- **Input tokens**: Text and image/PDF content sent to the API
- **Output tokens**: Generated responses (audio, JSON, etc.)
- **Model tier**: Different models have different pricing

### TTS Costs

**Model**: `gemini-2.5-flash-preview-tts`

Estimated costs (check current pricing at [Google AI Pricing](https://ai.google.dev/pricing)):
- Input: ~$0.01-0.05 per 1,000 characters
- Output: Audio generation cost

**Typical Quiz Question**:
- Input: 50 characters
- Cost per question: <$0.001

### Question Generation Costs

**Model**: `gemini-2.5-pro`

Costs depend on:
- **Image size**: Larger images = more input tokens
- **PDF pages**: Each page adds tokens
- **Number of questions extracted**

**Typical Costs**:
- Small image (1 MB JPEG): ~$0.01-0.05
- PDF (5 pages): ~$0.05-0.20

### Rate Limits

**Free Tier**:
- Requests per minute: 15-60 (varies by model)
- Requests per day: 1,500 (varies)

**Paid Tier**:
- Higher limits (check API dashboard)

### Quota Management

To avoid hitting limits:
1. **Cache TTS audio** for repeated questions
2. **Debounce file uploads** to prevent accidental multiple submissions
3. **Batch question generation** instead of per-question requests
4. **Implement retry logic** with exponential backoff

---

## Troubleshooting

### TTS Issues

#### Audio Not Playing

**Symptoms**: No audio plays, no errors

**Checklist**:
- [ ] Check browser audio permissions
- [ ] Verify volume is not muted
- [ ] Check browser console for errors
- [ ] Try a different browser
- [ ] Verify AudioContext is supported

**Debug Code**:
```typescript
console.log("AudioContext supported:", 'AudioContext' in window);
console.log("Audio buffer:", audioBuffer);
console.log("Sample rate:", audioContext.sampleRate);
```

#### Audio Distortion

**Symptoms**: Audio is garbled or distorted

**Possible Causes**:
- Sample rate mismatch
- Incorrect channel count
- PCM decoding error

**Solution**:
- Verify sample rate is 24000 Hz
- Ensure numChannels is 1 (mono)
- Check PCM normalization (divide by 32768.0)

### Question Generation Issues

#### No Questions Extracted

**Symptoms**: API returns empty array

**Possible Causes**:
- File doesn't contain questions
- Text is unreadable (poor quality)
- Format is not recognized

**Solutions**:
- Use higher quality images
- Ensure text is clear and legible
- Try a different file format
- Check file in console

#### Incorrect Questions

**Symptoms**: Questions or answers are wrong

**Possible Causes**:
- AI misinterpreted the content
- Ambiguous questions in source
- Table parsing errors

**Solutions**:
- Use clearer source materials
- Manually review and edit questions
- Provide better-formatted documents

#### Table Data Not Extracted

**Symptoms**: Questions with tables don't have `data` field

**Possible Causes**:
- Table format not recognized
- AI didn't detect table structure
- Schema validation failed

**Solutions**:
- Ensure tables have clear borders and headers
- Try simpler table formats
- Check console for schema validation errors

### API Key Issues

#### Invalid API Key

**Error**: 401 Unauthorized

**Solutions**:
- Verify key in `.env.local` matches Google AI Studio
- Regenerate API key if compromised
- Check for whitespace in key
- Restart dev server after updating

#### Quota Exceeded

**Error**: 429 Too Many Requests

**Solutions**:
- Wait for quota reset (usually 1 minute or 24 hours)
- Upgrade to paid tier
- Implement request caching
- Reduce request frequency

### Browser Compatibility

#### Safari Issues

**Symptoms**: Audio doesn't play in Safari

**Solution**:
```typescript
const audioContext = new (
  window.AudioContext ||
  (window as any).webkitAudioContext
)({ sampleRate: 24000 });
```

#### Mobile Issues

**Symptoms**: Features don't work on mobile

**Checklist**:
- [ ] Audio requires user interaction to start
- [ ] File upload may have size limits
- [ ] Touch events for canvas

---

## Best Practices

### Performance

1. **Debounce API Calls**:
   ```typescript
   const debouncedSpeak = debounce(speak, 500);
   ```

2. **Cache Responses**:
   ```typescript
   const audioCache = new Map<string, AudioBuffer>();
   ```

3. **Optimize File Sizes**:
   - Compress images before upload
   - Limit PDF page count
   - Resize images to reasonable dimensions

### Error Handling

1. **User-Friendly Messages**:
   ```typescript
   catch (error) {
     setError("Something went wrong. Please try again.");
     console.error("Detailed error:", error);
   }
   ```

2. **Retry Logic**:
   ```typescript
   const retryWithExponentialBackoff = async (fn, maxRetries = 3) => {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await fn();
       } catch (error) {
         if (i === maxRetries - 1) throw error;
         await new Promise(resolve => setTimeout(resolve, 2 ** i * 1000));
       }
     }
   };
   ```

### Security

1. **Validate File Types**:
   ```typescript
   const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
   if (!allowedTypes.includes(file.type)) {
     throw new Error("Unsupported file type");
   }
   ```

2. **Limit File Sizes**:
   ```typescript
   const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
   if (file.size > MAX_FILE_SIZE) {
     throw new Error("File too large");
   }
   ```

3. **Sanitize Extracted Data**:
   ```typescript
   const sanitizeQuestion = (q: Question) => ({
     ...q,
     question: q.question.trim(),
     answer: q.answer.trim()
   });
   ```

---

**Last Updated**: 2026-01-06
**SDK Version**: @google/genai v1.27.0
**API Version**: Gemini 2.5
