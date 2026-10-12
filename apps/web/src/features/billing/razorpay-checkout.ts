import type { Checkout, VerifyCheckoutInput } from '@formyx/shared';

/*
 * Razorpay Checkout: Razorpay's own payment window, loaded only when someone pays (never on
 * public forms). It reports back what to check on the server; the plan itself changes when
 * Razorpay's webhook confirms the payment.
 */

/** Razorpay's script; end-to-end tests point VITE_RAZORPAY_CHECKOUT_URL at a stand-in. */
const CHECKOUT_URL =
  import.meta.env.VITE_RAZORPAY_CHECKOUT_URL || 'https://checkout.razorpay.com/v1/checkout.js';

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  subscription_id: string;
  name: string;
  description: string;
  prefill: { name: string; email: string };
  theme: { color: string };
  handler: (response: RazorpayResponse) => void;
  modal: { ondismiss: () => void; escape: boolean; confirm_close: boolean };
}

interface RazorpayInstance {
  open(): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

let loading: Promise<void> | null = null;

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_URL;
    script.async = true;
    script.onload = () => {
      resolve();
    };
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new CheckoutError('failed', 'Razorpay could not be loaded. Check your connection.'));
    };
    document.head.append(script);
  });
  return loading;
}

export class CheckoutError extends Error {
  constructor(
    /** `dismissed`: closed without paying. `failed`: the payment or the window failed. */
    readonly reason: 'dismissed' | 'failed',
    message: string,
  ) {
    super(message);
    this.name = 'CheckoutError';
  }
}

/** Opens Checkout for `checkout` and resolves with what the server checks once paid. */
export async function openCheckout(
  checkout: Checkout,
  description: string,
): Promise<VerifyCheckoutInput> {
  await loadCheckout();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new CheckoutError('failed', 'Razorpay could not be loaded.');
  return new Promise((resolve, reject) => {
    const instance = new Razorpay({
      key: checkout.keyId,
      subscription_id: checkout.subscriptionId,
      name: 'Formyx',
      description,
      prefill: checkout.prefill,
      // The builder app's primary colour (zinc-900).
      theme: { color: '#18181B' },
      handler: (response) => {
        resolve({
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySubscriptionId: response.razorpay_subscription_id,
          razorpaySignature: response.razorpay_signature,
        });
      },
      modal: {
        ondismiss: () => {
          reject(new CheckoutError('dismissed', 'Checkout was closed.'));
        },
        escape: true,
        confirm_close: true,
      },
    });
    // A failed payment keeps Checkout open, so another method can be tried there.
    instance.open();
  });
}
