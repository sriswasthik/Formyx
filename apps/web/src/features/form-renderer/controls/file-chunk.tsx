import { FileControl } from '../file-control';
import type { ControlProps } from '../types';

/** File questions' control, in a chunk of its own: most forms have no file question. */
export function Control(props: ControlProps) {
  return props.field.type === 'file' ? <FileControl {...props} field={props.field} /> : null;
}
