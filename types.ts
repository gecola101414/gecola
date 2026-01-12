
export enum UserRole {
  ADMIN = 'Amministratore',
  PPB = 'P.P.B.',
  REPPE = 'R.E.P.P.E.',
  COMANDANTE = 'Comandante',
  EDITOR = 'Ufficio Tecnico',
  ACCOUNTANT = 'Ufficio Amministrativo',
  VIEWER = 'Visualizzatore'
}

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  workgroup: string;
  mustChangePassword?: boolean;
  isFirstLogin?: boolean;
  profilePhoto?: string; // Mantenuto per compatibilità, usato per thumbnail
  accreditationVideo?: string; // Base64 video MP4/WebM
  lastActive?: string;
  loginCount?: number;
  lastReadTimestamps?: Record<string, string>;
}

export interface Attachment {
  id: string;
  name: string;
  data: string; // Base64
  type: string;
  size: number;
  uploadedAt: string;
}

export interface DecretationEntry {
  id: string;
  text?: string;
  mediaProof?: string; 
  mediaType?: 'video' | 'audio';
  author: string;
  role: UserRole;
  date: string;
}

export interface PlanningNeed {
  id: string;
  chapter: string;
  barracks: string;
  description: string;
  projectValue: number;
  priority: 1 | 2 | 3;
  attachments: Attachment[];
  listId?: string;
  locked?: boolean;
  createdAt: string; 
  ownerName: string;
  ownerId: string; 
  workgroup: string;
  decretations?: DecretationEntry[];
  isApprovedByReppe?: boolean;
  isApprovedByComandante?: boolean;
  approvalDateReppe?: string;
  approvalDateComandante?: string;
  isFunded?: boolean;
  linkedIdvId?: string;
}

export interface PlanningList {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  locked?: boolean;
  isApprovedByReppe?: boolean;
  isApprovedByComandante?: boolean;
}

export interface Briefing {
  id: string;
  title: string;
  date: string;
  time: string;
  description: string;
  location: string;
  status: 'scheduled' | 'completed' | 'cancelled';
}

export interface FundingIDV {
  id: string;
  idvCode: string;
  capitolo: string;
  amount: number;
  motivation: string;
  createdAt: string;
  ownerId: string;
  ownerName: string;
  ownerWorkgroup: string;
  assignedWorkgroup: string;
  locked?: boolean;
  sourceProjectId?: string; // Tracciamento origine
}

export interface BidResult {
  winner: string;
  bidValue: number;
  date: string;
  contractPdf?: { name: string; data: string };
}

export interface PaymentResult {
  paidValue: number;
  invoiceDate: string;
  invoiceNumber: string;
  invoicePdf?: { name: string; data: string };
  creGenerated: boolean;
  creDate: string;
}

export interface WorkOrder {
  id: string;
  orderNumber: string;
  description: string;
  estimatedValue: number;
  contractValue?: number;
  paidValue?: number;
  linkedIdvIds: string[];
  status: WorkStatus;
  winner?: string;
  createdAt: string;
  ownerId: string;
  ownerName: string;
  workgroup: string;
  locked?: boolean;
  projectPdf?: { name: string; data: string; };
  contractPdf?: { name: string; data: string; };
  invoicePdf?: { name: string; data: string; };
  invoiceNumber?: string;
  invoiceDate?: string;
  creGenerated?: boolean;
  creDate?: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  username: string;
  workgroup: string; 
  action: string;
  details: string;
  videoProof?: string; 
  relatedId?: string; 
}

export enum WorkStatus {
  PROGETTO = 'Progetto (Stima)',
  AFFIDAMENTO = 'Affidamento (Contratto)',
  PAGAMENTO = 'Pagamento (Fattura)',
  ANNULLATO = 'Annullato'
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  role: UserRole;
  workgroup: string;
  text: string;
  timestamp: string;
  attachments?: Attachment[];
  isVoice?: boolean;
  recipientId?: string;
}

export interface AppState {
  version: number;
  vaultId: string; // DNA univoco del file
  commandName: string;
  users: User[];
  idvs: FundingIDV[];
  orders: WorkOrder[];
  planningNeeds: PlanningNeed[];
  planningLists: PlanningList[];
  auditLog: AuditEntry[];
  chatMessages: ChatMessage[];
  briefings: Briefing[];
  lastSync: string;
}
