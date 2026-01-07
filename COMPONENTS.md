# Component Documentation

This document provides detailed documentation for all React components in the Quiz Master application.

## Table of Contents

- [App Component](#app-component)
- [SpeakerIcon Component](#speakericon-component)
- [Component Tree](#component-tree)
- [Props and State](#props-and-state)
- [Event Handlers](#event-handlers)
- [Hooks Usage](#hooks-usage)

---

## App Component

**File**: `App.tsx` (507 lines)
**Type**: Functional Component (React.FC)
**Purpose**: Main application component that manages the entire quiz experience

### Overview

The App component is the root component of the Quiz Master application. It handles all quiz logic, state management, user interactions, admin features, and gamification systems.

### State Management

The App component manages 21 state variables using React's `useState` hook:

#### Quiz State

| State Variable | Type | Initial Value | Purpose |
|----------------|------|---------------|---------|
| `questions` | `Question[]` | `QUESTIONS` | Array of all quiz questions |
| `currentQuestionIndex` | `number` | `0` | Current question position (0-based) |
| `userAnswer` | `string` | `''` | User's typed answer |
| `isCorrect` | `boolean` | `false` | Whether current answer is correct |
| `isFinished` | `boolean` | `false` | Whether quiz is complete |

#### UI/UX State

| State Variable | Type | Initial Value | Purpose |
|----------------|------|---------------|---------|
| `isLoadingTTS` | `boolean` | `false` | TTS audio generation loading state |
| `ttsError` | `string \| null` | `null` | TTS error message |
| `isDrawing` | `boolean` | `false` | Canvas drawing state |
| `appBackgroundColor` | `string` | `'bg-gray-100 dark:bg-gray-900'` | Current background theme |

#### Admin State

| State Variable | Type | Initial Value | Purpose |
|----------------|------|---------------|---------|
| `isPasswordMode` | `boolean` | `false` | Password entry mode active |
| `passwordInput` | `string` | `''` | Accumulated password characters |
| `showAdminPanel` | `boolean` | `false` | Admin panel visibility |
| `selectedFile` | `File \| null` | `null` | Uploaded file for question generation |
| `isGenerating` | `boolean` | `false` | Question generation loading state |
| `generationError` | `string \| null` | `null` | Question generation error message |

#### Gamification State

| State Variable | Type | Initial Value | Purpose |
|----------------|------|---------------|---------|
| `isInterestEnabled` | `boolean` | `false` | Interest reward feature enabled |
| `interestFile` | `File \| null` | `null` | Uploaded reward media file |
| `interestFileUrl` | `string \| null` | `null` | URL for reward media display |
| `showInterestReward` | `boolean` | `false` | Show reward screen |
| `isUrgencyEnabled` | `boolean` | `false` | Timer feature enabled |
| `urgencyTime` | `number` | `180` | Timer duration in seconds |
| `timerValue` | `number` | `180` | Current countdown value |

### Refs

| Ref | Type | Purpose |
|-----|------|---------|
| `canvasRef` | `React.RefObject<HTMLCanvasElement>` | Reference to canvas element for drawing |

### Key Functions

#### `fileToBase64(file: File): Promise<string>`

**Purpose**: Converts a File object to base64 string
**Location**: `App.tsx:7-18`
**Returns**: Base64-encoded file content (without MIME type prefix)
**Usage**: Used for uploading files to Gemini API

```typescript
const base64 = await fileToBase64(uploadedFile);
```

#### `clearCanvas()`

**Purpose**: Clears all drawings from the canvas
**Location**: `App.tsx:55-63`
**Type**: `useCallback` hook
**Dependencies**: None

```typescript
const clearCanvas = useCallback(() => {
  const canvas = canvasRef.current;
  if (canvas) {
    const context = canvas.getContext('2d');
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
}, []);
```

#### `resetQuiz(newQuestions: Question[])`

**Purpose**: Reset quiz to initial state with new questions
**Location**: `App.tsx:65-72`
**Parameters**:
  - `newQuestions`: Array of Question objects to use

**Side Effects**:
- Resets question index to 0
- Clears user answer and correctness state
- Clears canvas drawing

#### `handleNextQuestion()`

**Purpose**: Advance to next question or finish quiz
**Location**: `App.tsx:74-84`
**Type**: `useCallback` hook
**Dependencies**: `currentQuestionIndex`, `questions.length`, `clearCanvas`

**Logic**:
- Hides interest reward if shown
- If more questions exist, increment index and reset state
- If last question, set `isFinished` to true

#### `normalizeAnswer(answer: string): string`

**Purpose**: Normalize answer for comparison
**Location**: Inline in component (around line 200)
**Returns**: Lowercase string with whitespace removed

```typescript
const normalizeAnswer = (answer: string) =>
  answer.toLowerCase().replace(/\s+/g, '');
```

#### `handleAnswerChange(e: React.ChangeEvent<HTMLInputElement>)`

**Purpose**: Handle answer input changes and validate
**Location**: Inline event handler

**Logic**:
1. Update `userAnswer` state with input value
2. Normalize both user answer and correct answer
3. Special case for question 12 (accepts both addition orders)
4. Set `isCorrect` based on comparison
5. Show interest reward if enabled and answer is correct

#### `handleSpeak()`

**Purpose**: Trigger text-to-speech for current question
**Location**: Inline event handler

**Flow**:
1. Set `isLoadingTTS` to true
2. Call `speak(currentQuestion.question)`
3. Handle success or error
4. Set `isLoadingTTS` to false

#### `handleFileUpload(event: React.ChangeEvent<HTMLInputElement>)`

**Purpose**: Handle file selection for question generation
**Location**: Inline event handler

**Flow**:
1. Extract file from input event
2. Store in `selectedFile` state
3. Clear any previous generation errors

#### `handleGenerateQuestions()`

**Purpose**: Generate questions from uploaded file using Gemini API
**Location**: Inline event handler

**Flow**:
1. Validate file is selected
2. Convert file to base64
3. Call `generateQuestionsFromImage(base64, mimeType)`
4. Parse response and update questions
5. Reset quiz to question 0
6. Handle errors

#### Canvas Event Handlers

**Mouse Events**:
- `handleMouseDown`: Start drawing on mouse press
- `handleMouseMove`: Draw continuous line while mouse is pressed
- `handleMouseUp`: Stop drawing on mouse release

**Touch Events**:
- `handleTouchStart`: Start drawing on touch
- `handleTouchMove`: Draw continuous line while touching
- `handleTouchEnd`: Stop drawing on touch end

**Implementation Pattern**:
```typescript
const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
  const canvas = canvasRef.current;
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const context = canvas.getContext('2d');
  if (context) {
    context.beginPath();
    context.moveTo(x, y);
    setIsDrawing(true);
  }
};
```

### Effects (useEffect)

#### Timer Countdown Effect

**Purpose**: Countdown urgency timer and auto-advance
**Location**: `App.tsx:87-103`
**Dependencies**: `isUrgencyEnabled`, `isFinished`, `isCorrect`

**Logic**:
- Only runs if urgency is enabled and question is active
- Decrements `timerValue` every second
- Calls `handleNextQuestion()` when timer reaches 0
- Cleanup: Clears interval on unmount or dependency change

#### Timer Reset Effect

**Purpose**: Reset timer when moving to new question
**Location**: `App.tsx:105-109`
**Dependencies**: `currentQuestionIndex`, `urgencyTime`

**Logic**:
- Resets `timerValue` to `urgencyTime` when question changes

#### Canvas Resize Effect

**Purpose**: Adjust canvas size when window resizes
**Location**: `App.tsx:111-124`
**Dependencies**: None

**Logic**:
- Sets canvas dimensions to match parent container
- Adds event listener for window resize
- Cleanup: Removes event listener on unmount

#### Background Color Persistence Effect

**Purpose**: Save/load background color from localStorage
**Location**: `App.tsx:126-137`
**Dependencies**: `appBackgroundColor`

**Logic**:
- On mount: Load saved color from localStorage
- On change: Save color to localStorage

#### Interest File URL Effect

**Purpose**: Create blob URL for uploaded interest file
**Location**: `App.tsx:139-149`
**Dependencies**: `interestFile`

**Logic**:
- Creates URL using `URL.createObjectURL()`
- Cleanup: Revokes URL to prevent memory leaks

#### Password Entry Effect

**Purpose**: Listen for keyboard input to enter admin password
**Location**: `App.tsx:151-175`
**Dependencies**: None

**Logic**:
- Listens for `keydown` events
- Accumulates characters in `passwordInput`
- If "admin" is typed, shows admin panel
- Resets password input after timeout
- Cleanup: Removes event listener on unmount

### Render Structure

```jsx
<div className={appBackgroundColor}>
  {/* Main Quiz Interface */}
  {!isFinished && (
    <div className="quiz-container">
      {/* Question Header */}
      <div className="question-header">
        {/* Question text */}
        {/* Speaker icon for TTS */}
        {/* Progress indicator */}
      </div>

      {/* Table (if question has data) */}
      {currentQuestion.data && <table>...</table>}

      {/* Drawing Canvas */}
      <canvas ref={canvasRef} />
      <button onClick={clearCanvas}>Clear Canvas</button>

      {/* Answer Input */}
      <input
        value={userAnswer}
        onChange={handleAnswerChange}
        className={/* color based on isCorrect */}
      />

      {/* Next Button (if correct) */}
      {isCorrect && <button onClick={handleNextQuestion}>Next</button>}

      {/* Interest Reward Display */}
      {showInterestReward && <div>{/* Media display */}</div>}

      {/* Urgency Timer */}
      {isUrgencyEnabled && <div>{/* Timer display */}</div>}
    </div>
  )}

  {/* Completion Screen */}
  {isFinished && (
    <div>
      <h1>Congratulations!</h1>
      <button onClick={() => resetQuiz(QUESTIONS)}>Start Over</button>
    </div>
  )}

  {/* Admin Panel Modal */}
  {showAdminPanel && (
    <div className="admin-panel">
      {/* Background color options */}
      {/* Interest reward settings */}
      {/* Urgency timer settings */}
      {/* Question generation */}
    </div>
  )}
</div>
```

### Styling Approach

The component uses:
- **Tailwind CSS utility classes** for all styling
- **Dynamic classes** based on state (e.g., border color for answer validation)
- **Dark mode support** via Tailwind's `dark:` prefix
- **Responsive design** with Tailwind breakpoints

### Answer Validation Logic

**Location**: Inline in `handleAnswerChange`

```typescript
const normalized = normalizeAnswer(userAnswer);
const correctAnswer = normalizeAnswer(currentQuestion.answer);

// Special case for question 12
if (currentQuestion.id === 12) {
  const isCorrect =
    normalized === correctAnswer ||
    normalized === normalizeAnswer("76.38 + 25.14");
  setIsCorrect(isCorrect);
} else {
  setIsCorrect(normalized === correctAnswer);
}
```

**Features**:
- Case-insensitive comparison
- Whitespace-insensitive
- Special handling for commutative addition (question 12)

### Background Color Options

Available themes (set in admin panel):

```typescript
const colorOptions = [
  'bg-gray-100 dark:bg-gray-900',    // Default gray
  'bg-blue-100 dark:bg-blue-900',    // Blue
  'bg-green-100 dark:bg-green-900',  // Green
  'bg-purple-100 dark:bg-purple-900' // Purple
];
```

### Timer Color Coding

```typescript
const getTimerColor = () => {
  const percentRemaining = (timerValue / urgencyTime) * 100;
  if (percentRemaining > 50) return 'text-green-500';
  if (percentRemaining > 20) return 'text-yellow-500';
  return 'text-red-500';
};
```

---

## SpeakerIcon Component

**File**: `components/SpeakerIcon.tsx` (25 lines)
**Type**: Functional Component (React.FC)
**Purpose**: Display audio/speaker icon with loading state

### Overview

A simple presentational component that renders either a spinning loader (during TTS generation) or a static speaker icon (when ready to play).

### Props

```typescript
interface SpeakerIconProps {
  isLoading: boolean;   // Whether TTS is currently loading
  className?: string;   // Optional CSS classes for sizing/styling
}
```

### Default Props

```typescript
{
  className: "w-6 h-6"  // Default size: 24x24 pixels
}
```

### Behavior

#### Loading State (`isLoading = true`)

Renders an animated spinning circle:

```jsx
<svg className={`${className} animate-spin text-blue-500`}>
  {/* Spinner SVG paths */}
</svg>
```

**Visual**: Blue spinning loader indicating audio generation in progress

#### Ready State (`isLoading = false`)

Renders a static speaker icon with sound waves:

```jsx
<svg className={className}>
  {/* Speaker with sound waves SVG path */}
</svg>
```

**Visual**: Speaker icon indicating ready to play audio

### Usage Example

```typescript
// In App component
<button onClick={handleSpeak}>
  <SpeakerIcon isLoading={isLoadingTTS} className="w-8 h-8" />
</button>
```

### Styling

- Uses Tailwind's `animate-spin` for loading animation
- Blue color (`text-blue-500`) for loading state
- Inherits text color for ready state (customizable via parent)
- SVG viewBox: `0 0 24 24` for proper scaling

### Accessibility Considerations

**Current State**: No ARIA labels or accessibility features

**Recommended Improvements**:
```jsx
<button
  onClick={handleSpeak}
  aria-label={isLoadingTTS ? "Generating audio..." : "Play question audio"}
>
  <SpeakerIcon isLoading={isLoadingTTS} />
</button>
```

---

## Component Tree

```
App
├── Quiz Interface (conditional: !isFinished)
│   ├── Question Header
│   │   ├── Question Text
│   │   ├── SpeakerIcon (button)
│   │   └── Progress Text
│   ├── Table (conditional: currentQuestion.data exists)
│   ├── Canvas (drawing workspace)
│   ├── Clear Button
│   ├── Answer Input
│   ├── Next Button (conditional: isCorrect)
│   ├── Interest Reward (conditional: showInterestReward)
│   │   ├── Image (for image files)
│   │   ├── Video (for video files)
│   │   └── Audio (for audio files)
│   └── Timer Display (conditional: isUrgencyEnabled)
├── Completion Screen (conditional: isFinished)
│   ├── Congratulations Message
│   └── Start Over Button
└── Admin Panel Modal (conditional: showAdminPanel)
    ├── Close Button
    ├── Background Color Selector
    ├── Interest Reward Settings
    │   ├── Enable Toggle
    │   └── File Upload
    ├── Urgency Timer Settings
    │   ├── Enable Toggle
    │   └── Time Input
    └── Question Generation
        ├── File Upload
        ├── Generate Button
        └── Error Display
```

---

## Props and State

### Global State Flow

```
QUESTIONS (constants.ts)
    ↓
App.questions state
    ↓
currentQuestionIndex
    ↓
currentQuestion (derived)
    ↓
Render question UI
    ↓
User interaction
    ↓
State updates
    ↓
Re-render
```

### State Update Patterns

#### Quiz Progression

```
User types answer
    → handleAnswerChange()
    → setUserAnswer()
    → Validate answer
    → setIsCorrect()
    → (if correct) Show Next button
    → handleNextQuestion()
    → setCurrentQuestionIndex()
    → Reset states
```

#### Admin Panel

```
User types "admin"
    → keydown listener
    → Accumulate in passwordInput
    → Match "admin"
    → setShowAdminPanel(true)
    → Render modal
    → User makes changes
    → Update relevant states
    → Click outside
    → setShowAdminPanel(false)
```

---

## Event Handlers

### Summary Table

| Handler Name | Event Type | Purpose |
|--------------|------------|---------|
| `handleAnswerChange` | `onChange` (input) | Update and validate answer |
| `handleNextQuestion` | `onClick` (button) | Advance to next question |
| `handleSpeak` | `onClick` (button) | Trigger TTS |
| `handleFileUpload` | `onChange` (file input) | Store uploaded file |
| `handleGenerateQuestions` | `onClick` (button) | Generate questions from file |
| `handleMouseDown` | `onMouseDown` (canvas) | Start drawing |
| `handleMouseMove` | `onMouseMove` (canvas) | Continue drawing stroke |
| `handleMouseUp` | `onMouseUp` (canvas) | Stop drawing |
| `handleTouchStart` | `onTouchStart` (canvas) | Start touch drawing |
| `handleTouchMove` | `onTouchMove` (canvas) | Continue touch drawing |
| `handleTouchEnd` | `onTouchEnd` (canvas) | Stop touch drawing |
| `clearCanvas` | `onClick` (button) | Clear canvas |
| Password listener | `keydown` (window) | Detect admin password |
| Window resize | `resize` (window) | Adjust canvas size |

---

## Hooks Usage

### useState

**Count**: 21 state variables
**Purpose**: Manage all application state
**Pattern**: Simple state updates with setter functions

### useEffect

**Count**: 6 effects
**Purposes**:
1. Timer countdown
2. Timer reset on question change
3. Canvas resize on window resize
4. Background color persistence
5. Interest file URL creation
6. Password entry listener

**Cleanup**: All effects with event listeners or intervals properly clean up

### useCallback

**Count**: 2 callbacks
**Functions**:
1. `clearCanvas` - No dependencies, stable reference
2. `handleNextQuestion` - Depends on `currentQuestionIndex`, `questions.length`, `clearCanvas`

**Purpose**: Prevent unnecessary re-renders and maintain stable function references

### useRef

**Count**: 1 ref
**Usage**: `canvasRef` for direct canvas DOM manipulation
**Pattern**: Access current canvas element for drawing operations

---

## Performance Considerations

### Optimization Techniques

1. **useCallback for Stable References**
   - Prevents re-creation of functions on every render
   - Important for effects that depend on functions

2. **Canvas Ref for Direct Manipulation**
   - Avoids triggering React re-renders for drawing operations
   - Direct DOM manipulation for performance-critical drawing

3. **Conditional Rendering**
   - Only renders active UI sections
   - Admin panel, interest rewards, timer only when needed

4. **Cleanup in Effects**
   - Prevents memory leaks
   - Removes event listeners and clears intervals

### Potential Improvements

1. **Memoization**
   - Use `useMemo` for expensive calculations (e.g., timer color)
   - Use `React.memo` for SpeakerIcon if props change frequently

2. **Debouncing**
   - Debounce answer validation if performance issues arise
   - Throttle canvas drawing for smoother performance

3. **Code Splitting**
   - Lazy load admin panel component
   - Lazy load Gemini service for smaller initial bundle

---

## Testing Recommendations

### Unit Tests

**App Component**:
- [ ] Quiz progression (next question, completion)
- [ ] Answer validation (correct, incorrect, special cases)
- [ ] Canvas operations (draw, clear)
- [ ] Timer countdown and auto-advance
- [ ] Admin panel access and controls
- [ ] File upload and question generation

**SpeakerIcon Component**:
- [ ] Renders loading state correctly
- [ ] Renders ready state correctly
- [ ] Applies custom className

### Integration Tests

- [ ] Full quiz flow (start to finish)
- [ ] Admin panel workflow (enable features, generate questions)
- [ ] TTS integration (mock Gemini API)
- [ ] Question generation integration (mock Gemini API)

### E2E Tests

- [ ] User completes quiz
- [ ] User accesses admin panel
- [ ] User generates questions from file
- [ ] Timer expires and auto-advances
- [ ] Interest reward displays after correct answer

---

## Accessibility

### Current Accessibility Features

- Semantic HTML (headings, buttons, inputs)
- Focus management on interactive elements
- Keyboard navigation (implicit via native elements)

### Accessibility Gaps

1. **Missing ARIA Labels**
   - Speaker icon button needs `aria-label`
   - Canvas needs `aria-label` or alternative description
   - Timer needs `aria-live` for screen reader announcements

2. **Keyboard Navigation**
   - Admin panel should support Escape key to close
   - Canvas drawing not accessible (inherent limitation)

3. **Focus Management**
   - Focus should move to next question button when answer is correct
   - Focus should return to trigger when closing admin panel

4. **Screen Reader Support**
   - Question progress not announced
   - Timer countdown not announced
   - Correct/incorrect feedback not announced

### Recommended Improvements

```jsx
// Speaker button
<button
  onClick={handleSpeak}
  aria-label={isLoadingTTS ? "Generating audio..." : "Play question audio"}
  aria-live="polite"
>
  <SpeakerIcon isLoading={isLoadingTTS} />
</button>

// Timer
<div
  className={getTimerColor()}
  aria-live="polite"
  aria-atomic="true"
>
  Time: {formatTime(timerValue)}
</div>

// Answer input
<input
  value={userAnswer}
  onChange={handleAnswerChange}
  aria-label="Your answer"
  aria-invalid={isCorrect === false}
  aria-describedby="answer-feedback"
/>
<div id="answer-feedback" aria-live="polite">
  {isCorrect === true && "Correct!"}
  {isCorrect === false && "Incorrect, try again"}
</div>
```

---

**Last Updated**: 2026-01-06
**Component Count**: 2
**Total Lines**: ~532
