import { GoogleGenAI, Type, Part } from "@google/genai";
import { FileContent, TutorResponse, MindMapNode, ConversationTurn, ChapterDetails, Keyword } from '../types';

const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY;

if (!apiKey) {
    throw new Error("VITE_GEMINI_API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: apiKey });

// --- Shared error extraction helper for Gemini API errors ---
function extractApiError(error: any): { code?: number; status?: string; message?: string } {
    let code: number | undefined;
    let status: string | undefined;
    let message: string | undefined;

    if (error?.error) {
        code = error.error.code;
        status = error.error.status;
        message = error.error.message;
    } else if (error?.code !== undefined) {
        code = error.code;
        status = error.status;
        message = error.message;
    }

    if (!code && error?.message) {
        try {
            const parsed = JSON.parse(error.message);
            if (parsed?.error) {
                code = parsed.error.code;
                status = parsed.error.status;
                message = parsed.error.message;
            }
        } catch {
            message = error.message;
        }
    }

    return { code, status, message };
}

function throwApiError(error: any, fallbackMsg: string): never {
    const { code, status, message } = extractApiError(error);
    if (code === 429 || status === 'RESOURCE_EXHAUSTED') {
        throw new Error(`API quota exceeded. Please check your Gemini API billing and quota limits at https://ai.dev/usage?tab=rate-limit.`);
    }
    if (code === 401 || status === 'UNAUTHENTICATED') {
        throw new Error(`Invalid API key. Please check your GEMINI_API_KEY in .env.local.`);
    }
    if (message) throw new Error(`API Error: ${message}`);
    throw new Error(fallbackMsg);
}

// ---------------------------------------------------------------
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

const interactiveChapterDetailsSchema = {
    type: Type.OBJECT,
    properties: {
        chapterTitle: {
            type: Type.STRING,
            description: "The title of the chapter, extracted from the most prominent heading on the first page."
        },
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
    required: ["chapterTitle", "summary", "keywords", "mindMap"]
};

export const generateChapterDetails_Interactive = async (
    chapterPdfFile: FileContent,
    chapterNumber: number
): Promise<Omit<ChapterDetails, 'id' | 'subjectId' | 'chapterId'>> => {
    const model = "gemini-2.5-pro";
    const systemInstruction = `You are an expert academic assistant. The user has provided a PDF containing a single chapter. Your task is to generate a comprehensive, interactive learning module for it.

    Instructions:
    1.  Identify the chapter's title from the most prominent heading on the first page.
    2.  Provide a concise summary (3-5 sentences).
    3.  Identify 5-10 essential keywords and provide a clear, 1-2 sentence definition for each.
    4.  Generate a detailed, hierarchical mind map for THIS chapter.
    5.  CRITICAL: The root node ID of the mind map MUST be "${chapterNumber}". All subsequent node IDs MUST be hierarchical, starting with the chapter number (e.g., "${chapterNumber}.1", "${chapterNumber}.1.1", etc.).
    6.  The 'startPage' and 'endPage' for all nodes in the mind map should be relative to the provided chapter PDF (i.e., starting from page 1).
    7.  Return a single JSON object matching the required schema.`;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: [
                { text: `Analyze the provided chapter PDF for Chapter ${chapterNumber}.` },
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
    } catch (error: any) {
        console.error(`Error generating details for chapter ${chapterNumber}:`, error);
        throwApiError(error, `Failed to generate details for chapter ${chapterNumber}: ${error?.message || 'Unknown error'}`);
    }
};


// Identify relevant nodes from a subject's mind map based on a query (Vectorless RAG / PageIndex style)
export const identifyRelevantNodes = async (
    query: string,
    mindMap: MindMapNode,
    limit: number = 3
): Promise<string[]> => {
    const model = "gemini-2.5-flash"; // Use faster model for reasoning
    const systemInstruction = `You are a document navigation assistant. Given a student's query and a hierarchical MindMap of a textbook, identify the top ${limit} most relevant section IDs (e.g., "1.2.1"). 
    Focus on finding the exact nodes that would contain the answer. Return only a JSON array of strings.`;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: [
                { text: `Query: "${query}"\n\nMindMap Structure:\n${JSON.stringify(mindMap, null, 2)}` }
            ],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                },
                systemInstruction: systemInstruction,
            },
        });
        return JSON.parse(response.text.trim());
    } catch (error) {
        console.error("Error identifying relevant nodes:", error);
        return []; // Fallback to no specific nodes
    }
};

export const findRelevantFiles = async (
    query: string,
    allSubjectMindMaps: { subjectId: string, mindMap: MindMapNode }[],
    conversationHistory: ConversationTurn[],
    primarySubjectId: string,
): Promise<string[]> => {
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
    chapterContext?: { chapterTitle: string; chapterId: string; pageOffset: number; mindMap?: MindMapNode; }
): Promise<TutorResponse> => {
    const model = "gemini-2.5-pro";

    // Vectorless RAG Step: If mindMap is provided, identify high-density sections first
    let focusedContext = "";
    if (chapterContext?.mindMap) {
        try {
            const relevantNodes = await identifyRelevantNodes(query, chapterContext.mindMap);
            if (relevantNodes.length > 0) {
                focusedContext = `\nRELEVANT SECTIONS IDENTIFIED: The following chapters/sections in the MindMap are most likely to contain the answer: ${relevantNodes.join(', ')}. Prioritize these sections in the provided PDF.`;
            }
        } catch { /* Silent fail, fallback to full document */ }
    }

    const chapterInstruction = chapterContext
        ? `The user is studying Chapter ${chapterContext.chapterId}: "${chapterContext.chapterTitle}". The provided PDF contains ONLY this chapter's content. Focus your answer on this content, but you may infer connections to broader topics. IMPORTANT: All page number citations must be offset by ${chapterContext.pageOffset} to reflect the correct page in the original textbook.`
        : `Answer based on the entire set of provided documents. Page citations should be the absolute page numbers from the files.`;

    const systemInstruction = `You are an AI Academic Tutor. Your purpose is to provide a clear, comprehensive answer based EXCLUSIVELY on the provided textbook PDFs.

    Instructions:
    1.  Analyze the conversation history for context.
    2.  ${chapterInstruction}${focusedContext}
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
        { text: `--- CURRENT TASK ---` },
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

    } catch (error: any) {
        console.error("Error analyzing files:", error);

        throwApiError(error, error instanceof Error ? `Failed to analyze files: ${error.message}` : 'An unknown error occurred during analysis.');
    }
};