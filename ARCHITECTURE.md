# Quiz Master Architecture

This document provides a comprehensive overview of the Quiz Master application architecture, design decisions, data flow, and system components.

## Table of Contents

- [System Overview](#system-overview)
- [Architecture Diagram](#architecture-diagram)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Data Flow](#data-flow)
- [State Management](#state-management)
- [Core Systems](#core-systems)
- [Design Decisions](#design-decisions)
- [Performance Considerations](#performance-considerations)
- [Security](#security)

## System Overview

Quiz Master is a single-page application (SPA) built with React and TypeScript that provides an interactive quiz experience enhanced with AI capabilities. The application integrates with Google's Gemini API for text-to-speech and intelligent question generation from images and PDFs.

### Key Characteristics

- **Client-Side Rendering**: All logic runs in the browser
- **AI-Powered**: Leverages Gemini API for TTS and vision capabilities
- **Stateful**: Manages complex state for quiz progress, UI, and gamification
- **Real-Time Feedback**: Immediate answer validation and visual feedback
- **Responsive**: Adapts to desktop, tablet, and mobile devices

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    React App                          │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │           App Component (App.tsx)               │  │  │
│  │  │                                                 │  │  │
│  │  │  • Quiz State Management                        │  │  │
│  │  │  • User Interaction Handling                    │  │  │
│  │  │  • Canvas Drawing Logic                         │  │  │
│  │  │  • Admin Panel Control                          │  │  │
│  │  │  • Gamification Features                        │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │           │                │                           │  │
│  │           ▼                ▼                           │  │
│  │  ┌────────────────┐  ┌────────────────┐              │  │
│  │  │ SpeakerIcon    │  │  Constants     │              │  │
│  │  │  Component     │  │  (Questions)   │              │  │
│  │  └────────────────┘  └────────────────┘              │  │
│  │           │                                            │  │
│  │           ▼                                            │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │       Gemini Service (geminiService.ts)         │  │  │
│  │  │                                                 │  │  │
│  │  │  • speak(text)                                  │  │  │
│  │  │  • generateQuestionsFromImage(file)             │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │           │                                            │  │
│  └───────────┼────────────────────────────────────────────┘  │
│              │                                               │
└──────────────┼───────────────────────────────────────────────┘
               │ HTTPS
               ▼
    ┌──────────────────────┐
    │   Google Gemini API  │
    │                      │
    │  • TTS Model         │
    │  • Vision Model      │
    └──────────────────────┘
```

## Technology Stack

### Frontend Framework
- **React 19.2.0**: Component-based UI framework
  - Hooks for state management (useState, useEffect, useCallback, useRef)
  - No external state management library (Redux, Zustand, etc.)
  - Functional components only

### Language
- **TypeScript 5.8.2**: Static typing for better developer experience
  - Strict type checking enabled
  - Type definitions in `types.ts`
  - Interface-based design

### Build Tool
- **Vite 6.2.0**: Fast development server and optimized production builds
  - Hot Module Replacement (HMR)
  - ESNext module support
  - Environment variable handling
  - Path alias support (`@/`)

### Styling
- **Tailwind CSS**: Utility-first CSS framework
  - Loaded via CDN (development convenience)
  - Dark mode support
  - Responsive design utilities
  - Custom color schemes

### AI Integration
- **Google Gemini SDK 1.27.0**: Client-side AI API access
  - `gemini-2.5-flash-preview-tts`: Text-to-speech generation
  - `gemini-2.5-pro`: Vision and question extraction

### Audio
- **Web Audio API**: Native browser audio playback
  - PCM audio decoding
  - AudioContext for playback control

### Canvas
- **HTML5 Canvas API**: Drawing workspace
  - Mouse and touch event support
  - 2D rendering context

## Project Structure

```
quiz-master/
├── src/                          # Source code (implicit - files at root)
│   ├── App.tsx                   # Main application component (507 lines)
│   ├── index.tsx                 # React entry point
│   ├── types.ts                  # TypeScript type definitions
│   ├── constants.ts              # Question data and constants
│   ├── components/
│   │   └── SpeakerIcon.tsx      # Audio indicator component
│   └── services/
│       └── geminiService.ts     # Gemini API integration layer
│
├── config/                       # Configuration files
│   ├── tsconfig.json            # TypeScript compiler options
│   ├── vite.config.ts           # Vite build configuration
│   └── .env.local               # Environment variables (not in repo)
│
├── public/                       # Static assets (served as-is)
│   └── index.html               # HTML template with import maps
│
├── docs/                         # Documentation
│   ├── README.md                # Getting started guide
│   ├── ARCHITECTURE.md          # This file
│   ├── COMPONENTS.md            # Component documentation
│   └── API.md                   # API integration details
│
└── package.json                 # Dependencies and scripts
```

## Data Flow

### Quiz Flow

```
1. App Initialization
   └─> Load questions from constants.ts or localStorage
   └─> Initialize state (currentQuestionIndex = 0)
   └─> Set appBackgroundColor from localStorage
   └─> Render first question

2. User Interaction
   ├─> Click Speaker Icon
   │   └─> geminiService.speak(question)
   │   └─> Generate audio via Gemini TTS API
   │   └─> Decode base64 PCM audio
   │   └─> Play audio through Web Audio API
   │
   ├─> Draw on Canvas
   │   └─> Handle mouse/touch events
   │   └─> Update canvas context with strokes
   │
   └─> Type Answer
       └─> Update userAnswer state
       └─> Validate answer in real-time
       └─> Update isCorrect state
       └─> Apply border color based on validation

3. Answer Submission
   └─> If correct:
       ├─> Show "Next Question" button
       ├─> Display interest reward (if enabled)
       └─> Wait for user to click "Next"
   └─> If incorrect:
       └─> Keep red border, allow retry

4. Next Question
   └─> Increment currentQuestionIndex
   └─> Reset userAnswer, isCorrect states
   └─> Clear canvas
   └─> Stop timer and restart (if enabled)

5. Quiz Completion
   └─> currentQuestionIndex === questions.length
   └─> Set isFinished = true
   └─> Show completion screen with "Start Over" button
```

### Admin Panel Flow

```
1. Password Entry
   └─> Listen for keydown events
   └─> Append to passwordInput state
   └─> If passwordInput === "admin":
       └─> Set showAdminPanel = true
       └─> Reset passwordInput

2. Admin Actions
   ├─> Change Background Color
   │   └─> Update appBackgroundColor state
   │   └─> Save to localStorage
   │
   ├─> Enable Interest Rewards
   │   └─> Set isInterestEnabled = true
   │   └─> Upload interest file
   │   └─> Store file URL in interestFileUrl
   │
   ├─> Enable Urgency Timer
   │   └─> Set isUrgencyEnabled = true
   │   └─> Set timerValue (default 180s)
   │   └─> Start countdown interval
   │
   └─> Generate Questions
       └─> Upload image/PDF file
       └─> Convert to base64
       └─> Call geminiService.generateQuestionsFromImage()
       └─> Parse JSON response
       └─> Replace questions state with generated questions
       └─> Reset quiz to question 0
```

### AI Integration Flow

```
Text-to-Speech:
User Click → speak(text) → Gemini API (TTS model)
             → Base64 PCM audio → AudioContext.decodeAudioData()
             → AudioBufferSourceNode → Play

Question Generation:
File Upload → Convert to base64 → generateQuestionsFromImage()
            → Gemini API (Vision model) → JSON schema validation
            → Parse questions → Update app state
```

## State Management

The application uses React's built-in `useState` hook for all state management. No external state management library is used.

### Core State Variables

| State Variable | Type | Purpose |
|----------------|------|---------|
| `currentQuestionIndex` | number | Tracks current question position (0-based) |
| `questions` | Question[] | Array of all quiz questions |
| `userAnswer` | string | User's typed answer for current question |
| `isCorrect` | boolean \| null | Answer validation result |
| `isFinished` | boolean | Whether quiz is complete |
| `appBackgroundColor` | string | Current background color theme |
| `isDrawing` | boolean | Canvas drawing state |
| `showAdminPanel` | boolean | Admin panel visibility |
| `isPasswordMode` | boolean | Password entry mode |
| `passwordInput` | string | Accumulated password characters |
| `isInterestEnabled` | boolean | Interest reward feature toggle |
| `isUrgencyEnabled` | boolean | Timer feature toggle |
| `timerValue` | number | Countdown timer value (seconds) |
| `selectedFile` | File \| null | Question generation file upload |
| `interestFile` | File \| null | Interest reward file |
| `interestFileUrl` | string | URL for reward media |
| `ttsError` | string \| null | TTS error message |
| `generationError` | string \| null | Question generation error |

### State Persistence

- **localStorage** is used for:
  - `appBackgroundColor`: Persists theme preference across sessions
  - Generated questions (implicit - could be added)

- **No database**: All state is client-side and ephemeral

## Core Systems

### 1. Quiz Engine

**Location**: `App.tsx` (lines 1-507)

**Responsibilities**:
- Question sequencing
- Answer validation
- Progress tracking
- Completion detection

**Key Functions**:
- `normalizeAnswer(answer: string)`: Removes whitespace and converts to lowercase
- Answer validation logic (inline in component)

**Validation Rules**:
- Case-insensitive comparison
- Whitespace trimming
- Special handling for question 12 (accepts both orders of addition)

### 2. Canvas Drawing System

**Location**: `App.tsx` (canvas event handlers)

**Features**:
- Mouse event support: `mousedown`, `mousemove`, `mouseup`
- Touch event support: `touchstart`, `touchmove`, `touchend`
- Continuous stroke rendering
- Canvas resize on window resize
- Clear functionality

**Implementation Details**:
```typescript
// Canvas context stored in useRef
const canvasRef = useRef<HTMLCanvasElement>(null);

// Drawing state
const [isDrawing, setIsDrawing] = useState(false);

// Event handlers calculate positions relative to canvas
const rect = canvas.getBoundingClientRect();
const x = e.clientX - rect.left;
const y = e.clientY - rect.top;
```

### 3. Text-to-Speech System

**Location**: `services/geminiService.ts:speak()`

**Flow**:
1. Call Gemini TTS API with question text
2. Receive base64-encoded PCM audio
3. Decode base64 to binary
4. Use Web Audio API to decode PCM
5. Play audio through AudioBufferSourceNode

**Error Handling**:
- API errors caught and logged
- User-friendly error messages displayed
- Graceful degradation (quiz continues without audio)

**Audio Format**:
- Sample rate: 24000 Hz
- Channels: Mono (1)
- Encoding: PCM 16-bit

### 4. AI Question Generation

**Location**: `services/geminiService.ts:generateQuestionsFromImage()`

**Process**:
1. Accept file (image or PDF) as base64
2. Send to Gemini Vision API with extraction prompt
3. Use structured output (JSON schema) for consistent parsing
4. Extract questions, answers, and optional table data
5. Return typed Question[] array

**Schema Validation**:
```typescript
{
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      id: { type: "INTEGER" },
      question: { type: "STRING" },
      answer: { type: "STRING" },
      data: { type: "OBJECT", nullable: true }
    }
  }
}
```

### 5. Gamification System

#### Interest Rewards
- **Purpose**: Motivate correct answers with media rewards
- **Supported Formats**: Images, videos, audio
- **Display**: Shown after correct answer before "Next Question"
- **Storage**: File stored as blob URL in state

#### Urgency Timer
- **Purpose**: Add time pressure to quiz
- **Implementation**: `setInterval` with 1-second countdown
- **Visual Feedback**: Color changes based on time remaining
  - Green: > 50% time left
  - Yellow: 20-50% time left
  - Red: < 20% time left
- **Auto-advance**: Moves to next question when timer reaches 0

### 6. Admin System

**Access Control**: Password-based (password: "admin")
**Entry Method**: Keyboard listener accumulates characters
**Features**:
- Background color picker (4 presets)
- Interest reward file upload
- Timer configuration
- Question generation from files

**Security Note**: This is a simple client-side password. For production, use proper authentication.

## Design Decisions

### Why React Without State Management Library?

**Decision**: Use built-in `useState` instead of Redux, Zustand, etc.

**Rationale**:
- State is mostly local to App component
- No complex state sharing across deeply nested components
- Simpler mental model for educational application
- Reduced bundle size and dependencies
- Easier to understand for beginners

### Why Vite Over Create React App?

**Decision**: Use Vite as build tool

**Rationale**:
- Faster development server startup
- Near-instant HMR
- Modern ESNext support
- Smaller, more maintainable config
- Better performance for TypeScript

### Why CDN for Tailwind and React?

**Decision**: Load Tailwind and React via CDN using import maps

**Rationale**:
- Faster initial development setup
- Reduced npm install time
- Browser caching benefits
- Smaller git repository
- Trade-off: Slightly larger initial page load

### Why Client-Side API Key?

**Decision**: Store Gemini API key in environment variable accessible to client

**Rationale**:
- Simplifies architecture (no backend server)
- Suitable for personal/educational use
- Quick deployment
- **Warning**: Not suitable for production with billing concerns

**Production Alternative**: Use a backend proxy to secure API key

### Why localStorage for Persistence?

**Decision**: Use localStorage instead of database

**Rationale**:
- No backend required
- Instant reads/writes
- Sufficient for user preferences
- No server costs

**Limitation**: Data is per-browser, not per-user across devices

## Performance Considerations

### Optimization Strategies

1. **Canvas Rendering**
   - Only redraw on mouse/touch move while drawing
   - Use `requestAnimationFrame` for smooth rendering
   - Clear canvas efficiently with `clearRect()`

2. **Audio Playback**
   - Decode audio asynchronously
   - Reuse AudioContext instance
   - Clean up audio sources after playback

3. **Re-render Optimization**
   - Minimal state updates
   - Event handlers use `useCallback` where appropriate
   - Canvas ref to avoid re-renders

4. **API Calls**
   - Error handling prevents infinite retries
   - Loading states prevent duplicate requests
   - Timeouts for long-running requests (could be added)

### Bundle Size

- React (CDN): ~135 KB (gzipped)
- Gemini SDK (CDN): ~50 KB (gzipped)
- Tailwind (CDN): ~80 KB (gzipped)
- Application code: ~15 KB (gzipped)

**Total**: ~280 KB initial load (with CDN caching benefits)

## Security

### Current Security Posture

**Strengths**:
- No user authentication or personal data storage
- No server-side vulnerabilities
- TypeScript provides type safety
- No SQL injection (no database)
- No XSS vulnerabilities in React (JSX escaping)

**Weaknesses**:
- API key exposed to client (visible in DevTools)
- No rate limiting on API calls
- No input sanitization on question generation
- Password stored in plaintext in code

### Security Recommendations for Production

1. **API Key Protection**
   - Implement backend proxy for Gemini API calls
   - Use server-side authentication
   - Implement rate limiting

2. **Input Validation**
   - Sanitize file uploads
   - Validate file types and sizes
   - Limit upload frequency

3. **Authentication**
   - Replace hardcoded password with proper auth
   - Use JWT or session-based authentication
   - Implement role-based access control

4. **Content Security Policy**
   - Add CSP headers to prevent XSS
   - Restrict inline scripts
   - Whitelist allowed domains

5. **HTTPS**
   - Always serve over HTTPS in production
   - Use secure cookies if authentication is added

## Future Architecture Considerations

### Scalability

To scale this application:

1. **Add Backend**
   - Node.js/Express or Next.js API routes
   - Secure API key storage
   - User authentication and session management
   - Question database (PostgreSQL, MongoDB)

2. **Multi-User Support**
   - User accounts with progress tracking
   - Leaderboards and analytics
   - Question sharing between users

3. **Real-Time Features**
   - WebSocket for live multiplayer quizzes
   - Real-time leaderboard updates
   - Live quiz sessions with multiple participants

4. **Mobile Apps**
   - React Native version for iOS/Android
   - Shared business logic
   - Native drawing performance

### Extensibility

The architecture supports:
- Custom question types (multiple choice, fill-in-blank, etc.)
- Plugin system for different subjects (math, science, history)
- Theme system for custom branding
- Analytics and progress tracking
- Social features (sharing, challenges)

---

**Last Updated**: 2026-01-06
**Version**: 1.0.0
