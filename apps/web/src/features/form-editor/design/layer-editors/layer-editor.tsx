import type { BackgroundLayer } from '@formyx/shared';
import { useEditorStore } from '../../editor-store-context';
import { updateLayer } from '../layer-edits';
import { LayerBasics, type LayerChange } from './common';
import { LinearEditor, RadialEditor, SolidEditor } from './gradient-editors';
import { ImageEditor } from './image-editor';
import { MeshEditor } from './mesh-editor';
import { ShapesEditor } from './shapes-editor';
import { TextureEditor } from './texture-editor';

/** Changes to the layer with this id, wherever it now sits. */
function useLayerChange(id: string): LayerChange {
  const updateTheme = useEditorStore((state) => state.updateTheme);
  return (update, options) => {
    updateTheme((theme) => updateLayer(theme, id, update), options);
  };
}

/** `change` for one kind of layer: dropped if the layer has since become another kind. */
function forKind<L extends BackgroundLayer>(change: LayerChange, layer: L): LayerChange<L> {
  return (update, options) => {
    change((current) => (current.type === layer.type ? update(current as L) : current), options);
  };
}

function KindEditor({ layer, onChange }: { layer: BackgroundLayer; onChange: LayerChange }) {
  switch (layer.type) {
    case 'solid':
      return <SolidEditor layer={layer} onChange={forKind(onChange, layer)} />;
    case 'linear':
      return <LinearEditor layer={layer} onChange={forKind(onChange, layer)} />;
    case 'radial':
      return <RadialEditor layer={layer} onChange={forKind(onChange, layer)} />;
    case 'mesh':
      return <MeshEditor layer={layer} onChange={forKind(onChange, layer)} />;
    case 'texture':
      return <TextureEditor layer={layer} onChange={forKind(onChange, layer)} />;
    case 'shapes':
      return <ShapesEditor layer={layer} onChange={forKind(onChange, layer)} />;
    case 'image':
      return <ImageEditor layer={layer} onChange={forKind(onChange, layer)} />;
  }
}

/** The controls for one background layer: its own, then opacity and blend mode. */
export function LayerEditor({ layer }: { layer: BackgroundLayer }) {
  const onChange = useLayerChange(layer.id);
  return (
    <div className="flex flex-col gap-5">
      <KindEditor layer={layer} onChange={onChange} />
      <LayerBasics layer={layer} onChange={onChange} />
    </div>
  );
}
