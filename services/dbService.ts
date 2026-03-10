/**
 * dbService.ts
 * Hybrid data service for the Alucidate application.
 *
 * Structured data (users, subjects, chapters, conversations) → Supabase PostgreSQL
 * PDF binary cache (large Base64 files) → IndexedDB (device-local, for performance)
 */
import { User, SubjectData, ChapterDetails, Class } from '@/types';
import { supabase } from './supabaseClient';

// ─── IndexedDB PDF Cache ────────────────────────────────────────────────────
const PDF_DB_NAME = 'AluciDatePdfCache';
const PDF_DB_VERSION = 1;
const PDF_STORE = 'pdfStore';

function openPdfDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(PDF_DB_NAME, PDF_DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(PDF_STORE)) {
                db.createObjectStore(PDF_STORE, { keyPath: 'fileName' });
            }
        };
        request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
        request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
    });
}

// ─── Main DB Service ────────────────────────────────────────────────────────

export const dbService = {

    // ── Users ──────────────────────────────────────────────────────────────

    async getUser(email: string): Promise<User | undefined> {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email.trim().toLowerCase())
            .single();
        if (error || !data) return undefined;
        return { ...data, className: data.class_name } as User;
    },

    async addUser(user: User): Promise<void> {
        const { error } = await supabase
            .from('users')
            .upsert({
                email: user.email.trim().toLowerCase(),
                name: user.name,
                class_name: user.className,
                role: user.role,
            });
        if (error) throw new Error(`Failed to save user: ${error.message}`);
    },

    // ── Classes ─────────────────────────────────────────────────────────────

    async getClasses(): Promise<Class[]> {
        const { data, error } = await supabase
            .from('classes')
            .select('*');
        if (error || !data) return [];

        // Use natural sorting so 'Class 2' comes before 'Class 10'
        return (data as Class[]).sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        );
    },

    async saveClass(cls: Class): Promise<void> {
        const { error } = await supabase
            .from('classes')
            .upsert({
                id: cls.id,
                name: cls.name,
                type: cls.type,
            });
        if (error) throw new Error(`Failed to save class: ${error.message}`);
    },

    async deleteClass(id: string): Promise<void> {
        const { error } = await supabase
            .from('classes')
            .delete()
            .eq('id', id);
        if (error) throw new Error(`Failed to delete class: ${error.message}`);
    },

    // ── Subjects ───────────────────────────────────────────────────────────

    async getSubjectsByClass(className: string): Promise<SubjectData[]> {
        const { data, error } = await supabase
            .from('subjects')
            .select('*')
            .eq('class_name', className);
        if (error || !data) return [];
        return data.map(row => ({
            id: row.id,
            className: row.class_name,
            subject: row.subject,
            files: [],
            structure: row.structure,
        }));
    },

    async getAllSubjects(): Promise<SubjectData[]> {
        const { data, error } = await supabase
            .from('subjects')
            .select('*')
            .order('class_name', { ascending: true });
        if (error || !data) return [];
        return data.map(row => ({
            id: row.id,
            className: row.class_name,
            subject: row.subject,
            files: [],
            structure: row.structure,
        }));
    },

    async getSubject(id: string): Promise<SubjectData | undefined> {
        const { data, error } = await supabase
            .from('subjects')
            .select('*')
            .eq('id', id)
            .single();
        if (error || !data) return undefined;
        return {
            id: data.id,
            className: data.class_name,
            subject: data.subject,
            files: [],
            structure: data.structure,
        };
    },

    async saveSubject(subject: SubjectData): Promise<void> {
        const { error } = await supabase
            .from('subjects')
            .upsert({
                id: subject.id,
                class_name: subject.className,
                subject: subject.subject,
                structure: subject.structure,
            });
        if (error) throw new Error(`Failed to save subject: ${error.message}`);
    },

    async deleteSubject(id: string): Promise<void> {
        const { error } = await supabase
            .from('subjects')
            .delete()
            .eq('id', id);
        if (error) throw new Error(`Failed to delete subject: ${error.message}`);
    },

    // ── Chapters ───────────────────────────────────────────────────────────

    async deleteChapter(subjectId: string, chapterId: string, currentSubject: SubjectData): Promise<SubjectData> {
        // 1. Delete the chapter details and mind map from the database
        const { error } = await supabase
            .from('chapters')
            .delete()
            .eq('subject_id', subjectId)
            .eq('chapter_id', chapterId);
        if (error) throw new Error(`Failed to delete chapter: ${error.message}`);

        // 2. Remove the chapter node from the Subject's hierarchical mind map structure
        const updatedSubject = { ...currentSubject };
        if (updatedSubject.structure?.children) {
            updatedSubject.structure.children = updatedSubject.structure.children.filter(
                (ch: any) => ch.id !== chapterId
            );
        }

        // 3. Save the modified subject back to the DB to reflect the deleted structure
        await this.saveSubject(updatedSubject);
        return updatedSubject;
    },

    async getChapterDetails(id: string): Promise<ChapterDetails | undefined> {
        const { data, error } = await supabase
            .from('chapters')
            .select('*')
            .eq('id', id)
            .single();
        if (error || !data) return undefined;
        return {
            id: data.id,
            subjectId: data.subject_id,
            chapterId: data.chapter_id,
            chapterTitle: data.chapter_title,
            summary: data.summary,
            keywords: data.keywords,
            mindMap: data.mind_map,
        };
    },

    async saveChapterDetails(details: ChapterDetails): Promise<void> {
        const { error } = await supabase
            .from('chapters')
            .upsert({
                id: details.id,
                subject_id: details.subjectId,
                chapter_id: details.chapterId,
                chapter_title: details.chapterTitle,
                summary: details.summary,
                keywords: details.keywords,
                mind_map: details.mindMap,
            });
        if (error) throw new Error(`Failed to save chapter: ${error.message}`);
    },

    async getChaptersBySubject(subjectId: string): Promise<ChapterDetails[]> {
        const { data, error } = await supabase
            .from('chapters')
            .select('*')
            .eq('subject_id', subjectId)
            .order('chapter_id', { ascending: true });
        if (error || !data) return [];
        return data.map(row => ({
            id: row.id,
            subjectId: row.subject_id,
            chapterId: row.chapter_id,
            chapterTitle: row.chapter_title,
            summary: row.summary,
            keywords: row.keywords,
            mindMap: row.mind_map,
        }));
    },

    // ── Conversation Memory ────────────────────────────────────────────────

    async getConversationHistory(studentEmail: string, subjectId: string, chapterId: string) {
        const { data } = await supabase
            .from('conversations')
            .select('history')
            .eq('student_email', studentEmail)
            .eq('subject_id', subjectId)
            .eq('chapter_id', chapterId)
            .single();
        return data?.history ?? [];
    },

    async saveConversationHistory(
        studentEmail: string, subjectId: string, chapterId: string, history: any[]
    ): Promise<void> {
        const { error } = await supabase
            .from('conversations')
            .upsert({
                student_email: studentEmail,
                subject_id: subjectId,
                chapter_id: chapterId,
                history,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'student_email,subject_id,chapter_id' });
        if (error) throw new Error(`Failed to save conversation: ${error.message}`);
    },

    // ── Utility ────────────────────────────────────────────────────────────

    async hasSubjects(className?: string): Promise<boolean> {
        let query = supabase.from('subjects').select('id', { count: 'exact', head: true });
        if (className) query = query.eq('class_name', className);
        const { count } = await query;
        return (count ?? 0) > 0;
    },

    // ── PDF Cache (IndexedDB — local only) ─────────────────────────────────

    async savePdfToCache(fileName: string, fileBase64: string, totalPages: number): Promise<void> {
        const db = await openPdfDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(PDF_STORE, 'readwrite');
            const store = tx.objectStore(PDF_STORE);
            const req = store.put({ fileName, fileBase64, totalPages });
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    },

    async getPdfFromCache(fileName: string): Promise<{ fileName: string; fileBase64: string; totalPages: number } | undefined> {
        const db = await openPdfDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(PDF_STORE, 'readonly');
            const store = tx.objectStore(PDF_STORE);
            const req = store.get(fileName);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    async clearDB(): Promise<void> {
        return new Promise((resolve, reject) => {
            const req = indexedDB.deleteDatabase(PDF_DB_NAME);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    },
};
