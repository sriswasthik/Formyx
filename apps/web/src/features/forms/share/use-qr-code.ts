import { PLAIN_QR_COLORS, type QrColors } from '@formyx/shared';
import { useEffect, useState } from 'react';

export type QrCodeState =
  { status: 'loading' } | { status: 'ready'; dataUrl: string } | { status: 'error' };

/**
 * A PNG data URL of a QR code for `text`, in `colors` (see `qrCodeColors`). The encoder loads
 * only when first needed, so it stays out of the editor's bundle.
 */
export function useQrCode(text: string, colors: QrColors = PLAIN_QR_COLORS): QrCodeState {
  const { dark, light } = colors;
  const [state, setState] = useState<QrCodeState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    import('qrcode')
      .then(({ toDataURL }) =>
        toDataURL(text, {
          width: 512,
          margin: 2,
          errorCorrectionLevel: 'M',
          // Scanners need dark on light, whatever the app's theme.
          color: { dark, light },
        }),
      )
      .then(
        (dataUrl) => {
          if (!cancelled) setState({ status: 'ready', dataUrl });
        },
        () => {
          if (!cancelled) setState({ status: 'error' });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [text, dark, light]);

  return state;
}
