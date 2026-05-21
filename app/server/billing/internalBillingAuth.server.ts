const HEADER = "x-spark-internal-secret";

export function verifyInternalBillingSecret(request: Request): boolean {
  const expected = process.env.SPARK_INTERNAL_BILLING_SECRET?.trim();
  if (!expected) {
    console.warn("[InternalBilling] SPARK_INTERNAL_BILLING_SECRET is not set");
    return false;
  }
  const provided = request.headers.get(HEADER)?.trim();
  return provided === expected;
}
