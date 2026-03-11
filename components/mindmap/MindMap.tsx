import React, { useMemo, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useAnimationControls } from 'framer-motion';
import { Plus, X } from 'lucide-react';
import { MindMapNode as MindMapNodeType } from '@/types';
import { drawEdge } from '@/animations';

interface SVGNode extends MindMapNodeType {
    x: number;
    y: number;
    level: number;
    pathId: string;
    parent?: SVGNode;
}

interface MindMapProps {
    data: MindMapNodeType;
    onNodeSelect: (node: MindMapNodeType) => void;
    activeNodeId: string | null;
}

// ── SVG Curved Edge ──
const MindMapEdge: React.FC<{ source: SVGNode; target: SVGNode; isActive: boolean; isHovered: boolean }> = ({ source, target, isActive, isHovered }) => {
    // Offset calculation
    const sourceX = source.level === 0 ? source.x + 120 : source.x + 100;
    const targetX = target.x - (target.level === 1 ? 100 : 80);
    const fromY = source.y;
    const toY = target.y;

    const cpOffset = Math.abs(targetX - sourceX) * 0.45;
    const path = `M ${sourceX} ${fromY} C ${sourceX + cpOffset} ${fromY}, ${targetX - cpOffset} ${toY}, ${targetX} ${toY}`;

    const pathRef = useRef<SVGPathElement>(null);

    useEffect(() => {
        if (isActive && pathRef.current) {
            drawEdge(pathRef.current, 0);
        }
    }, [isActive]);

    return (
        <path
            ref={pathRef}
            d={path}
            fill="none"
            stroke={isActive ? 'url(#activeEdgeGradient)' : isHovered ? 'rgba(255,255,255,0.22)' : (source.level === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.07)')}
            strokeWidth={isActive ? 2 : isHovered ? 2 : (source.level === 0 ? 1.5 : 1)}
            strokeLinecap="round"
            className="transition-all duration-160 ease-out"
        />
    );
};

// ── Main Component ──
export const MindMap: React.FC<MindMapProps> = ({ data, onNodeSelect, activeNodeId }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ w: 1000, h: 800 });
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

    // ── Liquid Pan State ──
    const panX = useMotionValue(200);
    const panY = useMotionValue(0);
    const springPanX = useSpring(panX, { stiffness: 200, damping: 30, mass: 0.8 });
    const springPanY = useSpring(panY, { stiffness: 200, damping: 30, mass: 0.8 });

    // ── Liquid Scale State ──
    const [targetScale, setTargetScale] = useState(1);
    const springScale = useSpring(targetScale, { stiffness: 200, damping: 30 });

    // ── Expand/Collapse State ──
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => new Set<string>());

    const toggleExpand = (pathId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedNodes(prev => {
            const next = new Set(prev);
            if (next.has(pathId)) next.delete(pathId);
            else next.add(pathId);
            return next;
        });
    };

    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver(entries => {
            if (entries[0]) {
                const { width, height } = entries[0].contentRect;
                setDimensions(prev => {
                    // Only update and re-center if dimensions significantly changed
                    if (Math.abs(prev.w - width) > 10 || Math.abs(prev.h - height) > 10) {
                        panX.set(width / 2 - 4000);
                        panY.set(height / 2 - 4000);
                        return { w: width, h: height };
                    }
                    return prev;
                });
            }
        });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [panX, panY]);

    // ── Dynamic Layout Engine ──
    const layoutNodes = useMemo(() => {
        const nodes: SVGNode[] = [];
        const levelSpacing = 320;
        const baseVerticalSpacing = 110;

        const getSubtreeHeight = (node: MindMapNodeType, pathId: string): number => {
            if (!expandedNodes.has(pathId) || !node.children || node.children.length === 0) {
                return baseVerticalSpacing;
            }
            return node.children.reduce((sum, c, idx) => sum + getSubtreeHeight(c, `${pathId}-${idx}`), 0);
        };

        const buildLayout = (node: MindMapNodeType, level: number, x: number, y: number, parent?: SVGNode, childIdx: number = 0) => {
            const pathId = parent ? `${parent.pathId}-${childIdx}` : 'root';
            const mapped: SVGNode = { ...node, x, y, level, parent, pathId };
            nodes.push(mapped);

            if (expandedNodes.has(pathId) && node.children && node.children.length > 0) {
                const totalHeight = getSubtreeHeight(node, pathId);
                let currentY = y - totalHeight / 2;

                node.children.forEach((child, idx) => {
                    const childPathId = `${pathId}-${idx}`;
                    const childHeight = getSubtreeHeight(child, childPathId);
                    const childY = currentY + childHeight / 2;
                    buildLayout(child, level + 1, x + levelSpacing, childY, mapped, idx);
                    currentY += childHeight;
                });
            }
        };

        buildLayout(data, 0, 4000, 4000); // Position root in exact center of 8000x8000 canvas
        return nodes;
    }, [data, expandedNodes]);

    // Handle Zoom
    const handleZoom = (delta: number, pointerX: number, pointerY: number) => {
        setTargetScale(oldScale => {
            const newScale = Math.min(Math.max(0.3, oldScale + delta), 2.5);
            if (newScale === oldScale) return oldScale;

            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
                const px = pointerX - rect.left;
                const py = pointerY - rect.top;

                const contentX = (px - panX.get()) / oldScale;
                const contentY = (py - panY.get()) / oldScale;

                panX.set(px - contentX * newScale);
                panY.set(py - contentY * newScale);
            }
            return newScale;
        });
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY * -0.002;
        handleZoom(delta, e.clientX, e.clientY);
    };

    const handleZoomStep = (step: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
        const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
        handleZoom(step, cx, cy);
    };

    // Gliding Auto-Center
    useEffect(() => {
        if (!activeNodeId) return;
        const activeNode = layoutNodes.find(n => n.id === activeNodeId);
        if (activeNode) {
            panX.set((dimensions.w / 2) - activeNode.x * targetScale);
            panY.set((dimensions.h / 2) - activeNode.y * targetScale);
        }
    }, [activeNodeId, layoutNodes, dimensions.w, dimensions.h]);

    // Active path tracing
    const activePathSet = useMemo(() => {
        const set = new Set<string>();
        if (!activeNodeId) return set;
        let curr = layoutNodes.find(n => n.id === activeNodeId);
        while (curr) {
            set.add(curr.pathId);
            curr = curr.parent;
        }
        return set;
    }, [activeNodeId, layoutNodes]);

    return (
        <div
            ref={containerRef}
            className="w-full h-full relative overflow-hidden bg-void mindmap-canvas touch-none font-sans"
            style={{ cursor: 'grab' }}
            onWheel={handleWheel}
        >
            <motion.div
                drag
                dragMomentum={true}
                dragElastic={0.1}
                dragTransition={{ power: 0.2, timeConstant: 200 }}
                onDrag={(_, info) => {
                    const nextX = panX.get() + info.delta.x;
                    const nextY = panY.get() + info.delta.y;
                    panX.set(Math.min(4000, Math.max(dimensions.w - 8000, nextX)));
                    panY.set(Math.min(4000, Math.max(dimensions.h - 8000, nextY)));
                }}
                whileDrag={{ cursor: 'grabbing' }}
                className="absolute left-0 top-0 w-[8000px] h-[8000px] origin-top-left"
                style={{ x: springPanX, y: springPanY, scale: springScale }}
            >
                <svg width="8000" height="8000" className="absolute inset-0 pointer-events-none overflow-visible">
                    <defs>
                        {layoutNodes.map(node => node.parent && activePathSet.has(node.pathId) && activePathSet.has(node.parent.pathId) && (
                            <linearGradient key={`grad-${node.pathId}`} id="activeEdgeGradient" gradientUnits="userSpaceOnUse" x1={node.parent.x} y1={node.parent.y} x2={node.x} y2={node.y}>
                                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.3" />
                                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.9" />
                            </linearGradient>
                        ))}
                    </defs>
                    {layoutNodes.map(node => (
                        node.parent && (
                            <MindMapEdge
                                key={`edge-${node.parent.pathId}-${node.pathId}`}
                                source={node.parent}
                                target={node}
                                isActive={activePathSet.has(node.pathId) && activePathSet.has(node.parent.pathId)}
                                isHovered={hoveredNodeId === node.pathId || hoveredNodeId === node.parent.pathId}
                            />
                        )
                    ))}
                </svg>

                <AnimatePresence>
                    {layoutNodes.map((node) => {
                        const isActive = activeNodeId === node.id;
                        const isRoot = node.level === 0;
                        const hasChildren = node.children && node.children.length > 0;
                        const isExpanded = expandedNodes.has(node.pathId);

                        return (
                            <motion.div
                                key={node.pathId}
                                className="absolute left-0 top-0 z-[10]"
                                initial={{
                                    opacity: 0,
                                    scale: 0.8,
                                    x: node.parent ? node.parent.x : node.x,
                                    y: node.parent ? node.parent.y : node.y
                                }}
                                animate={{
                                    opacity: 1,
                                    scale: 1,
                                    x: node.x,
                                    y: node.y
                                }}
                                exit={{
                                    opacity: 0,
                                    scale: 0.8,
                                    x: node.parent ? node.parent.x : node.x,
                                    y: node.parent ? node.parent.y : node.y
                                }}
                                transition={{
                                    type: 'spring',
                                    stiffness: 280,
                                    damping: 28,
                                    mass: 0.9
                                }}
                                style={{ pointerEvents: 'none' }}
                            >
                                <div
                                    onClick={(e) => { e.stopPropagation(); onNodeSelect(node); }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onMouseEnter={() => setHoveredNodeId(node.pathId)}
                                    onMouseLeave={() => setHoveredNodeId(null)}
                                    className={`absolute flex flex-col justify-center cursor-pointer transition-colors duration-200 ease-out shadow-[0_4px_16px_rgba(0,0,0,0.2)] select-none pointer-events-auto
                                        ${isRoot
                                            ? 'px-6 py-3.5 rounded-[var(--r-xl)] border border-border-strong text-ink text-center shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] bg-gradient-to-br from-raised-2 to-raised border-l-[3px] border-l-brand'
                                            : node.level === 1
                                                ? `px-4 py-3 rounded-[var(--r-lg)] border ${isActive ? 'bg-brand-glow border-brand shadow-[0_0_0_1px_var(--brand),0_0_40px_var(--brand-glow-lg)]' : 'bg-surface-2 border-border hover:bg-raised'}`
                                                : `px-3.5 py-2 rounded-[var(--r-md)] border border-white/5 bg-surface ${isActive ? 'bg-brand-glow border-brand/50 text-ink' : 'hover:border-border hover:text-ink text-ink-2'}`
                                        }
                                    `}
                                    style={{
                                        transform: 'translate(-50%, -50%)',
                                        minWidth: isRoot ? 200 : node.level === 1 ? 180 : 140,
                                        maxWidth: isRoot ? undefined : node.level === 1 ? 220 : 180,
                                    }}
                                >
                                    <span className={`${isRoot ? 'font-[Instrument_Serif] text-[16px] leading-[1.2]' : node.level === 1 ? 'font-[Geist] font-semibold text-[14px] leading-[1.3] line-clamp-2' : 'font-[Geist] font-normal text-[13px] whitespace-nowrap overflow-hidden text-ellipsis'}`}>
                                        {node.title}
                                    </span>

                                    {node.level === 1 && (
                                        <span className="font-mono text-[10px] tracking-[0.1em] text-brand uppercase mt-1">
                                            CHAPTER {node.id.split('-').pop()}
                                        </span>
                                    )}

                                    {/* Expand Pill Level 0 */}
                                    {isRoot && hasChildren && (
                                        <button
                                            onClick={(e) => toggleExpand(node.pathId, e)}
                                            className="absolute -right-12 top-1/2 -translate-y-1/2 w-[24px] h-[24px] rounded-full bg-raised-2 border border-border flex items-center justify-center font-mono text-[14px] text-ink-2 hover:bg-raised hover:text-ink transition-colors"
                                        >
                                            {isExpanded ? '−' : '+'}
                                        </button>
                                    )}

                                    {/* Expand Button Level 1 */}
                                    {node.level === 1 && hasChildren && (
                                        <button
                                            onClick={(e) => toggleExpand(node.pathId, e)}
                                            onPointerDown={(e) => e.stopPropagation()}
                                            className={`absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center shadow-md transition-all duration-200 ${isExpanded
                                                ? 'bg-raised-2 text-ink-3 hover:text-ink hover:bg-raised'
                                                : 'bg-brand text-white shadow-[0_0_12px_rgba(59,130,246,0.4)]'
                                                }`}
                                        >
                                            <div style={{ transform: `rotate(${isExpanded ? 45 : 0}deg)`, transition: 'transform 0.2s' }}>
                                                <Plus className="w-3 h-3" strokeWidth={3} />
                                            </div>
                                        </button>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </motion.div>

            {/* Zoom/Pan Controls */}
            <div className="absolute bottom-6 md:bottom-8 right-4 md:right-6 flex items-center gap-[1px] bg-raised-2 p-[1px] rounded-[var(--r-full)] overflow-hidden shadow-xl border border-border/50 backdrop-blur-md z-40">
                <button
                    onClick={() => handleZoomStep(-0.2)}
                    className="w-9 h-9 flex items-center justify-center bg-raised-2 hover:bg-raised hover:text-ink transition-colors text-ink-2 font-mono text-[15px]"
                >
                    −
                </button>
                <button
                    onClick={() => { setTargetScale(1); panX.set(dimensions.w / 2 - 4000); panY.set(dimensions.h / 2 - 4000); }}
                    className="w-[72px] h-9 flex items-center justify-center bg-raised-2 hover:bg-raised hover:text-ink transition-colors font-mono text-[10px] tracking-[0.1em] text-ink-2 uppercase"
                >
                    Center
                </button>
                <button
                    onClick={() => handleZoomStep(0.2)}
                    className="w-9 h-9 flex items-center justify-center bg-raised-2 hover:bg-raised hover:text-ink transition-colors text-ink-2 font-mono text-[15px]"
                >
                    +
                </button>
            </div>
        </div>
    );
};
