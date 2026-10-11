import '@xyflow/react/dist/style.css';
import { analyzeLogic, type FormSchema, type LogicGraph, type LogicNode } from '@formyx/shared';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useThemeStore } from '@/features/theme/theme-store';
import { warningSubject } from './warning-subject';

/*
 * The read-only logic map: pages top to bottom, end screens in a column beside them, and
 * arrows for where each page leads. Arrows to end screens leave from a page's side, and jumps
 * past pages go round the left, so no arrow crosses a page. Warnings mark pages and end
 * screens nobody can reach. A list of the same routes sits beside it for keyboards and
 * screen readers.
 */

/** React Flow keeps node data as a record. */
interface MapNodeData extends Record<string, unknown> {
  node: LogicNode;
  warning: string | null;
}

const PAGE_GAP = 140;
const SCREEN_GAP = 110;
/** From the pages' column to the end screens'. */
const SCREEN_COLUMN_X = 320;
/** How far a jump past pages swings out to the left, growing with each one. */
const SKIP_OFFSET = 24;
const SKIP_OFFSET_STEP = 16;

function MapNode({ data }: NodeProps<Node<MapNodeData>>) {
  const { node, warning } = data;
  const page = node.kind === 'page';
  return (
    <div
      className={cn(
        'flex w-48 flex-col gap-0.5 rounded-lg border bg-background px-3 py-2 text-left',
        page ? 'border-border' : 'border-dashed border-border-strong',
        warning && 'border-warning',
      )}
    >
      {page ? (
        <>
          <Handle id="top" type="target" position={Position.Top} className="opacity-0" />
          <Handle id="left-in" type="target" position={Position.Left} className="opacity-0" />
        </>
      ) : (
        <Handle id="left-in" type="target" position={Position.Left} className="opacity-0" />
      )}
      <span className="text-12 font-medium text-muted-foreground">
        {page ? `Page ${node.index + 1}` : 'End screen'}
      </span>
      <span className="truncate text-13 font-medium">{page ? node.title : node.name}</span>
      {page && (
        <span className="text-12 text-muted-foreground tabular-nums">
          {node.questions === 1 ? '1 question' : `${node.questions} questions`}
        </span>
      )}
      {warning && (
        <span className="flex items-center gap-1 text-12 text-warning-text">
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          {warning}
        </span>
      )}
      {page && (
        <>
          <Handle id="bottom" type="source" position={Position.Bottom} className="opacity-0" />
          <Handle id="left-out" type="source" position={Position.Left} className="opacity-0" />
          <Handle id="right" type="source" position={Position.Right} className="opacity-0" />
        </>
      )}
    </div>
  );
}

const nodeTypes = { logic: MapNode };

function nodeId(node: LogicNode): string {
  return node.kind === 'page' ? node.key : node.id;
}

function warningFor(graph: LogicGraph, node: LogicNode): string | null {
  const found = graph.warnings.find((warning) =>
    node.kind === 'page'
      ? 'pageKey' in warning && warning.pageKey === node.key && warning.kind !== 'unused_jump'
      : 'endScreenId' in warning && warning.endScreenId === node.id,
  );
  return found?.message ?? null;
}

function toFlow(graph: LogicGraph): { nodes: Node<MapNodeData>[]; edges: Edge[] } {
  const pages = graph.nodes.filter((node) => node.kind === 'page');
  const screens = graph.nodes.filter((node) => node.kind === 'end');
  // The end screens sit level with the middle of the pages.
  const screensTop = Math.max(
    0,
    ((pages.length - 1) * PAGE_GAP - (screens.length - 1) * SCREEN_GAP) / 2,
  );
  const nodes: Node<MapNodeData>[] = [
    ...pages.map((node, index) => ({
      id: nodeId(node),
      type: 'logic',
      position: { x: 0, y: index * PAGE_GAP },
      data: { node, warning: warningFor(graph, node) },
    })),
    ...screens.map((node, index) => ({
      id: nodeId(node),
      type: 'logic',
      position: { x: SCREEN_COLUMN_X, y: screensTop + index * SCREEN_GAP },
      data: { node, warning: warningFor(graph, node) },
    })),
  ];
  const pageIndex = new Map(pages.map((node) => [nodeId(node), node.index]));
  let skips = 0;
  // Arrows into end screens turn at different points between the columns, so their
  // labels never sit on top of each other.
  const toEnds = graph.edges.filter((edge) => !pageIndex.has(edge.to)).length;
  let ends = 0;
  const edges: Edge[] = graph.edges.map((edge) => {
    const from = pageIndex.get(edge.from) ?? 0;
    const to = pageIndex.get(edge.to);
    // To the next page: straight down. Past pages: round the left. To an end: the right.
    const route =
      to === undefined
        ? {
            sourceHandle: 'right',
            targetHandle: 'left-in',
            pathOptions: { stepPosition: (ends++ + 1) / (toEnds + 1) },
          }
        : to === from + 1
          ? { sourceHandle: 'bottom', targetHandle: 'top' }
          : {
              sourceHandle: 'left-out',
              targetHandle: 'left-in',
              pathOptions: { offset: SKIP_OFFSET + SKIP_OFFSET_STEP * skips++ },
            };
    return {
      id: edge.id,
      source: edge.from,
      target: edge.to,
      sourceHandle: route.sourceHandle,
      targetHandle: route.targetHandle,
      type: 'smoothstep',
      ...('pathOptions' in route && { pathOptions: route.pathOptions }),
      label: edge.kind === 'jump' ? (edge.conditional ? 'If…' : 'Always') : undefined,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: edge.conditional ? { strokeDasharray: '6 4' } : undefined,
    };
  });
  return { nodes, edges };
}

function routeText(graph: LogicGraph): string[] {
  const nameOf = (id: string) => {
    const node = graph.nodes.find((candidate) => nodeId(candidate) === id);
    if (!node) return 'a removed page';
    return node.kind === 'page'
      ? `Page ${node.index + 1} (${node.title})`
      : `end screen "${node.name}"`;
  };
  return graph.edges.map((edge) => {
    const from = nameOf(edge.from);
    const to = nameOf(edge.to);
    if (edge.kind === 'next') return `${from} otherwise goes on to ${to}.`;
    if (edge.kind === 'finish') {
      return edge.conditional
        ? `${from} ends on ${to} when that end screen's conditions hold.`
        : `${from} ends on ${to}.`;
    }
    return edge.conditional
      ? `${from} jumps to ${to} when the jump's conditions hold.`
      : `${from} always jumps to ${to}.`;
  });
}

/** The form's pages and jumps as a map, with the same routes as text. */
export default function LogicMap({ schema }: { schema: Pick<FormSchema, 'fields' | 'logic'> }) {
  const graph = useMemo(() => analyzeLogic(schema), [schema]);
  const flow = useMemo(() => toFlow(graph), [graph]);
  const routes = useMemo(() => routeText(graph), [graph]);
  // React Flow marks its root `light` or `dark`, which also picks the app's tokens there.
  const colorMode = useThemeStore((state) => state.preference);

  return (
    // Stacked on small screens, where the body scrolls; side by side from lg. The map needs
    // a height of its own (not one from flex) for React Flow to fill.
    <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 lg:flex-row lg:overflow-visible">
      <div
        role="group"
        aria-label="Map of pages and end screens, with the same routes listed as text"
        className="h-[55dvh] min-h-80 shrink-0 overflow-hidden rounded-lg border bg-surface lg:h-[60dvh] lg:flex-1 lg:shrink"
      >
        <ReactFlow
          nodes={flow.nodes}
          edges={flow.edges}
          nodeTypes={nodeTypes}
          colorMode={colorMode}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          minZoom={0.3}
        >
          <Background gap={16} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <section aria-label="Routes" className="flex w-full flex-col gap-3 lg:w-72">
        {graph.warnings.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-13 font-medium">Warnings</h3>
            <ul className="flex flex-col gap-1.5">
              {graph.warnings.map((warning, index) => {
                const name = warningSubject(graph, warning);
                return (
                  <li key={index} className="flex gap-2 text-13">
                    <TriangleAlert
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0 text-warning-text"
                    />
                    <span>
                      <span className="font-medium">{name}:</span> {warning.message}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <h3 className="text-13 font-medium">Routes</h3>
          <ul className="flex flex-col gap-1.5 text-13 text-muted-foreground">
            {routes.map((route, index) => (
              <li key={index}>{route}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
