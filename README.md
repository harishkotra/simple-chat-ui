# Simple AI Chat Interface (Multi-Chat Version)

A lightweight, browser-based chat interface, similar to Google Gemini, to interact with OpenAI-compatible API endpoints. Allows users to manage multiple chat sessions and provide their own API Key, Endpoint URL, and Model Name.

## Features

*   **Google Gemini-like UI:** Sidebar for managing multiple chat sessions.
*   **Multi-Chat Management:** Create new chats, switch between conversations.
*   **Persistence:** Chat history and settings are saved in the browser's `localStorage`.
*   **Custom API Endpoint:** Connects to any OpenAI-compatible Chat Completions API endpoint (e.g., OpenAI, GaiaNet, local models via LM Studio/Ollama).
*   **User-Provided Credentials:** Users enter their own API Key (stored locally).
*   **Model Selection:** Users specify the Model Name to use.
*   **Basic Markdown Rendering:** Displays bold, inline code, and code blocks.
*   **Lightweight:** No server-side backend needed (runs entirely in the browser).
*   **Easy Deployment:** Deploy as a static site (e.g., on Vercel, Netlify, GitHub Pages).

## How to Run Locally

1.  Clone or download this repository.
2.  Open the `index.html` file directly in your web browser.

No build steps required.

## How to Use

1.  **Open:** Launch `index.html` in your browser.
2.  **Settings (⚙️):** Click the "Settings" button in the bottom-left sidebar.
    *   Enter your **API Base URL** (e.g., `https://api.openai.com/v1`, `https://llama70b.gaia.domains/v1`, or your local endpoint's base URL). The `/chat/completions` path will be added automatically if needed.
    *   Enter your **API Key**.
        *   **Security Warning:** Your API key is stored locally in `localStorage`. Be aware of the security implications (see warning in the settings modal).
    *   Enter the exact **Model Name** (e.g., `gpt-3.5-turbo`, `llama70b`).
    *   Click "Save Settings".
3.  **Start Chatting:**
    *   Click "➕ New Chat" to begin a conversation.
    *   Select a previous chat from the sidebar list to continue it.
    *   Type your message in the input box at the bottom and press Enter or click the send button (➡️).