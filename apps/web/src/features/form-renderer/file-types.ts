import { en, type FileCategory, type FormMessages } from '@formyx/shared';

export const FILE_CATEGORY_LABELS: Record<FileCategory, string> = {
  image: 'Images',
  pdf: 'PDF',
  document: 'Documents',
  spreadsheet: 'Spreadsheets',
  presentation: 'Presentations',
  audio: 'Audio',
  video: 'Video',
  archive: 'Archives',
};

const ACCEPT: Record<FileCategory, string[]> = {
  image: ['image/*'],
  pdf: ['.pdf', 'application/pdf'],
  document: ['.doc', '.docx', '.odt', '.rtf', '.txt'],
  spreadsheet: ['.xls', '.xlsx', '.ods', '.csv'],
  presentation: ['.ppt', '.pptx', '.odp', '.key'],
  audio: ['audio/*'],
  video: ['video/*'],
  archive: ['.zip', '.rar', '.7z', '.tar', '.gz'],
};

/** Value for an `<input type="file" accept>`. */
export function acceptAttribute(categories: readonly FileCategory[]): string {
  return categories.flatMap((category) => ACCEPT[category]).join(',');
}

const KIND_KEYS: Record<FileCategory, keyof FormMessages['upload']['kinds'] | null> = {
  image: 'images',
  pdf: null,
  document: 'documents',
  spreadsheet: 'spreadsheets',
  presentation: 'presentations',
  audio: 'audio',
  video: 'video',
  archive: 'archives',
};

/**
 * "PDF or images, up to 10 MB"; in other languages, the kinds in their words and the size:
 * "PDF, చిత్రాలు · 10 MB".
 */
export function fileHint(
  categories: readonly FileCategory[],
  maxSizeMb: number,
  messages?: FormMessages,
): string {
  if (messages && messages !== en) {
    const kinds = categories.map((category) => {
      const key = KIND_KEYS[category];
      return key ? messages.upload.kinds[key] : 'PDF';
    });
    return `${kinds.length > 0 ? kinds.join(', ') : messages.upload.anyFile} · ${maxSizeMb} MB`;
  }
  const names = categories.map((category, index) =>
    index === 0 ? FILE_CATEGORY_LABELS[category] : FILE_CATEGORY_LABELS[category].toLowerCase(),
  );
  const list =
    names.length <= 1
      ? (names[0] ?? 'Any file')
      : `${names.slice(0, -1).join(', ')} or ${names.at(-1) ?? ''}`;
  return `${list}, up to ${maxSizeMb} MB`;
}
