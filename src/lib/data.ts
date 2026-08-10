// RentVue - Seed data and types
export type PropertyType = "short-term" | "long-term";
export type PropertyStatus = "occupied" | "vacant";
export type PaymentStatus = "paid" | "pending" | "overdue";
export type PaymentMethod = "credit card" | "ACH" | "check" | "utility" | "security_deposit";
export type MaintenanceStatus = "open" | "in-progress" | "resolved";
export type MaintenancePriority = "low" | "medium" | "high" | "urgent";
export type PayoutStatus = "pending" | "paid";

// ── OTA / Listing types ──
export type BedType = "king" | "queen" | "double" | "twin" | "bunk" | "sofa_bed" | "crib";
export type PetPolicy = "allowed" | "not_allowed" | "on_request" | "restrictions";
export type PropertySubtype = "house" | "apartment" | "condo" | "townhouse" | "cabin" | "villa" | "studio" | "loft" | "cottage" | "other";
export interface BedConfig { type: BedType; count: number; }
export interface PropertyImage { url: string; caption: string; room?: string; }

export interface Property {
  id: string;
  name: string;
  address: string;
  type: PropertyType;
  monthlyRent: number;
  nightlyRate?: number;
  deposit: number;
  status: PropertyStatus;
  leaseStart?: string;
  leaseEnd?: string;
  ownerId: string;
  image?: string;
  images?: (string | PropertyImage)[];
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  description: string;
  amenities: string[];
  maxGuests: number;
  // ── OTA / listing fields ──
  weeklyRate?: number;
  minimumAge?: number;
  cancellationPolicy?: string;
  cancellationDetails?: string;
  beds?: BedConfig[];
  checkInTime?: string;
  checkOutTime?: string;
  houseRules?: string[];
  minStay?: number;
  maxStay?: number;
  petPolicy?: PetPolicy;
  petPolicyDetails?: string;
  propertySubtype?: PropertySubtype;
  floorLevel?: string;
}

export interface Tenant {
  id: string;
  name: string;
  email: string;
  phone: string;
  address?: string;
  propertyId: string;
  type: "tenant" | "guest";
  leaseStart?: string;
  leaseEnd?: string;
  rentAmount?: number;
  deposit?: number;
  bookingStart?: string;
  bookingEnd?: string;
  nightlyRate?: number;
  checkoutStatus?: "checked-in" | "checked-out" | "upcoming";
}

export interface Payment {
  id: string;
  propertyId: string;
  tenantId: string;
  amount: number;
  date: string;
  dueDate: string;
  status: PaymentStatus;
  method: PaymentMethod;
  description: string;
  commissionable?: boolean;
}

export interface MaintenanceRequest {
  id: string;
  propertyId: string;
  description: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  assignedTo: string;
  dateReported: string;
  dateResolved?: string;
  cost: number; // in cents
  chargedToOwner: boolean; // true if cost is deducted from owner payout
  // AI triage fields
  reportedBy?: string;
  reportedByEmail?: string;
  category?: string; // e.g. "plumbing", "appliance", "hvac", "electrical", "structural", "general"
  sourceMessage?: string; // original guest message that created this ticket
  vendorEmail?: string;
  vendorAccepted?: boolean;
  vendorAcceptedAt?: string;
  // Vendor & notes
  vendorId?: string;
  notes: { text: string; timestamp: string }[];
}

export interface Vendor {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  serviceTypes: string[]; // e.g. ["plumbing", "electrical", "hvac"]
  achInfo: { bankName: string; routingNumber: string; accountNumber: string };
  mailingAddress?: { street: string; city: string; state: string; zip: string };
  notes: string;
  createdAt: string;
}

export type VendorPayoutStatus = "pending" | "paid";
export type VendorPaymentMethod = "ACH" | "check";

export interface VendorPayout {
  id: string;
  vendorId: string;
  maintenanceRequestId: string;
  amount: number; // in cents
  status: VendorPayoutStatus;
  paymentMethod: VendorPaymentMethod;
  datePaid?: string;
  period: string;
}

export type OwnerChargeStatus = "pending" | "success";

export interface OwnerCharge {
  id: string;
  ownerId: string;
  amount: number; // in cents
  description: string;
  maintenanceRequestId?: string;
  date: string;
  status: OwnerChargeStatus;
}

export type GuestMessageStatus = "new" | "replied" | "resolved";

export interface GuestMessage {
  id: string;
  guestName: string;
  guestEmail: string;
  bookingId?: string;
  propertyId?: string;
  subject: string;
  message: string;
  category: string; // "maintenance" | "billing" | "complaint" | "question"
  autoReplySent: boolean;
  ticketId?: string;
  createdAt: string;
  status: GuestMessageStatus;
}

export interface PropertyGuide {
  id: string;
  propertyId: string;
  // Owner onboarding fields
  ownerName?: string;
  einSsn?: string;
  routingNumber?: string;
  accountNumber?: string;
  // Access
  doorCode?: string;
  masterDoorCode?: string;
  lockboxCode?: string;
  keyPickupInstructions?: string;
  // Wi-Fi
  wifiName?: string;
  wifiPassword?: string;
  // Times
  checkInTime: string;
  checkoutTime: string;
  // Parking
  parkingInfo: string;
  parkingSpots?: number;
  directions: string;
  // Rules
  houseRules: string[];
  // Emergency
  emergencyContact: string;
  emergencyPhone: string;
  nearestHospital: string;
  nearestHospitalAddress: string;
  emergencyContacts?: { name: string; relationship: string; phone: string }[];
  fireDepartment?: string;
  policeNonEmergency?: string;
  // Guidebook
  localRecommendations: { name: string; type: string; description: string; address?: string }[];
  checkoutInstructions: string[];
  // Utilities
  utilityInfo?: { electric?: string; electricAccount?: string; water?: string; waterAccount?: string; gas?: string; gasAccount?: string; trash?: string; other?: string };
  // Amenities detail
  amenityInfo?: { name: string; accessInfo: string }[];
  // Appliances
  applianceInfo?: { name: string; makeModel: string; notes: string }[];
  // Misc
  additionalNotes?: string;
}

export interface Owner {
  id: string;
  name: string;
  email: string;
  phone: string;
  tin: string; // EIN or SSN
  address: { street: string; city: string; state: string; zip: string };
  achInfo: { bankName: string; routingNumber: string; accountNumber: string };
  propertyIds: string[];
  createdAt: string;
}

export type PayoutMethod = "ACH" | "check";
export interface OwnerPayout {
  id: string;
  ownerId: string;
  propertyId: string;
  period: string;
  amount: number;
  status: PayoutStatus;
  datePaid?: string;
  method?: PayoutMethod;
}

export interface Booking {
  id: string;
  reservationNumber: string;
  propertyId: string;
  guestName: string;
  guestEmail: string;
  startDate: string;
  guestPhone?: string;
  guestAddress?: string;
  endDate: string;
  nightlyRate: number;
  status: "confirmed" | "checked-in" | "checked-out" | "cancelled";
  totalAmount: number;
  source: "direct" | "airbnb" | "bookingcom" | "booking.com" | "vrbo";
  commissionRate: number; // decimal (0.15, 0.25) — actual rate charged on this booking
  createdAt: string; // ISO date string
  createdBy: string; // name of team member who created the booking
  securityDeposit?: number; // optional security deposit amount in dollars
  cleaningFee?: number; // cleaning fee in dollars (stored per-booking)
  linenFee?: number; // linen/laundry fee in dollars (stored per-booking)
  taxAmount?: number; // tax collected on this booking in dollars
  activityLog?: ActivityLogEntry[];
  emailLog?: EmailLogEntry[];
}

export interface ActivityLogEntry {
  timestamp: string;
  action: string;
  user: string;
}

export interface EmailLogEntry {
  id: string;
  subject: string;
  direction: "sent" | "received";
  date: string;
  preview: string;
}

export interface CalendarBlock {
  id: string;
  propertyId: string;
  type: "booking" | "maintenance" | "blocked" | "lease";
  startDate: string;
  endDate: string;
  title: string;
  color: string;
}

export interface SignedDocument {
  id: string;
  bookingId?: string;
  propertyId: string;
  ownerId: string;
  type: "lease" | "rental-agreement" | "owner-agreement" | "addendum";
  title: string;
  sentTo: string;
  sentToName: string;
  status: "draft" | "sent" | "viewed" | "renter-signed" | "fully-executed";
  sentAt?: string;
  signedAt?: string;
  signedByName?: string;
  renterSignedByName?: string;
  renterSignedAt?: string;
  ownerSignedByName?: string;
  ownerSignedAt?: string;
  ownerEmail?: string;
  requiresOwnerSignature?: boolean;
  content: string;
  createdAt: string;
}

export interface DocumentTemplate {
  id: string;
  name: string;
  type: "lease" | "rental-agreement" | "house-rules" | "owner-agreement" | "addendum" | "other";
  content: string; // contains {{placeholders}}
  createdAt: string;
  updatedAt: string;
}

// Seed data
export const owners: Owner[] = [
  {
    id: "o1", name: "Robert Chen", email: "robert@example.com", phone: "(555) 111-2222",
    tin: "12-3456789",
    address: { street: "456 Harbor Blvd", city: "Santa Monica", state: "CA", zip: "90401" },
    achInfo: { bankName: "Chase Bank", routingNumber: "021000021", accountNumber: "XXXX6789" },
    propertyIds: ["p1", "p4"], createdAt: "2024-01-01",
  },
  {
    id: "o2", name: "Maria Santos", email: "maria@example.com", phone: "(555) 333-4444",
    tin: "98-7654321",
    address: { street: "789 Mountain Rd", city: "Lake Tahoe", state: "CA", zip: "96150" },
    achInfo: { bankName: "Wells Fargo", routingNumber: "121000248", accountNumber: "XXXX3456" },
    propertyIds: ["p2", "p5"], createdAt: "2024-02-15",
  },
  {
    id: "o3", name: "James Wilson", email: "james@example.com", phone: "(555) 555-6666",
    tin: "45-6789012",
    address: { street: "321 Downtown Ave", city: "San Francisco", state: "CA", zip: "94102" },
    achInfo: { bankName: "Bank of America", routingNumber: "121000358", accountNumber: "XXXX9012" },
    propertyIds: ["p3", "p6"], createdAt: "2024-03-10",
  },
];

export const properties: Property[] = [
  {
    id: "p1", name: "Sunset Villa", address: "123 Ocean Drive, Santa Monica, CA 90401",
    type: "short-term", monthlyRent: 4500, nightlyRate: 450, deposit: 1000, status: "occupied",
    ownerId: "o1", image: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=400&h=300&fit=crop",
    images: [
      { url: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&h=600&fit=crop", caption: "Ocean view from the deck", room: "Deck" },
      { url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&h=600&fit=crop", caption: "Spacious living room", room: "Living Room" },
      { url: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&h=600&fit=crop", caption: "Master bedroom with ocean view", room: "Master Bedroom" },
    ],
    bedrooms: 3, bathrooms: 2, sqft: 1800, maxGuests: 6,
    description: "Stunning beachfront villa with panoramic ocean views. Features a modern kitchen, spacious living area, and private deck. Steps from the sand — perfect for family getaways.",
    amenities: ["Ocean View","Private Deck","Full Kitchen","WiFi","Parking","AC","Washer/Dryer","BBQ Grill"],
    cancellationPolicy: "Strict", cancellationDetails: "Full refund 60 days prior; 50% refund 30-60 days; no refund within 30 days of check-in.",
    beds: [{ type: "king", count: 1 }, { type: "queen", count: 1 }, { type: "twin", count: 2 }],
    checkInTime: "15:00", checkOutTime: "11:00",
    houseRules: ["No parties", "No smoking indoors", "Quiet hours 10pm-7am", "Rinse sand before entering"],
    minStay: 3, maxStay: 30,
    petPolicy: "restrictions", petPolicyDetails: "Dogs under 50lbs with prior approval, $100 pet fee per stay.",
    propertySubtype: "villa", floorLevel: "2-story standalone",
  },
  {
    id: "p2", name: "Downtown Loft", address: "456 Pine Street, Apt 12, Los Angeles, CA 90012",
    type: "long-term", monthlyRent: 2800, deposit: 2800, status: "occupied",
    leaseStart: "2024-01-15", leaseEnd: "2025-01-14", ownerId: "o1",
    image: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&h=300&fit=crop",
    images: [
      { url: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&h=600&fit=crop", caption: "Open-plan living area", room: "Living Room" },
      { url: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&h=600&fit=crop", caption: "Loft bedroom with balcony", room: "Bedroom" },
    ],
    bedrooms: 1, bathrooms: 1, sqft: 850, maxGuests: 2,
    description: "Chic urban loft in the heart of downtown LA. Exposed brick, high ceilings, and floor-to-ceiling windows. Walking distance to galleries, restaurants, and metro.",
    amenities: ["High Ceilings","Exposed Brick","Gym Access","WiFi","AC","In-Unit Laundry","Rooftop Access"],
    cancellationPolicy: undefined, cancellationDetails: "Full refund up to 30 days before move-in. Prorated refund after move-in per lease terms.",
    beds: [{ type: "queen", count: 1 }],
    checkInTime: "12:00", checkOutTime: "12:00",
    houseRules: ["No smoking", "No subletting", "Quiet hours after 10pm"],
    minStay: 30, maxStay: 365,
    petPolicy: "not_allowed", petPolicyDetails: "No pets allowed per building policy.",
    propertySubtype: "loft", floorLevel: "3rd floor with elevator",
  },
  {
    id: "p3", name: "Mountain Cabin", address: "789 Forest Trail, Big Bear Lake, CA 92315",
    type: "short-term", monthlyRent: 3200, nightlyRate: 380, deposit: 800, status: "vacant",
    ownerId: "o2", image: "https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=400&h=300&fit=crop",
    images: [
      { url: "https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=800&h=600&fit=crop", caption: "Cozy cabin exterior", room: "Exterior" },
      { url: "https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?w=800&h=600&fit=crop", caption: "Living room with stone fireplace", room: "Living Room" },
    ],
    bedrooms: 2, bathrooms: 1.5, sqft: 1200, maxGuests: 4,
    description: "Cozy log cabin nestled in the pines. Stone fireplace, hot tub on the deck, and a fully stocked kitchen. Perfect for ski weekends or summer hiking trips.",
    amenities: ["Hot Tub","Fireplace","Pet Friendly","Full Kitchen","WiFi","Parking","Hiking Trails"],
    cancellationPolicy: "Flexible", cancellationDetails: "Full refund up to 14 days before check-in. 50% refund within 7 days.",
    beds: [{ type: "queen", count: 1 }, { type: "bunk", count: 1 }],
    checkInTime: "15:00", checkOutTime: "11:00",
    houseRules: ["No parties", "No fireworks", "Bear-proof trash bins", "Fireplace — use provided firewood only"],
    minStay: 2, maxStay: 21,
    petPolicy: "allowed", petPolicyDetails: "Dogs welcome! $50 pet fee. Must be leashed outside and crated when left alone.",
    propertySubtype: "cabin", floorLevel: "Single story",
  },
  {
    id: "p4", name: "Harbor View Condo", address: "321 Marina Blvd, San Diego, CA 92101",
    type: "long-term", monthlyRent: 3500, deposit: 3500, status: "occupied",
    leaseStart: "2024-03-01", leaseEnd: "2025-02-28", ownerId: "o2",
    image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400&h=300&fit=crop",
    images: [
      { url: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&h=600&fit=crop", caption: "Marina view from the balcony", room: "Balcony" },
    ],
    bedrooms: 2, bathrooms: 2, sqft: 1100, maxGuests: 4,
    description: "Modern waterfront condo with marina views. Open floor plan, granite countertops, and resort-style amenities including pool, spa, and fitness center.",
    amenities: ["Marina View","Pool","Spa","Gym","Secure Parking","WiFi","AC","Balcony"],
    cancellationPolicy: undefined, cancellationDetails: "Full refund up to 60 days before move-in. No refund after lease start.",
    beds: [{ type: "queen", count: 1 }, { type: "double", count: 1 }],
    checkInTime: "14:00", checkOutTime: "12:00",
    houseRules: ["No smoking", "No parties", "Pool hours 8am-10pm", "One assigned parking spot"],
    minStay: 30, maxStay: 365,
    petPolicy: "on_request", petPolicyDetails: "Small pets considered with $300 pet deposit. Contact management for approval.",
    propertySubtype: "condo", floorLevel: "6th floor with elevator",
  },
  {
    id: "p5", name: "Urban Studio", address: "555 Market Street, #301, San Francisco, CA 94105",
    type: "long-term", monthlyRent: 2200, deposit: 2200, status: "vacant",
    ownerId: "o3", image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400&h=300&fit=crop",
    images: [
      { url: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&h=600&fit=crop", caption: "Studio with Murphy bed", room: "Main Room" },
    ],
    bedrooms: 0, bathrooms: 1, sqft: 500, maxGuests: 2,
    description: "Efficient studio in the Financial District. Brand new appliances, smart home features, and a Murphy bed. Ideal for professionals who want to be in the center of it all.",
    amenities: ["Smart Home","New Appliances","Gym","Concierge","WiFi","AC","Bike Storage"],
    cancellationPolicy: undefined, cancellationDetails: "Full refund up to 30 days before move-in. Prorated refund after move-in per lease terms.",
    beds: [{ type: "queen", count: 1 }],
    checkInTime: "13:00", checkOutTime: "11:00",
    houseRules: ["No smoking", "No subletting", "No parties", "Quiet hours 10pm-7am"],
    minStay: 30, maxStay: 365,
    petPolicy: "not_allowed", petPolicyDetails: "No pets allowed per HOA rules.",
    propertySubtype: "studio", floorLevel: "3rd floor with elevator",
  },
  {
    id: "p6", name: "Beach House Retreat", address: "777 Shoreline Ave, Malibu, CA 90265",
    type: "short-term", monthlyRent: 5800, nightlyRate: 580, deposit: 1500, status: "occupied",
    ownerId: "o3", image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400&h=300&fit=crop",
    images: [
      { url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&h=600&fit=crop", caption: "Private beach access and pool", room: "Backyard" },
      { url: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&h=600&fit=crop", caption: "Grand living room with ocean views", room: "Living Room" },
      { url: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&h=600&fit=crop", caption: "Luxury master suite", room: "Master Bedroom" },
    ],
    bedrooms: 4, bathrooms: 3, sqft: 2400, maxGuests: 8,
    description: "Luxurious Malibu beach house with private beach access. Saltwater pool, outdoor kitchen, game room, and a master suite with spa bath. The ultimate coastal retreat.",
    amenities: ["Beach Access","Pool","Outdoor Kitchen","Game Room","Spa Bath","WiFi","Parking","AC","Fire Pit"],
    cancellationPolicy: "Strict", cancellationDetails: "Full refund 90 days prior; 50% refund 60-90 days; no refund within 60 days of check-in.",
    beds: [{ type: "king", count: 2 }, { type: "queen", count: 1 }, { type: "twin", count: 2 }, { type: "sofa_bed", count: 1 }],
    checkInTime: "16:00", checkOutTime: "11:00",
    houseRules: ["No events without prior approval", "No smoking", "No glass by the pool", "Quiet hours 10pm-8am", "Parking in driveway only, max 4 cars"],
    minStay: 5, maxStay: 45,
    petPolicy: "allowed", petPolicyDetails: "All pets welcome! $150 pet fee per stay. Please clean up after pets.",
    propertySubtype: "house", floorLevel: "3-story standalone",
  },
];

export const tenants: Tenant[] = [
  { id: "t1", name: "Emily Rodriguez", email: "emily@email.com", phone: "(555) 101-0101", address: "2420 Oak Lane, Los Angeles, CA 90046", propertyId: "p2", type: "tenant", leaseStart: "2024-01-15", leaseEnd: "2025-01-14", rentAmount: 2800, deposit: 2800 },
  { id: "t2", name: "James Wilson", email: "james@email.com", phone: "(555) 202-0202", address: "7821 Pacific Ave, San Diego, CA 92109", propertyId: "p4", type: "tenant", leaseStart: "2024-03-01", leaseEnd: "2025-02-28", rentAmount: 3500, deposit: 3500 },
  { id: "t3", name: "Lisa Thompson", email: "lisa@email.com", guestPhone: "555-0123", phone: "(555) 303-0303", propertyId: "p1", type: "guest", bookingStart: "2024-07-10", bookingEnd: "2024-07-17", nightlyRate: 450, checkoutStatus: "checked-in" },
  { id: "t4", name: "Alex Garcia", email: "alex@email.com", phone: "(555) 404-0404", propertyId: "p6", type: "guest", bookingStart: "2024-07-05", bookingEnd: "2024-07-12", nightlyRate: 580, checkoutStatus: "checked-in" },
  { id: "t5", name: "Maria Kim", email: "maria@email.com", phone: "(555) 505-0505", propertyId: "p1", type: "guest", bookingStart: "2024-08-01", bookingEnd: "2024-08-08", nightlyRate: 450, checkoutStatus: "upcoming" },
  { id: "t6", name: "Robert Taylor", email: "robert@email.com", phone: "(555) 606-0606", propertyId: "p6", type: "guest", bookingStart: "2024-06-20", bookingEnd: "2024-06-27", nightlyRate: 580, checkoutStatus: "checked-out" },
];

export const payments: Payment[] = [
  { id: "pay1", propertyId: "p2", tenantId: "t1", amount: 2800, date: "2024-07-01", dueDate: "2024-07-01", status: "paid", method: "ACH", description: "July 2024 Rent" },
  { id: "pay2", propertyId: "p4", tenantId: "t2", amount: 3500, date: "2024-07-01", dueDate: "2024-07-01", status: "paid", method: "credit card", description: "July 2024 Rent" },
  { id: "pay3", propertyId: "p1", tenantId: "t3", amount: 3150, date: "2024-07-10", dueDate: "2024-07-10", status: "paid", method: "credit card", description: "Beach Villa - 7 night stay" },
  { id: "pay4", propertyId: "p6", tenantId: "t4", amount: 4060, date: "2024-07-05", dueDate: "2024-07-05", status: "paid", method: "credit card", description: "Beach House - 7 night stay" },
  { id: "pay5", propertyId: "p2", tenantId: "t1", amount: 2800, date: "2024-06-01", dueDate: "2024-06-01", status: "paid", method: "ACH", description: "June 2024 Rent" },
  { id: "pay6", propertyId: "p4", tenantId: "t2", amount: 3500, date: "2024-06-01", dueDate: "2024-06-01", status: "paid", method: "ACH", description: "June 2024 Rent" },
  { id: "pay7", propertyId: "p2", tenantId: "t1", amount: 2800, dueDate: "2024-08-01", date: "", status: "pending", method: "ACH", description: "August 2024 Rent" },
  { id: "pay8", propertyId: "p4", tenantId: "t2", amount: 3500, dueDate: "2024-08-01", date: "", status: "pending", method: "ACH", description: "August 2024 Rent" },
  { id: "pay9", propertyId: "p5", tenantId: "", amount: 2200, dueDate: "2024-07-01", date: "", status: "overdue", method: "ACH", description: "July 2024 Rent - Vacant" },
  { id: "pay10", propertyId: "p3", tenantId: "", amount: 3200, dueDate: "2024-06-15", date: "", status: "overdue", method: "credit card", description: "June Booking - Unpaid" },
  { id: "pay11", propertyId: "p6", tenantId: "t6", amount: 4060, date: "2024-06-20", dueDate: "2024-06-20", status: "paid", method: "credit card", description: "Beach House - 7 night stay (June)" },
  { id: "pay12", propertyId: "p1", tenantId: "t5", amount: 3150, dueDate: "2024-08-01", date: "", status: "pending", method: "credit card", description: "Beach Villa - 7 night stay (Aug)" },
];

export const maintenanceRequests: MaintenanceRequest[] = [
  { id: "m1", propertyId: "p2", description: "Leaking faucet in kitchen", priority: "medium", status: "in-progress", assignedTo: "John (Plumber)", dateReported: "2024-07-05", cost: 35000, chargedToOwner: true, notes: [], vendorId: "v1" },
  { id: "m2", propertyId: "p4", description: "AC unit not cooling properly", priority: "high", status: "open", assignedTo: "Steve (HVAC)", dateReported: "2024-07-12", cost: 50000, chargedToOwner: true, notes: [] },
  { id: "m3", propertyId: "p1", description: "Broken window in master bedroom", priority: "urgent", status: "open", assignedTo: "Glass Doctor", dateReported: "2024-07-14", cost: 75000, chargedToOwner: true, notes: [] },
  { id: "m4", propertyId: "p6", description: "Garbage disposal jammed", priority: "low", status: "resolved", assignedTo: "Mike (Handyman)", dateReported: "2024-06-28", dateResolved: "2024-06-30", cost: 0, chargedToOwner: false, notes: [] },
  { id: "m5", propertyId: "p2", description: "Smoke detector battery replacement", priority: "low", status: "resolved", assignedTo: "Building Maintenance", dateReported: "2024-06-15", dateResolved: "2024-06-16", cost: 0, chargedToOwner: false, notes: [] },
];

export const vendors: Vendor[] = [
  { id: "v1", name: "John Martinez", company: "Martinez Plumbing", email: "john@martinezplumbing.com", phone: "(555) 210-4500", serviceTypes: ["plumbing"], achInfo: { bankName: "Chase", routingNumber: "021000021", accountNumber: "XXXX1234" }, mailingAddress: { street: "4520 Trade St", city: "Los Angeles", state: "CA", zip: "90021" }, notes: "Reliable plumber, responds within 2 hours. Prefers text messages.", createdAt: "2024-01-15" },
  { id: "v2", name: "Steve Nguyen", company: "Pacific HVAC Services", email: "steve@pacifichvac.com", phone: "(555) 210-4501", serviceTypes: ["hvac"], achInfo: { bankName: "Wells Fargo", routingNumber: "121000248", accountNumber: "XXXX2345" }, mailingAddress: { street: "8900 Industrial Pkwy", city: "San Diego", state: "CA", zip: "92126" }, notes: "Certified for all major brands. Weekend rates are 1.5x.", createdAt: "2024-02-01" },
  { id: "v3", name: "Maria CleanPro", company: "CleanPro Residential", email: "maria@cleanpro.co", phone: "(555) 210-4502", serviceTypes: ["cleaning", "housekeeping"], achInfo: { bankName: "Bank of America", routingNumber: "121000358", accountNumber: "XXXX3456" }, mailingAddress: { street: "220 Palm Ave", city: "Santa Monica", state: "CA", zip: "90401" }, notes: "Deep cleaning specialist. Brings own supplies. $150 per turnover clean, $300 for deep clean.", createdAt: "2024-03-10" },
  { id: "v4", name: "Mike Thompson", company: "Thompson Handyman", email: "mike@thandyman.com", phone: "(555) 210-4503", serviceTypes: ["general", "electrical", "appliance"], achInfo: { bankName: "Citibank", routingNumber: "021000089", accountNumber: "XXXX4567" }, mailingAddress: { street: "75 Harbor Way", city: "Long Beach", state: "CA", zip: "90802" }, notes: "Jack of all trades. Available 7 days. Charges $75/hr + materials.", createdAt: "2024-04-01" },
];

export const ownerPayouts: OwnerPayout[] = [
  { id: "op1", ownerId: "o1", propertyId: "p1", period: "July 2024", amount: 3150, status: "pending" },
  { id: "op2", ownerId: "o1", propertyId: "p2", period: "July 2024", amount: 2800, status: "paid", datePaid: "2024-07-05", method: "ACH" },
  { id: "op3", ownerId: "o2", propertyId: "p4", period: "July 2024", amount: 3500, status: "pending" },
  { id: "op4", ownerId: "o3", propertyId: "p6", period: "July 2024", amount: 4060, status: "pending" },
  { id: "op5", ownerId: "o2", propertyId: "p3", period: "June 2024", amount: 0, status: "paid", datePaid: "2024-07-01", method: "check" },
  { id: "op6", ownerId: "o1", propertyId: "p1", period: "June 2024", amount: 2800, status: "paid", datePaid: "2024-07-01", method: "ACH" },
];

export const bookings: Booking[] = [
  { id: "b1", reservationNumber: "1472", propertyId: "p1", guestName: "Lisa Thompson", guestEmail: "lisa@email.com", guestPhone: "555-0123", guestAddress: "12 Cedar St, Austin, TX 78701", startDate: "2026-07-10", endDate: "2026-07-17", nightlyRate: 450, status: "checked-in", totalAmount: 3150, source: "direct", commissionRate: 0.15, createdAt: "2026-05-10", createdBy: "Admin", cleaningFee: 250, linenFee: 150, taxAmount: 267.75 },
  { id: "b2", reservationNumber: "2853", propertyId: "p1", guestName: "Maria Kim", guestEmail: "maria@email.com", guestAddress: "450 Beach Dr, Miami, FL 33139", startDate: "2026-08-01", endDate: "2026-08-08", nightlyRate: 450, status: "confirmed", totalAmount: 3150, source: "airbnb", commissionRate: 0.25, createdAt: "2026-06-15", createdBy: "Admin", cleaningFee: 250, linenFee: 150, taxAmount: 267.75 },
  { id: "b3", reservationNumber: "3691", propertyId: "p1", guestName: "John Davis", guestEmail: "john@email.com", guestAddress: "890 Pine Rd, Denver, CO 80205", startDate: "2026-08-15", endDate: "2026-08-22", nightlyRate: 475, status: "confirmed", totalAmount: 3325, source: "booking.com", commissionRate: 0.20, createdAt: "2026-07-01", createdBy: "Admin" },
  { id: "b4", reservationNumber: "4810", propertyId: "p1", guestName: "Sarah Miller", guestEmail: "sarah@email.com", startDate: "2026-09-01", endDate: "2026-09-05", nightlyRate: 450, status: "confirmed", totalAmount: 1800, source: "direct", commissionRate: 0.15, createdAt: "2026-07-20", createdBy: "Admin" },
  { id: "b5", reservationNumber: "5128", propertyId: "p6", guestName: "Alex Garcia", guestEmail: "alex@email.com", startDate: "2026-07-05", endDate: "2026-07-12", nightlyRate: 580, status: "checked-in", totalAmount: 4060, source: "vrbo", commissionRate: 0.25, createdAt: "2026-05-20", createdBy: "Admin", cleaningFee: 250, linenFee: 150, taxAmount: 345.10 },
  { id: "b6", reservationNumber: "6394", propertyId: "p6", guestName: "Robert Taylor", guestEmail: "robert@email.com", startDate: "2026-06-20", endDate: "2026-06-27", nightlyRate: 580, status: "checked-out", totalAmount: 4060, source: "direct", commissionRate: 0.15, createdAt: "2026-04-15", createdBy: "Admin", cleaningFee: 250, linenFee: 150, taxAmount: 345.10 },
  { id: "b7", reservationNumber: "7501", propertyId: "p6", guestName: "Jennifer Park", guestEmail: "jennifer@email.com", startDate: "2026-07-20", endDate: "2026-07-27", nightlyRate: 600, status: "confirmed", totalAmount: 4200, source: "airbnb", commissionRate: 0.25, createdAt: "2026-06-01", createdBy: "Admin" },
  { id: "b8", reservationNumber: "8217", propertyId: "p6", guestName: "Michael Brown", guestEmail: "michael.b@email.com", startDate: "2026-08-10", endDate: "2026-08-17", nightlyRate: 620, status: "confirmed", totalAmount: 4340, source: "booking.com", commissionRate: 0.20, createdAt: "2026-07-05", createdBy: "Admin" },
  { id: "b9", reservationNumber: "9036", propertyId: "p3", guestName: "David Clark", guestEmail: "david.c@email.com", guestPhone: "555-9876", startDate: "2026-08-05", endDate: "2026-08-12", nightlyRate: 380, status: "confirmed", totalAmount: 2660, source: "direct", commissionRate: 0.15, createdAt: "2026-06-25", createdBy: "Admin" },
  { id: "b10", reservationNumber: "1569", propertyId: "p3", guestName: "Emma Wilson", guestEmail: "emma.w@email.com", startDate: "2026-09-15", endDate: "2026-09-22", nightlyRate: 400, status: "confirmed", totalAmount: 2800, source: "vrbo", commissionRate: 0.25, createdAt: "2026-08-01", createdBy: "Admin" },
  { id: "b11", reservationNumber: "2748", propertyId: "p1", guestName: "Previous Guest", guestEmail: "prev@email.com", startDate: "2026-06-15", endDate: "2026-06-22", nightlyRate: 425, status: "checked-out", totalAmount: 2975, source: "airbnb", commissionRate: 0.25, createdAt: "2026-04-01", createdBy: "Admin" },
  { id: "b12", reservationNumber: "3982", propertyId: "p6", guestName: "Tom Harris", guestEmail: "tom@email.com", startDate: "2026-09-01", endDate: "2026-09-08", nightlyRate: 600, status: "confirmed", totalAmount: 4200, source: "direct", commissionRate: 0.15, createdAt: "2026-07-15", createdBy: "Admin" },
  { id: "b13", reservationNumber: "5713", propertyId: "p2", guestName: "Emily Rodriguez", guestEmail: "emily@email.com", startDate: "2026-01-15", endDate: "2027-01-14", nightlyRate: 133, status: "checked-in", totalAmount: 48667, source: "direct", commissionRate: 0.10, createdAt: "2025-12-01", createdBy: "Admin" },
  { id: "b14", reservationNumber: "6842", propertyId: "p4", guestName: "James Wilson", guestEmail: "james@email.com", startDate: "2026-03-01", endDate: "2027-02-28", nightlyRate: 117, status: "checked-in", totalAmount: 42588, source: "direct", commissionRate: 0.10, createdAt: "2026-01-15", createdBy: "Admin" },
];
export const calendarBlocks: CalendarBlock[] = [
  { id: "cb1", propertyId: "p2", type: "lease", startDate: "2026-01-15", endDate: "2027-01-14", title: "Emily Rodriguez - Lease", color: "#3b82f6" },
  { id: "cb2", propertyId: "p4", type: "lease", startDate: "2026-03-01", endDate: "2027-02-28", title: "James Wilson - Lease", color: "#3b82f6" },
  // Maintenance blocks
  { id: "cb3", propertyId: "p2", type: "maintenance", startDate: "2026-07-05", endDate: "2026-07-07", title: "Plumbing repair", color: "#ef4444" },
  { id: "cb4", propertyId: "p4", type: "maintenance", startDate: "2026-07-15", endDate: "2026-07-16", title: "AC repair", color: "#ef4444" },
  // Blocked dates
  { id: "cb5", propertyId: "p3", type: "blocked", startDate: "2026-07-20", endDate: "2026-07-25", title: "Owner personal use", color: "#8b5cf6" },
  { id: "cb6", propertyId: "p5", type: "blocked", startDate: "2026-07-01", endDate: "2026-07-31", title: "Renovations", color: "#f59e0b" },
];

// Signed Documents
export const signedDocuments: SignedDocument[] = [
  {
    id: 'sd1', bookingId: 'b1', propertyId: 'p1', ownerId: 'o1',
    type: 'rental-agreement', title: 'Rental Agreement — Lisa Thompson (Sunset Villa)',
    sentTo: 'lisa@email.com', sentToName: 'Lisa Thompson',
    status: 'renter-signed', sentAt: '2026-06-20T10:00:00Z',
    renterSignedByName: 'Lisa Thompson', renterSignedAt: '2026-06-21T14:30:00Z',
    signedByName: 'Lisa Thompson', signedAt: '2026-06-21T14:30:00Z',
    ownerEmail: 'robert@example.com',
    requiresOwnerSignature: true,
    content: 'RENTAL AGREEMENT\n\nProperty: Sunset Villa, 123 Ocean Drive, Santa Monica, CA 90401\nGuest: Lisa Thompson\nDates: July 10–17, 2026 (7 nights)\nNightly Rate: $450.00\nTotal: $3,150.00\n\nThis agreement confirms the short-term rental of the above property. The guest agrees to all house rules and terms. Deposits are non-refundable per the cancellation policy.\n\nSigned: Lisa Thompson\nDate: June 21, 2026',
    createdAt: '2026-06-20T10:00:00Z',
  },
  {
    id: 'sd2', bookingId: 'b5', propertyId: 'p6', ownerId: 'o3',
    type: 'rental-agreement', title: 'Rental Agreement — Alex Garcia (Beach House Retreat)',
    sentTo: 'alex@email.com', sentToName: 'Alex Garcia',
    status: 'sent', sentAt: '2026-06-18T09:00:00Z',
    content: 'RENTAL AGREEMENT\n\nProperty: Beach House Retreat, 777 Shoreline Ave, Malibu, CA 90265\nGuest: Alex Garcia\nDates: July 5–12, 2026 (7 nights)\nNightly Rate: $580.00\nTotal: $4,060.00\n\nThis agreement confirms the short-term rental of the above property. The guest agrees to all house rules and terms. Deposits are non-refundable per the cancellation policy.\n\nPlease type your full name to sign this document.',
    createdAt: '2026-06-18T09:00:00Z',
  },
  {
    id: 'sd3', propertyId: 'p2', ownerId: 'o1',
    type: 'lease', title: 'Lease Agreement — 456 Pine Street (Downtown Loft)',
    sentTo: 'emily@email.com', sentToName: 'Emily Rodriguez',
    status: 'draft',
    content: 'LEASE AGREEMENT\n\nProperty: Downtown Loft, 456 Pine Street, Apt 12, Los Angeles, CA 90012\nTenant: Emily Rodriguez\nTerm: January 15, 2024 – January 14, 2025\nMonthly Rent: $2,800.00\nDeposit: $2,800.00\n\nThis lease agreement outlines the terms and conditions for the tenancy of the above property. The tenant agrees to all rules and regulations set forth by the property manager.\n\nPlease type your full name to sign this document.',
    createdAt: '2026-07-01T08:00:00Z',
  },
];

// Document Templates
export const documentTemplates: DocumentTemplate[] = [
  {
    id: 'dt1',
    name: 'Standard Lease Agreement',
    type: 'lease',
    content: 'LEASE AGREEMENT\n\nProperty: {{propertyName}}\nAddress: {{propertyAddress}}\n\nTenant: {{guestName}}\nEmail: {{guestEmail}}\n\nTerm: 12 months\nMonthly Rent: ${{monthlyRent}}\nSecurity Deposit: ${{depositAmount}}\n\nThis lease agreement ("Agreement") is entered into on {{today}} between the property manager and the tenant identified above. The tenant agrees to all rules and regulations set forth by the property manager.\n\n1. TERM: This lease shall commence on {{checkInDate}} and continue for a period of 12 months.\n2. RENT: Tenant agrees to pay ${{monthlyRent}} per month, due on the 1st of each month.\n3. SECURITY DEPOSIT: A security deposit of ${{depositAmount}} is required before move-in.\n4. UTILITIES: Tenant is responsible for all utilities unless otherwise stated.\n5. MAINTENANCE: Tenant shall maintain the premises in good condition.\n\nBy signing below, both parties agree to the terms of this lease.',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
  },
  {
    id: 'dt2',
    name: 'Short-Term Rental Agreement',
    type: 'rental-agreement',
    content: 'SHORT-TERM RENTAL AGREEMENT\n\nProperty: {{propertyName}}\nAddress: {{propertyAddress}}\nOwner: {{ownerName}}\n\nGuest: {{guestName}}\nEmail: {{guestEmail}}\n\nCheck-in: {{checkInDate}}\nCheck-out: {{checkOutDate}}\nNights: {{nights}}\nNightly Rate: ${{nightlyRate}}.00\nTotal: ${{totalAmount}}\n\nThis agreement confirms the short-term rental of the above property. The guest agrees to all house rules and terms as outlined below.\n\n1. CHECK-IN / CHECK-OUT: Check-in time is 3:00 PM. Check-out time is 11:00 AM.\n2. MAXIMUM OCCUPANCY: The maximum number of guests is as specified in the listing.\n3. NO PARTIES OR EVENTS: The property is for residential use only.\n4. NOISE: Quiet hours are from 10:00 PM to 8:00 AM.\n5. DAMAGE: Guest is responsible for any damage beyond normal wear and tear.\n6. CANCELLATION: Deposits are non-refundable. The remaining balance is subject to the cancellation policy.\n\nDated: {{today}}\n\nPlease type your full name to sign this document.',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
  },
  {
    id: 'dt3',
    name: 'House Rules',
    type: 'house-rules',
    content: 'HOUSE RULES\n\nProperty: {{propertyName}}\n\nWelcome, {{guestName}}! To ensure a pleasant stay for all guests, please follow these house rules during your visit from {{checkInDate}} to {{checkOutDate}}.\n\n1. CHECK-IN / CHECK-OUT: Check-in after 3:00 PM. Check-out before 11:00 AM.\n2. NO SMOKING: Smoking is strictly prohibited inside the property.\n3. PETS: No pets allowed unless prior approval is given.\n4. PARTIES: No parties or events are permitted.\n5. QUIET HOURS: 10:00 PM to 8:00 AM. Please respect the neighbors.\n6. PARKING: Park only in designated areas.\n7. TRASH: Dispose of trash in designated bins before checkout.\n8. DAMAGE: Report any damage immediately. Guest is responsible for excessive damage.\n9. DOORS & WINDOWS: Lock all doors and windows when leaving.\n10. THERMOSTAT: Set to energy-saving mode when not in the property.\n\nThank you for respecting these rules. Enjoy your stay!\n\n{{ownerName}}',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
  },
];


// Guest Messages (from /contact form, AI-triaged)
export const guestMessages: GuestMessage[] = [
  {
    id: "gm1",
    guestName: "Lisa Thompson",
    guestEmail: "lisa@email.com", guestPhone: "555-0123",
    bookingId: "b1",
    propertyId: "p1",
    subject: "Dishwasher not draining",
    message: "Hi, the dishwasher in the Sunset Villa is not draining properly. Water pools at the bottom after each cycle.",
    category: "maintenance",
    autoReplySent: true,
    ticketId: "m6",
    createdAt: "2026-07-12T14:30:00Z",
    status: "new",
  },
];

// Property Guides (guest portal content per property)
export const propertyGuides: PropertyGuide[] = [
  {
    id: "pg1",
    propertyId: "p1",
    doorCode: "4829#", masterDoorCode: "0000#",
    wifiName: "SunsetVilla_Guest",
    wifiPassword: "oceanview2026",
    checkInTime: "3:00 PM",
    checkoutTime: "11:00 AM",
    parkingInfo: "Driveway parking for up to 3 vehicles. Do not park on the street after 10 PM — HOA restriction. Garage code: same as door code (4829#).",
    directions: "From LAX: Take I-405 N to I-10 W. Exit 4th Street toward Santa Monica Pier. Left on Ocean Drive. Right on Mesa Rd. House is 3rd on the right — look for the blue gate. GPS: 123 Ocean Drive, Santa Monica, CA 90401.",
    houseRules: [
      "Quiet hours: 10 PM – 8 AM. Please respect the neighbors.",
      "No smoking inside the property ($500 fine).",
      "No parties or events without prior approval.",
      "Maximum occupancy: 6 guests.",
      "Pets: Not allowed (strict HOA policy).",
      "Please remove shoes at the entrance — white carpets!",
      "BBQ grill: Clean after use. Propane tank under the deck.",
      "Pool hours: 8 AM – 10 PM. No glass near the pool.",
    ],
    emergencyContact: "Eastman Premier Rentals",
    emergencyPhone: "(555) 123-4567",
    nearestHospital: "Santa Monica UCLA Medical Center",
    nearestHospitalAddress: "1250 16th St, Santa Monica, CA 90404",
    localRecommendations: [
      { name: "Blue Daisy Café", type: "Breakfast", description: "Cozy spot for organic breakfast bowls and espresso. 5 min walk.", address: "609 Broadway, Santa Monica" },
      { name: "The Misfit", type: "Restaurant", description: "Trendy rooftop bar with craft cocktails and small plates. Great sunset views.", address: "225 Santa Monica Blvd" },
      { name: "Santa Monica Pier", type: "Attraction", description: "Iconic pier with amusement park, aquarium, and dining. 10 min walk.", address: "200 Santa Monica Pier" },
      { name: "Trader Joe's", type: "Grocery", description: "Nearest grocery store — organic produce and great wine selection.", address: "3212 Pico Blvd" },
      { name: "Third Street Promenade", type: "Shopping", description: "Pedestrian-only shopping district with street performers and cafes.", address: "1351 3rd Street Promenade" },
      { name: "Perry's Café", type: "Bike Rental", description: "Rent bikes and cruise the beach path. RentVue guests get 10% off.", address: "2400 Ocean Front Walk" },
    ],
    checkoutInstructions: [
      "Check-out is by 11:00 AM sharp — late checkouts incur a $150 fee.",
      "Please load and start the dishwasher before leaving.",
      "Take all trash to the bins by the garage.",
      "Strip used bed linens and place in the laundry room hamper.",
      "Turn off all lights, AC/heating, and lock all doors/windows.",
      "Leave the parking pass on the kitchen counter.",
      "Text (555) 123-4567 when you've departed.",
    ],
  },
  {
    id: "pg2",
    propertyId: "p6",
    doorCode: "7710*", masterDoorCode: "0000#",
    wifiName: "BeachHouse_Malibu",
    wifiPassword: "surfsup2026",
    checkInTime: "3:00 PM",
    checkoutTime: "11:00 AM",
    parkingInfo: "Gated driveway fits 4 cars. Street parking is not permitted per county ordinance. Gate remote is in the kitchen drawer labeled 'Gate'.",
    directions: "From LA: PCH (CA-1) north through Malibu. After passing Malibu Pier, continue 4.2 miles. Look for the stone mailbox with '777' on the ocean side. Turn into the gated driveway.",
    houseRules: [
      "Quiet hours: 10 PM – 8 AM (strictly enforced by Malibu PD).",
      "No smoking anywhere on the property.",
      "Maximum occupancy: 8 guests. Day visitors must leave by 8 PM.",
      "No events, parties, or commercial photography without written consent.",
      "Pool: No lifeguard on duty. Children must be supervised at all times.",
      "Beach access: Private stairs at the south end of the property. Lock gate after use.",
      "Fire pit: Only use provided wood. Extinguish fully before leaving unattended.",
      "Wildlife: Do not feed the deer or raccoons. Secure trash in bins.",
    ],
    emergencyContact: "Eastman Premier Rentals",
    emergencyPhone: "(555) 123-4567",
    nearestHospital: "Malibu Urgent Care",
    nearestHospitalAddress: "23815 Stuart Ranch Rd, Malibu, CA 90265",
    localRecommendations: [
      { name: "Malibu Farm Pier Café", type: "Restaurant", description: "Farm-to-table dining at the end of Malibu Pier. Incredible ocean views.", address: "23000 Pacific Coast Hwy" },
      { name: "Nobu Malibu", type: "Fine Dining", description: "World-famous Japanese-Peruvian cuisine. Reservations needed weeks in advance.", address: "22706 Pacific Coast Hwy" },
      { name: "Zuma Beach", type: "Beach", description: "One of LA's cleanest beaches. Great for swimming, volleyball, and whale watching.", address: "30000 Pacific Coast Hwy" },
      { name: "Solstice Canyon", type: "Hiking", description: "Easy 2-mile loop with waterfall and historic ruins. Dog-friendly trail.", address: "3455 Solstice Canyon Rd" },
      { name: "Vintage Grocers", type: "Grocery", description: "Upscale market with prepared foods, wine, and organic produce.", address: "3835 Cross Creek Rd" },
      { name: "Malibu Country Mart", type: "Shopping", description: "Boutique shopping with coffee shops and people-watching.", address: "3835 Cross Creek Rd" },
    ],
    checkoutInstructions: [
      "Check-out is by 11:00 AM — the cleaning crew arrives promptly.",
      "Load dishwasher and start cycle.",
      "All trash to outdoor bins. Recycling in the blue bin.",
      "Strip beds and leave linens in the laundry room.",
      "Turn off pool heater, lights, AC, and lock all doors.",
      "Return gate remote to kitchen drawer.",
      "Text (555) 123-4567 upon departure.",
    ],
  },
  {
    id: "pg3",
    propertyId: "p3",
    doorCode: "2468*", masterDoorCode: "0000#",
    wifiName: "MountainCabin_BB",
    wifiPassword: "pinecone26",
    checkInTime: "3:00 PM",
    checkoutTime: "11:00 AM",
    parkingInfo: "Driveway fits 2 vehicles. 4WD/AWD recommended in winter (Dec–Mar). Chain restrictions may apply — check CalTrans before arriving.",
    directions: "From Big Bear Blvd: Turn north on Forest Trail. Follow 1.8 miles — road becomes unpaved for the last 0.3 miles. Cabin is on the left with the red roof and '789' marker.",
    houseRules: [
      "Quiet hours: 10 PM – 7 AM. Sound carries in the mountains.",
      "No smoking indoors. Outdoor smoking: extinguish and dispose properly (fire risk).",
      "Fireplace: Only use provided firewood. Close flue when not in use.",
      "Hot tub: Shower before use. Replace cover after. Max 4 people.",
      "Trash: Must be in bear-proof bins. Do not leave trash outside.",
      "Pets: Allowed with $75 pet fee. Please clean up after your pet.",
    ],
    emergencyContact: "Eastman Premier Rentals",
    emergencyPhone: "(555) 123-4567",
    nearestHospital: "Bear Valley Community Hospital",
    nearestHospitalAddress: "41870 Garstin Dr, Big Bear Lake, CA 92315",
    localRecommendations: [
      { name: "Grizzly Manor Café", type: "Breakfast", description: "Classic mountain diner with enormous pancakes. Cash only.", address: "41268 Big Bear Blvd" },
      { name: "Big Bear Lake Brewing Co", type: "Restaurant", description: "Craft beer and burgers with a lake view patio.", address: "40827 Big Bear Blvd" },
      { name: "Snow Summit", type: "Ski Resort", description: "Family-friendly skiing and snowboarding. Summer mountain biking.", address: "880 Summit Blvd" },
      { name: "Castle Rock Trail", type: "Hiking", description: "2.5-mile out-and-back with panoramic lake views. Moderate difficulty.", address: "Near Big Bear Blvd & Tahoe Dr" },
      { name: "Stater Bros", type: "Grocery", description: "Full grocery store. Stock up before heading up the mountain.", address: "42171 Big Bear Blvd" },
    ],
    checkoutInstructions: [
      "Check-out: 11:00 AM.",
      "Wash and put away all dishes.",
      "Bag all trash and place in bear-proof bin outside.",
      "Strip beds, leave linens in the bathroom.",
      "Turn off heaters, lights, and lock all doors/windows.",
      "Hot tub: Replace cover securely.",
      "Text (555) 123-4567 when you've left.",
    ],
  },
];

// Fee & Tax Configuration
// Helper: get image URL from PropertyImage | string
export function getImageSrc(img: string | PropertyImage): string {
  if (typeof img === "string") return img;
  return img.url;
}

export const feeConfig = {
  taxRate: 0.085,         // NH Rooms & Meals Tax 8.5%
  taxLabel: "NH Rooms & Meals Tax (8.5%)",
  cleaningFee: 250,       // Default cleaning fee
  cleaningFeeLabel: "Cleaning Fee",
  linenFee: 150,          // Linen/laundry fee
  linenFeeLabel: "Linen Fee",
  taxExemptDays: 185,     // Stays 185+ days are tax-exempt
  commissionRate: 0.15,    // Management commission 15%
  commissionLabel: "Management Commission",
};

export function calculateFees(nights: number, nightlyRate: number, overrides?: { cleaningFee?: number; linenFee?: number; taxAmount?: number; taxRate?: number }) {
  const subtotal = nights * nightlyRate;
  const cleaningFee = overrides?.cleaningFee ?? feeConfig.cleaningFee;
  const linenFee = overrides?.linenFee ?? feeConfig.linenFee;
  const isTaxExempt = nights >= feeConfig.taxExemptDays;
  const taxRate = overrides?.taxRate ?? feeConfig.taxRate;
  const tax = isTaxExempt ? 0 : (overrides?.taxAmount ?? Math.round(subtotal * taxRate * 100) / 100);
  const commission = Math.round((subtotal + cleaningFee + linenFee) * feeConfig.commissionRate * 100) / 100;
  const total = subtotal + cleaningFee + linenFee + tax;
  return { subtotal, cleaningFee, linenFee, tax, total, isTaxExempt, commission };
}

export const paymentMethods: PaymentMethodEntry[] = [
  {
    id: "pm1", bookingId: "b1", type: "credit_card", label: "Visa ••••4242 exp 06/28",
    cardLast4: "4242", cardBrand: "visa", cardExpiry: "06/28", createdAt: "2026-07-01T00:00:00Z",
  },
  {
    id: "pm2", bookingId: "b1", type: "ACH", label: "Chase Checking ••••6789", accountType: "checking",
    bankName: "Chase", accountLast4: "6789", routingLast4: "0210", createdAt: "2026-07-01T00:00:00Z",
  },
  {
    id: "pm3", bookingId: "b13", type: "credit_card", label: "Amex ••••1000 exp 12/26",
    cardLast4: "1000", cardBrand: "amex", cardExpiry: "12/26", createdAt: "2026-07-01T00:00:00Z",
  },
];

// Helper functions
export function getProperty(id: string): Property | undefined {
  return properties.find(p => p.id === id);
}

export function getTenantsForProperty(propertyId: string): Tenant[] {
  return tenants.filter(t => t.propertyId === propertyId);
}

export function getPaymentsForProperty(propertyId: string): Payment[] {
  return payments.filter(p => p.propertyId === propertyId);
}

export function getMaintenanceForProperty(propertyId: string): MaintenanceRequest[] {
  return maintenanceRequests.filter(m => m.propertyId === propertyId);
}

export function getOwner(id: string): Owner | undefined {
  return owners.find(o => o.id === id);
}

export function getPayoutsForOwner(ownerId: string): OwnerPayout[] {
  return ownerPayouts.filter(op => op.ownerId === ownerId);
}

/** Shared cancellation policy guideline text — Airbnb official host policies */
export const CANCELLATION_GUIDELINES: Record<string, string> = {
  Flexible:
    "Full refund for cancellations made at least 24 hours before check-in. After that, the first night is non-refundable.",
  Moderate:
    "Full refund for cancellations made at least 5 days before check-in. After that, the first night is non-refundable.",
  Strict:
    "Full refund for cancellations made at least 7 days before check-in. 50% refund for cancellations made between 2 and 7 days before check-in. No refund for cancellations made within 2 days of check-in.",
  "Long Term":
    "Full refund for cancellations made within 48 hours of booking, as long as the check-in date is at least 28 days away. Otherwise, the first 30 nights are non-refundable.",
  "Super Strict 30":
    "50% refund for cancellations made at least 30 days before check-in. No refund after that.",
  "Super Strict 60":
    "50% refund for cancellations made at least 60 days before check-in. No refund after that.",
  "Non-refundable":
    "No refunds for any reason.",
  Custom:
    "Define your own cancellation terms in the details field below.",
};

export function getCancellationGuideline(policy?: string): string {
  if (!policy) return "";
  return CANCELLATION_GUIDELINES[policy] ?? "";
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function formatDate(date: string): string {
  if (!date) return "—";
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function getPaymentMethodsForBooking(bookingId: string): PaymentMethodEntry[] {
  return paymentMethods.filter(pm => pm.bookingId === bookingId);
}
export function addPaymentMethod(method: Omit<PaymentMethodEntry, "id">): PaymentMethodEntry {
  const id = `pm${paymentMethods.length + 1}`;
  const entry = { ...method, id };
  paymentMethods.push(entry);
  return entry;
}
export function removePaymentMethod(id: string): boolean {
  const idx = paymentMethods.findIndex(pm => pm.id === id);
  if (idx >= 0) { paymentMethods.splice(idx, 1); return true; }
  return false;
}
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    "paid": "bg-green-100 text-green-800",
    "pending": "bg-yellow-100 text-yellow-800",
    "overdue": "bg-red-100 text-red-800",
    "open": "bg-red-100 text-red-800",
    "in-progress": "bg-blue-100 text-blue-800",
    "resolved": "bg-green-100 text-green-800",
    "occupied": "bg-green-100 text-green-800",
    "vacant": "bg-gray-100 text-gray-600",
    "checked-in": "bg-blue-100 text-blue-800",
    "checked-out": "bg-gray-100 text-gray-600",
    "upcoming": "bg-yellow-100 text-yellow-800",
    "confirmed": "bg-blue-100 text-blue-800",
    "cancelled": "bg-red-100 text-red-800",
    "low": "bg-gray-100 text-gray-600",
    "medium": "bg-yellow-100 text-yellow-800",
    "high": "bg-orange-100 text-orange-800",
    "urgent": "bg-red-100 text-red-800",
    "new": "bg-blue-100 text-blue-800",
    "replied": "bg-yellow-100 text-yellow-800",
  };
  return colors[status] ?? "bg-gray-100 text-gray-600";
}

export function getBookingsForProperty(propertyId: string): Booking[] {
  return bookings.filter(b => b.propertyId === propertyId);
}

export function getCalendarBlocksForProperty(propertyId: string, startDate: string, endDate: string): CalendarBlock[] {
  return calendarBlocks.filter(b => b.propertyId === propertyId && b.startDate <= endDate && b.endDate >= startDate);
}

export function getBookingsInRange(startDate: string, endDate: string): Booking[] {
  return bookings.filter(b => b.startDate <= endDate && b.endDate >= startDate);
}

export function getCalendarBlocksInRange(startDate: string, endDate: string): CalendarBlock[] {
  return calendarBlocks.filter(b => b.startDate <= endDate && b.endDate >= startDate);
}