# Quiz Master

An interactive, AI-powered quiz application built with React and Google's Gemini API. Quiz Master provides an engaging learning experience with text-to-speech, drawing workspace, gamification features, and AI-powered question generation from images and PDFs.

<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

## Features

- **Interactive Quiz Interface**: Sequential question presentation with real-time answer validation
- **Text-to-Speech**: AI-powered audio playback of questions using Google's Gemini TTS
- **Drawing Canvas**: Work out solutions with mouse or touch input
- **Smart Answer Validation**: Real-time feedback with color-coded visual indicators
- **AI Question Generation**: Upload images or PDFs to automatically extract questions
- **Gamification Features**:
  - Interest Rewards: Display media (images, videos, audio) after correct answers
  - Urgency Timer: Countdown timer with color-coded urgency levels
- **Admin Panel**: Password-protected settings for customization
- **Dark Mode**: Full dark theme support
- **Responsive Design**: Mobile-friendly interface

## Tech Stack

- **Frontend**: React 19.2.0 + TypeScript
- **Build Tool**: Vite 6.2.0
- **Styling**: Tailwind CSS
- **AI Integration**: Google Gemini API
  - `gemini-2.5-flash-preview-tts` for text-to-speech
  - `gemini-2.5-pro` for vision and question generation

## Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn package manager
- Google Gemini API key ([Get one here](https://ai.google.dev/))

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd quiz-master
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   Create a `.env.local` file in the root directory:
   ```bash
   GEMINI_API_KEY=your_api_key_here
   ```
   Replace `your_api_key_here` with your actual Gemini API key.

4. **Run the development server**:
   ```bash
   npm run dev
   ```

5. **Open your browser**:
   Navigate to `http://localhost:3000`

## Usage

### Basic Quiz Flow

1. **Start the Quiz**: The app loads with the first question
2. **Listen to Questions**: Click the speaker icon to hear the question read aloud
3. **Show Your Work**: Use the drawing canvas to work out solutions
4. **Submit Answers**: Type your answer in the input field
5. **Get Feedback**: Border color changes based on correctness:
   - 🟢 Green: Correct answer
   - 🔴 Red: Incorrect answer
   - 🔵 Blue: No answer yet
6. **Progress**: Click "Next Question" after answering correctly
7. **Complete**: Finish all questions to see the completion screen

### Admin Panel

Access the admin panel by pressing the `a` key repeatedly to spell "admin":

1. **Background Colors**: Choose from 4 preset background themes
2. **Interest Rewards**: Enable/disable reward media after correct answers
   - Upload images, videos, or audio files as rewards
3. **Urgency Timer**: Set a countdown timer for added challenge
   - Default: 3 minutes (180 seconds)
   - Color-coded: Green → Yellow → Red as time runs out
4. **Generate Questions**: Upload images or PDFs to create new quiz questions
   - AI analyzes the file and extracts questions with answers
   - Supports tables and complex formatting

### Keyboard Controls

- Type `admin` to access the admin panel
- Click outside the admin panel to close it

## Project Structure

```
quiz-master/
├── App.tsx                    # Main application component
├── index.tsx                  # React entry point
├── index.html                 # HTML template
├── types.ts                   # TypeScript type definitions
├── constants.ts               # Default quiz questions
├── components/
│   └── SpeakerIcon.tsx       # Audio indicator icon
├── services/
│   └── geminiService.ts      # Gemini API integration
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── vite.config.ts            # Vite build configuration
└── .env.local                # Environment variables (not in repo)
```

## Building for Production

Build the application for production:

```bash
npm run build
```

The optimized build will be in the `dist/` directory.

Preview the production build locally:

```bash
npm run preview
```

## Deployment

View your app in AI Studio: https://ai.studio/apps/drive/1tIe9apIaR0J9G8ygela3tLfYEnBkUpkX

This app can be deployed to any static hosting service:

- **Vercel**: `vercel deploy`
- **Netlify**: Drag and drop the `dist/` folder
- **GitHub Pages**: Use the `gh-pages` package
- **Firebase Hosting**: `firebase deploy`

**Important**: Make sure to set the `GEMINI_API_KEY` environment variable in your hosting platform's settings.

## Configuration

### Server support recommendations

Support recommendations run only in Firebase Functions and always require teacher review. The
Functions emulator uses the deterministic fake provider, so local development and tests do not
send student observations to OpenAI.

For a production deployment that should use OpenAI:

1. Set the Functions runtime variable `AI_PROVIDER=openai`.
2. Create the server-only secret with `firebase functions:secrets:set OPENAI_API_KEY`.
3. Optionally set `OPENAI_RECOMMENDATION_MODEL` to override the documented default model.

Never put `OPENAI_API_KEY` in a `VITE_*` variable or any client-side file. If the live provider is
unavailable or its structured result fails validation, the teacher is sent to manual support setup;
no recommendation is automatically activated.

### Tailwind CSS

Tailwind is loaded via CDN in `index.html`. For production, consider:
1. Installing Tailwind locally: `npm install -D tailwindcss`
2. Creating a `tailwind.config.js`
3. Removing the CDN link

### Import Maps

The app uses import maps (defined in `index.html`) for React and Gemini SDK. This approach:
- Reduces bundle size
- Allows CDN caching
- Simplifies dependency management

For traditional bundling, remove import maps and install packages via npm.

## API Usage

The app uses two Gemini API features:

### Text-to-Speech
- **Model**: `gemini-2.5-flash-preview-tts`
- **Voice**: Kore
- **Output**: 24kHz mono PCM audio
- **Cost**: Varies by usage (check Gemini pricing)

### Vision & Question Generation
- **Model**: `gemini-2.5-pro`
- **Input**: Images (JPEG, PNG, WebP) or PDFs
- **Output**: Structured JSON with questions and answers
- **Cost**: Based on input tokens (varies by file size)

## Customization

### Adding Custom Questions

Edit `constants.ts` to add or modify questions:

```typescript
export const QUESTIONS: Question[] = [
  {
    id: 1,
    question: "What is 5 + 7?",
    answer: "12"
  },
  // Add more questions...
];
```

### Styling

The app uses Tailwind CSS classes. Key customization points:
- Background colors: See admin panel options in `App.tsx`
- Component styling: Modify className props in components
- Global styles: Add to `index.html` style tag

## Troubleshooting

### API Key Issues
- Ensure `.env.local` exists and contains `GEMINI_API_KEY`
- Restart the dev server after adding the API key
- Check API key is valid in Google AI Studio

### TTS Not Working
- Check browser console for errors
- Verify API key has TTS permissions
- Ensure audio playback is allowed in browser settings

### Question Generation Fails
- Verify uploaded file is a valid image or PDF
- Check file size (large files may timeout)
- Ensure file contains readable text/questions

### Canvas Not Responsive
- Try refreshing the page
- Check browser console for errors
- Verify touch events are enabled on mobile

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is provided as-is for educational purposes.

## Support

For issues or questions:
- Check the [ARCHITECTURE.md](ARCHITECTURE.md) for system details
- Review [COMPONENTS.md](COMPONENTS.md) for component documentation
- See [API.md](API.md) for API integration details

## Acknowledgments

- Built with [React](https://react.dev/)
- Powered by [Google Gemini API](https://ai.google.dev/)
- Styled with [Tailwind CSS](https://tailwindcss.com/)
