import {
  CHECKOUT_CURRENCY,
  CHECKOUT_TOTAL_MINOR,
  type CheckoutDependencies,
  type CheckoutInput,
  type CheckoutResult,
} from "./types.ts";

export async function checkout(
  input: CheckoutInput,
  deps: CheckoutDependencies,
): Promise<CheckoutResult> {
  if (!input.purchaseIntentId || input.idempotencyKey !== input.purchaseIntentId) {
    throw new Error("purchaseIntentId and idempotencyKey must match");
  }

  const charge = await deps.charge({
    purchaseIntentId: input.purchaseIntentId,
    idempotencyKey: input.idempotencyKey,
    amountMinor: CHECKOUT_TOTAL_MINOR,
    currency: CHECKOUT_CURRENCY,
  });
  const order = await deps.createOrder({
    purchaseIntentId: input.purchaseIntentId,
    idempotencyKey: input.idempotencyKey,
    amountMinor: CHECKOUT_TOTAL_MINOR,
    currency: CHECKOUT_CURRENCY,
    chargeId: charge.id,
  });

  return {
    orderId: order.id,
    chargeId: charge.id,
    purchaseIntentId: input.purchaseIntentId,
    totalMinor: CHECKOUT_TOTAL_MINOR,
    currency: CHECKOUT_CURRENCY,
  };
}
