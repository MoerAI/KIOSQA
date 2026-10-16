export const CHECKOUT_TOTAL_MINOR = 1450;
export const CHECKOUT_CURRENCY = "USD";

export interface CheckoutInput {
  purchaseIntentId: string;
  idempotencyKey: string;
}

export interface ChargeRequest {
  purchaseIntentId: string;
  idempotencyKey: string;
  amountMinor: number;
  currency: string;
}

export interface ChargeRecord extends ChargeRequest {
  id: string;
}

export interface CreateOrderRequest {
  purchaseIntentId: string;
  idempotencyKey: string;
  amountMinor: number;
  currency: string;
  chargeId: string;
}

export interface OrderRecord extends CreateOrderRequest {
  id: string;
}

export interface CheckoutDependencies {
  charge(request: ChargeRequest): Promise<ChargeRecord>;
  createOrder(request: CreateOrderRequest): Promise<OrderRecord>;
}

export interface CheckoutResult {
  orderId: string;
  chargeId: string;
  purchaseIntentId: string;
  totalMinor: number;
  currency: string;
}
