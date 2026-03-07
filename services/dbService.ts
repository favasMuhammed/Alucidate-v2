/**
 * dbService.ts
 * Centralized IndexedDB service for the Alucidate application.
 * Extracted from App.tsx for clean separation of concerns.
 */
import { User, SubjectData, ChapterDetails } from '@/types';

const DB_NAME = 'SyllabusDB';
const DB_VERSION = 5;
const SUBJECTS_STORE = 'subjectsStore';
const CHAPTERS_STORE = 'chaptersStore';
const USERS_STORE = 'usersStore';

interface IDBService {
    openDB(): Promise<IDBDatabase>;
    dbRequest<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest | IDBRequest<T[]>): Promise<T>;
    getUser(email: string): Promise<User | undefined>;
    addUser(user: User): Promise<IDBValidKey>;
    getSubjectsByClass(className: string): Promise<SubjectData[]>;
    getSubject(id: string): Promise<SubjectData | undefined>;
    saveSubject(subject: SubjectData): Promise<IDBValidKey>;
    getChapterDetails(id: string): Promise<ChapterDetails | undefined>;
    saveChapterDetails(details: ChapterDetails): Promise<IDBValidKey>;
    clearDB(): Promise<void>;
    hasSubjects(): Promise<boolean>;
}

export const dbService: IDBService = {
    openDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(SUBJECTS_STORE)) {
                    const store = db.createObjectStore(SUBJECTS_STORE, { keyPath: 'id' });
                    store.createIndex('classIndex', 'className', { unique: false });
                }
                if (!db.objectStoreNames.contains(CHAPTERS_STORE)) {
                    db.createObjectStore(CHAPTERS_STORE, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(USERS_STORE)) {
                    db.createObjectStore(USERS_STORE, { keyPath: 'email' });
                }
            };
            request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
            request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
        });
    },

    async dbRequest<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest | IDBRequest<T[]>): Promise<T> {
        const db = await (this as IDBService).openDB();
        return new Promise<T>((resolve, reject) => {
            const transaction = db.transaction(storeName, mode);
            const store = transaction.objectStore(storeName);
            const request = action(store);
            let result: T;
            request.onsuccess = () => { result = request.result; };
            request.onerror = () => { reject(request.error); };
            transaction.oncomplete = () => { resolve(result); };
            transaction.onerror = () => { reject(transaction.error); };
        });
    },

    getUser(email: string) {
        return (this as IDBService).dbRequest<User | undefined>(USERS_STORE, 'readonly', store => store.get(email));
    },
    addUser(user: User) {
        return (this as IDBService).dbRequest<IDBValidKey>(USERS_STORE, 'readwrite', store => store.put(user));
    },
    async getSubjectsByClass(className: string) {
        const results = await (this as IDBService).dbRequest<SubjectData[]>(SUBJECTS_STORE, 'readonly', store => {
            const index = store.index('classIndex');
            return index.getAll(className);
        });
        return results || [];
    },
    getSubject(id: string) {
        return (this as IDBService).dbRequest<SubjectData | undefined>(SUBJECTS_STORE, 'readonly', store => store.get(id));
    },
    saveSubject(subject: SubjectData) {
        return (this as IDBService).dbRequest<IDBValidKey>(SUBJECTS_STORE, 'readwrite', store => store.put(subject));
    },
    getChapterDetails(id: string) {
        return (this as IDBService).dbRequest<ChapterDetails | undefined>(CHAPTERS_STORE, 'readonly', store => store.get(id));
    },
    saveChapterDetails(details: ChapterDetails) {
        return (this as IDBService).dbRequest<IDBValidKey>(CHAPTERS_STORE, 'readwrite', store => store.put(details));
    },
    clearDB() {
        return new Promise<void>((resolve, reject) => {
            const req = indexedDB.deleteDatabase(DB_NAME);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    },
    hasSubjects() {
        return (this as IDBService).dbRequest<number>(SUBJECTS_STORE, 'readonly', store => store.count()).then(count => count > 0);
    },
};
