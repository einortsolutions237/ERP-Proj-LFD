// Two leftover QA test customers that can never actually be deleted — each
// is referenced by an immutable record (labOrders / sales respectively)
// this app's design permanently forbids deleting through any route. See
// Phase 37 Task 6's completion report for the full investigation. Excluding
// them here (rather than deleting the customer or its referencing records)
// is the only safe way to close the real mis-click risk a cashier faces
// picking a customer mid-sale.
export const EXCLUDED_FROM_SALE_PICKER_CUSTOMER_IDS: readonly string[] = [
  'tcjuA9fEe8YZfXC9iN2C', // "Lab Test Only Customer"
  'ZTWFMTRLoHapaIQPWAu3', // "Phase 18 Verification Customer"
]
