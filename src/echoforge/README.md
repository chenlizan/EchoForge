# EchoForge Integration Guide

This folder contains the self-contained EchoForge application. You can integrate it into your project by following these steps:

## 1. Copy the Folder
Copy the `src/echoforge` directory into your project's `src` folder.

## 2. Install Dependencies
Ensure your project has the following dependencies installed:
```bash
npm install lucide-react recharts react react-dom
```

## 3. Configure Tailwind
EchoForge uses Tailwind CSS. Make sure your `tailwind.config.js` includes the path to these components:
```javascript
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    // ... other paths
  ],
  // ...
}
```

## 4. Backend Setup (Ollama)

EchoForge now uses a local Python backend powered by Ollama for privacy and control.

### Prerequisites
- Python 3.8+
- [Ollama](https://ollama.com/) installed and running
- Pull the required model: `ollama pull gemma3:12b` (or your preferred model)

### Setup

1.  **Navigate to the server directory**:
    The backend code is located in `/server`.

2.  **Install Python Dependencies**:
    ```bash
    cd server
    pip install -r requirements.txt
    ```

3.  **Environment Variables**:
    Create a `.env` file in the `/server` directory:
    ```env
    OLLAMA_BASE_URL=http://127.0.0.1:11434
    OLLAMA_MODEL=gemma3:12b
    PORT=5000
    ```

4.  **Run the Server**:
    ```bash
    python app.py
    ```

## 5. Frontend Configuration

The frontend (`src/echoforge/Gemini.ts`) is configured to communicate with the Python backend.

-   **Dev Mode**: Defaults to `http://localhost:5000/api`.
-   **Production**: Defaults to `/api` (requires a proxy).

## 6. Usage in Routing
Import the `EchoForge` component and use it in your router:

```tsx
import EchoForge from './echoforge/EchoForge';

// In your router configuration:
<Route path="/analysis" element={<EchoForge />} />
```

## 7. Styles
The styles are encapsulated in `styles.css` and imported directly into `EchoForge.tsx`.
