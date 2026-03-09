import React, { useMemo, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MindMapNode as MindMapNodeType } from '@/types';

interface SVGNode extends MindMapNodeType {
    x: number;
    y: number;
    level: number;
    parent?: SVGNode;
}

interface MindMapProps {
    data: MindMapNodeType;
    onNodeSelect: (node: MindMapNodeType) => void;
    activeNodeId: string | null;
}

// ── Layout Math ──
function calculateLayout(root: MindMapNodeType, width: number, height: number): SVGNode[] {
    const nodes: SVGNode[] = [];
    const levelCounts: Record<number, number> = {};
    const levelSpacing = 300; // X distance
    const verticalSpacing = 100; // Y distance

    // Count nodes per level to center them vertically
    const countNodes = (node: MindMapNodeType, level: number) => {
        levelCounts[level] = (levelCounts[level] || 0) + 1;
        node.children?.forEach(c => countNodes(c, level + 1));
    };
    countNodes(root, 0);

    const levelCurrentIdx: Record<number, number> = {};

    const traverse = (node: MindMapNodeType, level: number, parent?: SVGNode): SVGNode => {
        const idx = levelCurrentIdx[level] || 0;
        levelCurrentIdx[level] = idx + 1;

        const totalAtLevel = levelCounts[level] || 1;

        // Base coordinates
        let x = level * levelSpacing + 200;
        let y = (height / 2) - ((totalAtLevel * verticalSpacing) / 2) + (idx * verticalSpacing);

        // Nudge children to align with parent if possible, but keep it simple for now
        if (parent && level > 1) {
            y = parent.y + ((idx - ((totalAtLevel - 1) / 2)) * verticalSpacing);
        }

        const mapped: SVGNode = { ...node, x, y, level, parent };
        nodes.push(mapped);

        node.children?.forEach(c => traverse(c, level + 1, mapped));
        return mapped;
    };

    traverse(root, 0);
    return nodes;
}

// ── SVG Curved Edge ──
const MindMapEdge: React.FC<{ source: SVGNode; target: SVGNode; isActive: boolean }> = ({ source, target, isActive }) => {
    // Start from right center of source, to left center of target
    const sourceX = source.level === 0 ? source.x + 90 : source.x + 70;
    const targetX = target.x - 70;
    const cX = (sourceX + targetX) / 2;
    const path = `M ${sourceX} ${source.y} C ${cX} ${source.y}, ${cX} ${target.y}, ${targetX} ${target.y}`;

    return (
        <motion.path
            d={path}
            fill="none"
            stroke={isActive ? 'var(--color-brand)' : 'var(--color-border)'}
            strokeWidth={isActive ? 2.5 : 1.5}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            className={isActive ? 'drop-shadow-[var(--shadow-glow-brand)]' : ''}
        />
    );
};

// ── Main Component ──
export const MindMap: React.FC<MindMapProps> = ({ data, onNodeSelect, activeNodeId }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ w: 1000, h: 800 });
    const [scale, setScale] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const startPanParams = useRef({ x: 0, y: 0, startX: 0, startY: 0 });

    useEffect(() => {
        if (containerRef.current) {
            setDimensions({
                w: containerRef.current.clientWidth,
                h: containerRef.current.clientHeight
            });
            // Center roughly
            setPan({ x: 50, y: containerRef.current.clientHeight / 2 - 400 });
        }
    }, [data]);

    const layoutNodes = useMemo(() => calculateLayout(data, Math.max(dimensions.w, 1000), Math.max(dimensions.h, 800)), [data, dimensions]);

    // Handle Pan/Zoom
    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY * -0.001;
        setScale(s => Math.min(Math.max(0.4, s + delta), 2.5));
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        setIsDragging(true);
        startPanParams.current = { x: pan.x, y: pan.y, startX: e.clientX, startY: e.clientY };
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return;
        setPan({
            x: startPanParams.current.x + (e.clientX - startPanParams.current.startX),
            y: startPanParams.current.y + (e.clientY - startPanParams.current.startY)
        });
    };

    const handlePointerUp = () => setIsDragging(false);

    // active path set
    const activePathSet = useMemo(() => {
        const set = new Set<string>();
        if (!activeNodeId) return set;
        let curr = layoutNodes.find(n => n.id === activeNodeId);
        while (curr) {
            set.add(curr.id);
            curr = curr.parent;
        }
        return set;
    }, [activeNodeId, layoutNodes]);

    return (
        <div
            ref={containerRef}
            className="w-full h-full bg-void overflow-hidden relative touch-none select-none cursor-grab active:cursor-grabbing"
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
        >
            <motion.div
                className="w-full h-full origin-top-left"
                style={{
                    x: pan.x,
                    y: pan.y,
                    scale: scale,
                }}
            >
                <svg width="4000" height="4000" className="absolute inset-0 pointer-events-none overflow-visible">
                    <defs>
                        <linearGradient id="rootGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="var(--color-brand)" />
                            <stop offset="100%" stopColor="var(--color-brand-dim)" />
                        </linearGradient>
                    </defs>

                    {/* Draw Edges */}
                    {layoutNodes.map(node => (
                        node.parent && (
                            <MindMapEdge
                                key={`edge-${node.parent.id}-${node.id}`}
                                source={node.parent}
                                target={node}
                                isActive={activePathSet.has(node.id) && activePathSet.has(node.parent.id)}
                            />
                        )
                    ))}
                </svg>

                {/* Draw HTML Nodes (easier for text wrapping and hover states than SVG text) */}
                {layoutNodes.map((node, i) => {
                    const isActive = activeNodeId === node.id;
                    const isRoot = node.level === 0;
                    const w = isRoot ? 200 : node.level === 1 ? 160 : 130;
                    const h = isRoot ? 64 : node.level === 1 ? 56 : 48;

                    return (
                        <motion.button
                            key={node.id}
                            initial={{ opacity: 0, scale: 0.8, x: node.x - w / 2 - 20, y: node.y - h / 2 }}
                            animate={{ opacity: 1, scale: isActive ? 1.05 : 1, x: node.x - w / 2, y: node.y - h / 2 }}
                            transition={{ delay: i * 0.04, type: 'spring', stiffness: 300, damping: 24 }}
                            onClick={(e) => { e.stopPropagation(); onNodeSelect(node); }}
                            className={`absolute flex items-center justify-center p-3 text-center transition-all shadow-sm ${isRoot
                                    ? 'bg-[url(#rootGrad)] bg-brand text-white rounded-full border-none shadow-[var(--shadow-glow-brand)] z-20'
                                    : node.level === 1
                                        ? 'bg-raised border border-border text-ink rounded-xl hover:border-brand-dim z-10'
                                        : 'bg-surface border border-border-subtle text-ink-2 rounded-full hover:border-brand-dim hover:text-ink z-0'
                                } ${isActive && !isRoot ? 'ring-2 ring-brand ring-offset-2 ring-offset-void glow-brand bg-surface' : ''}`}
                            style={{ width: w, height: h }}
                        >
                            <span className={`leading-tight line-clamp-2 ${isRoot ? 'font-bold text-sm tracking-tight' : 'font-medium text-xs'}`}>
                                {node.title}
                            </span>
                        </motion.button>
                    );
                })}
            </motion.div>

            {/* Controls */}
            <div className="absolute bottom-6 right-6 flex items-center gap-1 bg-surface border border-border p-1 rounded-lg shadow-lg">
                <button onClick={() => setScale(s => Math.max(0.4, s - 0.2))} className="w-8 h-8 rounded-md hover:bg-raised text-ink-2 flex items-center justify-center">−</button>
                <div className="w-px h-4 bg-border mx-1" />
                <button onClick={() => { setScale(1); setPan({ x: 50, y: dimensions.h / 2 - 400 }); }} className="px-3 h-8 text-xs font-bold text-ink hover:text-brand transition-colors">FIT</button>
                <div className="w-px h-4 bg-border mx-1" />
                <button onClick={() => setScale(s => Math.min(2.5, s + 0.2))} className="w-8 h-8 rounded-md hover:bg-raised text-ink-2 flex items-center justify-center">+</button>
            </div>
        </div>
    );
};
