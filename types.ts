// --- User & Authentication ---
export interface User {
    email: string;
    name: string;
    className: string; // e.g., "Class 10"
}

// --- Core Data Structures ---

export interface FileContent {
  fileName: string;
  fileBase64: string; // Base64 encoded PDF file
  totalPages: number;
}

export interface SubjectData {
    id: string; // Composite key: `${className}-${subject}`
    className: string;
    subject: string;
    files: FileContent[]; // Can now hold multiple PDFs for one subject
    structure: MindMapNode; // The complete structural map of all files
}

// --- Mind Map & Keyword Types (with interactive content) ---
export interface MindMapNode {
  id: string; // e.g., "1.2.3"
  title: string;
  explanation?: string; // AI-generated explanation for the concept
  children: MindMapNode[];
  startPage: number; // The starting page number for this section
  endPage: number; // The ending page number for this section
  fileName: string; // The file this node belongs to
}

export interface Keyword {
    term: string;
    definition: string;
}

// Stores the pre-generated content for a single chapter
export interface ChapterDetails {
    id: string; // Composite key: `${subjectId}-${chapterId}`
    subjectId: string;
    chapterId: string;
    chapterTitle: string;
    summary: string;
    keywords: Keyword[];
    mindMap: MindMapNode; // The interactive mind map for this chapter
}

// --- AI Response & Conversation Types ---

export interface Citation {
  fileName: string;
  page: number;
}

export interface CropCoordinates {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReferencedImage {
  fileName: string;
  page: number;
  description: string;
  cropCoordinates?: CropCoordinates;
}

export interface TutorResponse {
  answer: string;
  citations: Citation[];
  images: ReferencedImage[];
  sources?: string[];
}

export interface ConversationTurn {
    query: string;
    response: TutorResponse;
}