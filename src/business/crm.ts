import type { CRMContact } from './types.js';

export interface CRMCreateInput {
  name: string;
  company: string;
  email: string;
  phone?: string;
  notes?: string;
  tags?: string[];
  createdBy: string;
}

export interface CRMUpdateInput {
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  notes?: string;
  tags?: string[];
}

export interface ExternalCRMIntegration {
  name: string;
  pushContact(contact: CRMContact): Promise<boolean>;
  pullContacts(): Promise<CRMContact[]>;
}

let contactCounter = 0;

function generateId(): string {
  contactCounter += 1;
  return `crm_${Date.now()}_${contactCounter}`;
}

export interface CRMStore {
  create(input: CRMCreateInput): CRMContact;
  get(id: string): CRMContact | undefined;
  update(id: string, updates: CRMUpdateInput): CRMContact | undefined;
  delete(id: string): boolean;
  searchContacts(query: string): CRMContact[];
  getContactsByTag(tag: string): CRMContact[];
}

export class InMemoryCRMStore implements CRMStore {
  private contacts = new Map<string, CRMContact>();

  create(input: CRMCreateInput): CRMContact {
    const now = new Date();
    const contact: CRMContact = {
      id: generateId(),
      name: input.name,
      company: input.company,
      email: input.email,
      phone: input.phone ?? '',
      notes: input.notes ?? '',
      tags: input.tags ?? [],
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.contacts.set(contact.id, contact);
    return contact;
  }

  get(id: string): CRMContact | undefined {
    return this.contacts.get(id);
  }

  update(id: string, updates: CRMUpdateInput): CRMContact | undefined {
    const contact = this.contacts.get(id);
    if (!contact) return undefined;

    const updated: CRMContact = {
      ...contact,
      ...updates,
      updatedAt: new Date(),
    };
    this.contacts.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.contacts.delete(id);
  }

  searchContacts(query: string): CRMContact[] {
    const q = query.toLowerCase();
    return [...this.contacts.values()].filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.company.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)
    );
  }

  getContactsByTag(tag: string): CRMContact[] {
    return [...this.contacts.values()].filter(c => c.tags.includes(tag));
  }
}

// Stub integrations for external CRM systems
export class SalesforceIntegration implements ExternalCRMIntegration {
  name = 'Salesforce';

  async pushContact(_contact: CRMContact): Promise<boolean> {
    // TODO: Implement Salesforce API push
    return false;
  }

  async pullContacts(): Promise<CRMContact[]> {
    // TODO: Implement Salesforce API pull
    return [];
  }
}

export class HubSpotIntegration implements ExternalCRMIntegration {
  name = 'HubSpot';

  async pushContact(_contact: CRMContact): Promise<boolean> {
    // TODO: Implement HubSpot API push
    return false;
  }

  async pullContacts(): Promise<CRMContact[]> {
    // TODO: Implement HubSpot API pull
    return [];
  }
}
