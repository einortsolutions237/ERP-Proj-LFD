// Doc ID is the customerId itself — one record per customer, upserted in
// place, never a new doc per visit. Name/phone/address already live on
// `customers`; this holds only the facts that don't belong on the general
// commercial record.
export interface PatientDemographics {
  customerId: string
  maritalStatus: string | null
  religion: string | null
  occupation: string | null
  referralName: string | null
  recordedBy: string
  recordedAt: FirebaseFirestore.Timestamp
  updatedAt: FirebaseFirestore.Timestamp
}
