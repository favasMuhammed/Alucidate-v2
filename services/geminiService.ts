import { GoogleGenAI, Type, Part } from "@google/genai";
import { FileContent, TutorResponse, MindMapNode, ConversationTurn, ChapterDetails, Keyword } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper to create a nested schema safely, now including page numbers
const createMindMapNodeSchema = (depth: number, withExplanation: boolean): object => {
    const requiredFields = ["id", "title", "children", "startPage", "endPage"];
    if (withExplanation) {
        requiredFields.push("explanation");
    }

    const properties: any = {
        id: { type: Type.STRING, description: "Hierarchical ID (e.g., '1.1')." },
        title: { type: Type.STRING, description: "Concise title (3-5 words)." },
        startPage: { type: Type.INTEGER, description: "The starting page number of this section." },
        endPage: { type: Type.INTEGER, description: "The ending page number of this section." },
        children: {
            type: Type.ARRAY,
            items: depth > 0 ? createMindMapNodeSchema(depth - 1, withExplanation) : {},
        },
    };

    if (withExplanation) {
        properties.explanation = { type: Type.STRING, description: "A detailed, 2-3 sentence explanation of this concept." };
    }

    return {
        type: Type.OBJECT,
        properties,
        required: requiredFields,
    };
};


export const generateStructureAndPageMap = async (file: FileContent): Promise<MindMapNode> => {
    const model = "gemini-2.5-flash";
    const systemInstruction = `You are an expert in document analysis. Your task is to analyze a textbook PDF and create a precise, hierarchical table of contents, including the exact start and end page numbers for every section.
    
    Instructions:
    1.  Thoroughly scan the document to identify its structure (chapters, main sections).
    2.  The root node should be the book's title. Its ID should be "1".
    3.  Assign hierarchical IDs to each node (e.g., chapter '1.1', its first section '1.1.1').
    4.  CRITICAL: For each node, you MUST provide the accurate 'startPage' and 'endPage'.
    5.  Return a single JSON object for the root node. Do not include explanations.`;

    const mindMapSchema = {
        type: Type.OBJECT,
        properties: {
            root: createMindMapNodeSchema(5, false), // No explanations, but with page numbers
        },
        required: ["root"],
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: [
                { text: `Generate a structural map with page numbers for the textbook named "${file.fileName}".` },
                { inlineData: { mimeType: 'application/pdf', data: file.fileBase64 } }
            ],
            config: {
                responseMimeType: "application/json",
                responseSchema: mindMapSchema,
                systemInstruction: systemInstruction,
            },
        });
        const parsed = JSON.parse(response.text.trim());
        
        // Recursively add the fileName to each node
        const addFileName = (node: MindMapNode): MindMapNode => ({
            ...node,
            fileName: file.fileName,
            children: node.children.map(addFileName),
        });

        return addFileName(parsed.root);
    } catch (error) {
        console.error(`Error generating page map for ${file.fileName}:`, error);
        throw new Error(`Failed to generate page map for ${file.fileName}.`);
    }
};

const interactiveChapterDetailsSchema = {
    type: Type.OBJECT,
    properties: {
        summary: {
            type: Type.STRING,
            description: "A concise, 3-5 sentence summary of the chapter."
        },
        keywords: {
            type: Type.ARRAY,
            description: "A list of 5-10 essential keywords from the chapter, each with a definition.",
            items: {
                type: Type.OBJECT,
                properties: {
                    term: { type: Type.STRING },
                    definition: { type: Type.STRING, description: "A clear, 1-2 sentence definition." }
                },
                required: ["term", "definition"]
            }
        },
        mindMap: createMindMapNodeSchema(5, true) // Mind map with explanations
    },
    required: ["summary", "keywords", "mindMap"]
};

export const generateChapterDetails_Interactive = async (
    chapterPdfFile: FileContent, // This is now a PDF containing ONLY the chapter pages
    chapterTitle: string
): Promise<Omit<ChapterDetails, 'id' | 'subjectId' | 'chapterId' | 'chapterTitle'>> => {
    const model = "gemini-2.5-pro";
    const systemInstruction = `You are an expert academic assistant. The user has provided a PDF containing a single chapter. Your task is to generate a comprehensive, interactive learning module for it.

    Instructions:
    1.  The content is from a chapter titled "${chapterTitle}".
    2.  Provide a concise summary (3-5 sentences).
    3.  Identify 5-10 essential keywords and provide a clear, 1-2 sentence definition for each.
    4.  Generate a detailed, hierarchical mind map for THIS chapter. The root of this mind map should be the chapter itself. Each node MUST include a 2-3 sentence 'explanation'.
    5.  CRITICAL: The 'startPage' and 'endPage' for all nodes in the mind map should be relative to the provided chapter PDF (i.e., starting from page 1).
    6.  Return a single JSON object matching the required schema.`;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: [
                { text: `Analyze the provided chapter PDF titled "${chapterTitle}".` },
                { inlineData: { mimeType: 'application/pdf', data: chapterPdfFile.fileBase64 } }
            ],
            config: {
                responseMimeType: "application/json",
                responseSchema: interactiveChapterDetailsSchema,
                systemInstruction: systemInstruction,
            },
        });
        const jsonStr = response.text.trim();
        return JSON.parse(jsonStr);
    } catch (error)
    {
        console.error(`Error generating details for chapter ${chapterTitle}:`, error);
        throw new Error(`Failed to generate details for chapter ${chapterTitle}.`);
    }
};


export const findRelevantFiles = async (
    query: string,
    allSubjectMindMaps: { subjectId: string, mindMap: MindMapNode }[],
    conversationHistory: ConversationTurn[],
    primarySubjectId: string,
): Promise<string[]> => {
    // This function can be simplified if we always use the current subject's books.
    // For now, we'll just return the primary subject ID to ensure context is maintained.
    // A more complex implementation could search across subjects if needed.
    return [primarySubjectId];
};


const analysisResponseSchema = {
  type: Type.OBJECT,
  properties: {
    answer: {
      type: Type.STRING,
      description: "A comprehensive answer in Markdown. CRITICAL: For all mathematical equations, use KaTeX format. Wrap inline math with `$` (e.g., `$E=mc^2$`) and block math with `$$` (e.g., `$$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$`).",
    },
    citations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          fileName: { type: Type.STRING },
          page: { type: Type.INTEGER, description: "The absolute page number from the original textbook." },
        },
        required: ["fileName", "page"],
      },
    },
    images: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          fileName: { type: Type.STRING },
          page: { type: Type.INTEGER },
          description: { type: Type.STRING },
          cropCoordinates: {
            type: Type.OBJECT,
            properties: {
              x: { type: Type.NUMBER }, y: { type: Type.NUMBER },
              width: { type: Type.NUMBER }, height: { type: Type.NUMBER }
            },
            required: ["x", "y", "width", "height"],
          }
        },
        required: ["fileName", "page", "description", "cropCoordinates"],
      }
    }
  },
  required: ["answer", "citations", "images"],
};


export const analyzeFiles = async (
    query: string,
    relevantFiles: FileContent[],
    conversationHistory: ConversationTurn[],
    chapterContext?: { chapterTitle: string; chapterId: string; pageOffset: number; }
): Promise<TutorResponse> => {
  const model = "gemini-2.5-pro";

  const chapterInstruction = chapterContext
    ? `The user is studying Chapter ${chapterContext.chapterId}: "${chapterContext.chapterTitle}". The provided PDF contains ONLY this chapter's content. Focus your answer on this content, but you may infer connections to broader topics. IMPORTANT: All page number citations must be offset by ${chapterContext.pageOffset} to reflect the correct page in the original textbook.`
    : `Answer based on the entire set of provided documents. Page citations should be the absolute page numbers from the files.`;

  const systemInstruction = `You are an AI Academic Tutor. Your purpose is to provide a clear, comprehensive answer based EXCLUSIVELY on the provided textbook PDFs.

    Instructions:
    1.  Analyze the conversation history for context.
    2.  ${chapterInstruction}
    3.  Formulate a detailed, tutor-quality answer using Markdown for formatting.
    4.  CRITICAL: For all mathematical equations, you MUST use KaTeX format. Wrap inline math with single dollar signs (e.g., \`$E=mc^2$\`) and block-level equations with double dollar signs (e.g., \`$$...$$\`).
    5.  Identify helpful images (diagrams, charts) from the PDFs and provide precise 'cropCoordinates' for each.
    6.  You MUST cite your sources by file and page number. Remember to apply the page offset if one is provided.
    7.  Return a single JSON object matching the required schema.`;

  const contents: Part[] = [];

    if (conversationHistory.length > 0) {
        contents.push({ text: '--- CONVERSATION HISTORY ---' });
        for (const turn of conversationHistory) {
            contents.push({ text: `Student: "${turn.query}"` });
            contents.push({ text: `You: ${turn.response.answer}` });
        }
        contents.push({ text: '--- END HISTORY ---' });
    }

  contents.push(
    { text: `--- CURRENT TASK ---`},
    { text: `Question: "${query}"` },
    { text: `--- PROVIDED TEXTBOOKS (PDF format) ---` }
  );

  for (const file of relevantFiles) {
    contents.push({ text: `Textbook: ${file.fileName}` });
    contents.push({ inlineData: { mimeType: 'application/pdf', data: file.fileBase64 } });
  }

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisResponseSchema,
        systemInstruction: systemInstruction,
      },
    });
    
    const jsonStr = response.text.trim();
    try {
        const parsedResponse = JSON.parse(jsonStr);
        parsedResponse.sources = relevantFiles.map(f => f.fileName);
        return parsedResponse as TutorResponse;
    } catch (e) {
        console.error("Failed to parse JSON response:", jsonStr, e);
        throw new Error("The AI returned an invalid response. Please try again.");
    }

  } catch (error) {
    console.error("Error analyzing files:", error);
    if (error instanceof Error) {
        throw new Error(`Failed to analyze files: ${error.message}`);
    }
    throw new Error("An unknown error occurred during analysis.");
  }
};