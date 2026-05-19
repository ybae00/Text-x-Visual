# CoCreate — Draw with AI

A live collaborative drawing canvas where you and AI create artwork together in real-time.

## How It Works

1. Pick a brush (pen, pencil, marker, eraser, or fill)
2. Start drawing on the canvas
3. After you pause, the AI analyzes your drawing and adds to it collaboratively
4. You draw, AI draws — together on a shared canvas
5. Toggle the AI layer on/off to see just your strokes

## Setup

### 1. Get a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Sign in with your Google account
3. Click **"Get API Key"** in the left sidebar
4. Click **"Create API key"** → select or create a Google Cloud project
5. Copy the generated key

### 2. Configure the Project

```bash
cp .env.example .env
```

Open `.env` and paste your API key:

```
GEMINI_API_KEY=your_actual_api_key_here
PORT=3000
```

### 3. Install & Run

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

For development with auto-reload:

```bash
npm run dev
```

## Controls

| Action | Shortcut |
|--------|----------|
| Pen | `P` |
| Pencil | `L` |
| Marker | `M` |
| Eraser | `E` |
| Fill | `G` |
| Undo | `Ctrl/Cmd + Z` |
| Redo | `Ctrl/Cmd + Shift + Z` |
| Trigger AI | `Space` or click **AI Draw** |

## Architecture

- **Frontend**: Vanilla HTML5 Canvas with a dual-layer system (user + AI)
- **Backend**: Express.js server proxying requests to Gemini API
- **AI**: Google Gemini 2.0 Flash with image understanding and generation
- **Animation**: Progressive reveal when AI adds to the canvas

## Tech Stack

- HTML5 Canvas API
- ES Modules (no build step)
- Express.js
- Google Generative AI SDK (`@google/generative-ai`)
