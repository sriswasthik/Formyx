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

/*
 * The read-only logic map: pages top to bottom, end screens along the bottom, and arrows
 * for where each page leads. Warnings mark pages and end screens nobody can reach. A list
 * of the same routes sits beside it for keyboards and screen readers.
 */

/** React Flow keeps node data as a record. */
interface MapNodeData extends Record<string, unknown> {
  node: LogicNode;
  warning: string | null;
}

const PAGE_GAP = 130;
const SCREEN_GAP = 220;

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
      <Handle type="target" position={Position.Top} className="opacity-0" />
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
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
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
  const width = Math.max(1, screens.length) * SCREEN_GAP;
  const nodes: Node<MapNodeData>[] = [
    ...pages.map((node, index) => ({
      id: nodeId(node),
      type: 'logic',
      position: { x: width / 2 - 96, y: index * PAGE_GAP },
      data: { node, warning: warningFor(graph, node) },
    })),
    ...screens.map((node, index) => ({
      id: nodeId(node),
      type: 'logic',
      position: { x: index * SCREEN_GAP, y: pages.length * PAGE_GAP + 40 },
      data: { node, warning: warningFor(graph, node) },
    })),
  ];
  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    type: 'smoothstep',
    animated: false,
    label: edge.kind === 'jump' ? (edge.conditional ? 'If…' : 'Always') : undefined,
    markerEnd: { type: MarkerType.ArrowClosed },
    className: cn(edge.kind === 'jump' && 'logic-jump', edge.conditional && 'logic-conditional'),
    style: edge.conditional ? { strokeDasharray: '6 4' } : undefined,
  }));
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
    const how =
      edge.kind === 'next'
        ? 'otherwise goes on to'
        : edge.kind === 'finish'
          ? edge.conditional
            ? 'ends, when its conditions hold, on'
            : 'ends on'
          : edge.conditional
            ? 'jumps, when its conditions hold, to'
            : 'always jumps to';
    return `${nameOf(edge.from)} ${how} ${nameOf(edge.to)}.`;
  });
}

/** The form's pages and jumps as a map, with the same routes as text. */
export default function LogicMap({ schema }: { schema: Pick<FormSchema, 'fields' | 'logic'> }) {
  const graph = useMemo(() => analyzeLogic(schema), [schema]);
  const flow = useMemo(() => toFlow(graph), [graph]);
  const routes = useMemo(() => routeText(graph), [graph]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      <div
        className="h-[60dvh] min-h-80 flex-1 overflow-hidden rounded-lg border bg-surface"
        aria-hidden
      >
        <ReactFlow
          nodes={flow.nodes}
          edges={flow.edges}
          nodeTypes={nodeTypes}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
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
                const subject =
                  'pageKey' in warning
                    ? graph.nodes.find(
                        (node) => node.kind === 'page' && node.key === warning.pageKey,
                      )
                    : graph.nodes.find(
                        (node) => node.kind === 'end' && node.id === warning.endScreenId,
                      );
                const name = !subject
                  ? ''
                  : subject.kind === 'page'
                    ? `Page ${subject.index + 1}`
                    : subject.name;
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
