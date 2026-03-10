import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UploadCloud, FileText } from 'lucide-react';

interface AddNotesSheetProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (note: string, files: File[]) => void;
}

export const AddNotesSheet: React.FC<AddNotesSheetProps> = ({ isOpen, onClose, onSave }) => {
    const [note, setNote] = useState('');
    const [files, setFiles] = useState<File[]>([]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
        }
    };

    const handleSave = () => {
        onSave(note, files);
        setNote('');
        setFiles([]);
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-void/60 backdrop-blur-sm z-[120]"
                    />

                    {/* Sheet */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                        className="fixed top-0 right-0 h-full w-full max-w-[400px] sm:w-[400px] bg-surface/95 backdrop-blur-xl border-l border-border shadow-[-20px_0_40px_rgba(0,0,0,0.5)] z-[121] flex flex-col font-sans"
                    >
                        {/* Header */}
                        <div className="h-16 flex justify-between items-center px-6 border-b border-border/50 shrink-0">
                            <h2 className="font-[Geist] font-bold text-[16px] text-ink">Add Context Notes</h2>
                            <button
                                onClick={onClose}
                                className="w-8 h-8 rounded-full bg-raised flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface border border-transparent hover:border-border transition-all"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">

                            {/* Text Input */}
                            <div className="flex flex-col gap-2">
                                <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-ink-3">Your Notes</label>
                                <textarea
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    placeholder="Type additional context or specific instructions here..."
                                    className="w-full h-32 bg-raised border border-border rounded-xl px-4 py-3 font-[Geist] text-[14px] text-ink placeholder:text-ink-3 resize-none outline-none focus:border-brand focus:ring-1 focus:ring-brand/30 transition-all"
                                />
                            </div>

                            {/* File Dropzone */}
                            <div className="flex flex-col gap-2">
                                <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-ink-3">Attachments</label>
                                <div className="relative group w-full border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center gap-3 hover:border-brand/50 hover:bg-brand/5 transition-colors cursor-pointer text-center">
                                    <input
                                        type="file"
                                        multiple
                                        onChange={handleFileChange}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                    <div className="w-10 h-10 rounded-full bg-raised flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <UploadCloud className="w-5 h-5 text-brand" />
                                    </div>
                                    <p className="font-[Geist] text-sm text-ink-2 group-hover:text-ink transition-colors">
                                        Click or drag files here to upload
                                    </p>
                                    <p className="font-[Geist] text-xs text-ink-3">PDF, TXT, DOCX up to 10MB</p>
                                </div>
                            </div>

                            {/* File List */}
                            {files.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    {files.map((file, i) => (
                                        <div key={i} className="flex items-center justify-between p-3 bg-raised border border-border rounded-lg group hover:border-border-strong transition-colors">
                                            <div className="flex items-center gap-3 truncate pr-4">
                                                <div className="w-6 h-6 rounded bg-brand/10 text-brand flex items-center justify-center shrink-0">
                                                    <FileText className="w-3.5 h-3.5" />
                                                </div>
                                                <span className="font-[Geist] text-[13px] text-ink truncate">{file.name}</span>
                                            </div>
                                            <button
                                                onClick={() => setFiles(f => f.filter((_, idx) => idx !== i))}
                                                className="opacity-0 group-hover:opacity-100 p-1 text-ink-3 hover:text-danger hover:bg-danger/10 rounded transition-all shrink-0"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-border/50 shrink-0 bg-void/50">
                            <button
                                onClick={handleSave}
                                disabled={!note.trim() && files.length === 0}
                                className="w-full py-3 bg-brand text-white font-[Geist] font-semibold text-[14px] rounded-xl shadow-[0_4px_16px_rgba(59,130,246,0.3)] hover:bg-brand-bright disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                            >
                                Save Notes
                            </button>
                        </div>

                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
