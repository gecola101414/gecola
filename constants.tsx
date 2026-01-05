
import { FundingIDV, WorkOrder, WorkStatus } from './types';

export const INITIAL_IDVS: FundingIDV[] = [
  { 
    id: 'idv-1', 
    idvCode: 'IDV-2024-001', 
    capitolo: '1010', 
    amount: 150000, 
    motivation: 'Fondi PNRR Digitalizzazione',
    createdAt: '2024-01-10',
    // Fix: Added missing ownerId and ownerName required by FundingIDV interface
    ownerId: 'u-admin',
    ownerName: 'Admin',
    // Fix: Added missing required fields
    ownerWorkgroup: 'INFRA',
    assignedWorkgroup: 'INFRA'
  },
  { 
    id: 'idv-2', 
    idvCode: 'IDV-2024-002', 
    capitolo: '1020', 
    amount: 80000, 
    motivation: 'Manutenzione Infrastrutture',
    createdAt: '2024-02-05',
    // Fix: Added missing ownerId and ownerName required by FundingIDV interface
    ownerId: 'u-admin',
    ownerName: 'Admin',
    // Fix: Added missing required fields
    ownerWorkgroup: 'INFRA',
    assignedWorkgroup: 'INFRA'
  }
];

export const INITIAL_ORDERS: WorkOrder[] = [
  {
    id: 'o-1',
    orderNumber: 'PRJ-X1',
    description: 'Sviluppo Software Gestionale',
    estimatedValue: 45000,
    linkedIdvIds: ['idv-1'],
    status: WorkStatus.PROGETTO,
    createdAt: '2024-03-01',
    // Fix: Added missing ownerId and ownerName required by WorkOrder interface
    ownerId: 'u-admin',
    ownerName: 'Admin',
    // Fix: Added missing required field
    workgroup: 'INFRA'
  }
];