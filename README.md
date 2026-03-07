<div align="center">
  <h1 align="center">AIucidate</h1>
  <p align="center">
    <strong>An AI-powered academic tutor and interactive syllabus manager.</strong>
  </p>
  <img width="800" alt="Alucidate App Preview" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

---

## 📖 Overview

**AIucidate** is an intelligent, offline-capable academic study assistant designed to transform static PDF textbook chapters into interactive learning modules. By leveraging the power of **Google Gemini 2.5 Pro**, AIucidate provides students with AI-generated summaries, keyword definitions, and hierarchical mind maps for every chapter.

The application features role-based workflows:
- **Administrators**: Upload and manage subject syllabuses by uploading PDF chapters. The app automatically analyzes the PDFs and generates interactive, structured study content.
- **Students**: Access their class materials, explore interactive mind maps, and chat with a context-aware AI tutor that answers questions accurately based *only* on the provided textbook material.

## ✨ Features

- **Interactive AI Academic Tutor**: Ask questions via chat or directly from the mind map. The AI responds with highly contextual answers, including KaTeX formatted mathematical equations and explicit file/page citations.
- **Automated Study Material Generation**: Upload a chapter PDF and automatically receive a concise chapter summary and 5-10 essential keywords with definitions.
- **Hierarchical Concept Mind Maps**: Visually explore chapter contents through AI-generated structural mind maps, breaking down complex topics into digestible nodes.
- **Offline-First Storage**: Utilizes IndexedDB (`SyllabusDB`) to locally store User data, Subject structures, Base64 Encoded PDFs, and AI-generated metadata, reducing the need for constant network calls.
- **Role-based Authentication**: Simple, seamless signup and login flows with localized tracking for dynamic Admin or Student dashboards.

## 🛠️ Technology Stack

- **Frontend**: React (v19), TypeScript, Vite
- **Styling**: Tailwind CSS
- **AI Integration**: Google Gen AI SDK (`@google/genai`) with the `gemini-2.5-pro` model
- **PDF Processing**: `pdfjs-dist` (v4.4.168)
- **Local Storage**: IndexedDB (wrapper via custom `dbService`)

## 🚀 Getting Started

### Prerequisites

- Node.js installed on your machine.
- A valid Google Gemini API Key.

### Installation & Setup

1. **Clone the repository** (if you haven't already) and navigate to the project directory:
   ```bash
   cd Alucidate
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env.local` file in the root directory and add your Gemini API Key:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
   *(Note: Vite maps `GEMINI_API_KEY` internally to `process.env.API_KEY` for the AI SDK).*

4. **Run the Development Server**:
   ```bash
   npm run dev
   ```
   The application will start, typically accessible at `http://localhost:3000/`.

---

## 👨‍💻 Team & Contributors

This project was built and conceptualized by:

- **Muhammed Favas T P** - [LinkedIn Profile](https://www.linkedin.com/in/muhammed-favas-t-p)
- **Roshan** - [LinkedIn Profile](https://www.linkedin.com/in/mroshan1/)

---

<div align="center">
  <p>Built with ❤️ utilizing React and Google Gemini AI.</p>
</div>
