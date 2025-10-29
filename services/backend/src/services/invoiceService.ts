// src/services/invoiceService.ts
import db from '../db';
import { Invoice } from '../types/invoice';
import axios from 'axios';
import { promises as fs } from 'fs';
import * as path from 'path';

interface InvoiceRow {
  id: string;
  userId: string;
  amount: number;
  dueDate: Date;
  status: string;
}

class InvoiceService {
  private static readonly ALLOWED_PAYMENT_HOSTS = new Set([
    'visa.com',
    'mastercard.com',
  ]);

  private static validatePaymentBrand(brand: string): string {
    const normalized = brand.trim().toLowerCase();
    if (!this.ALLOWED_PAYMENT_HOSTS.has(normalized)) {
      throw new Error('Invalid payment brand');
    }
    return normalized;
  }

  static async list(userId: string, status?: string, operator?: string): Promise<Invoice[]> {
    let q = db<InvoiceRow>('invoices').where({ userId: userId });

    if (status && operator) {
      const allowedOperators = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE'] as const;

      if (allowedOperators.includes(operator as any)) {
        const sanitizedStatus = status.replace(/['"\\;\-]/g, '');

        switch (operator) {
          case '=':
            q = q.andWhere('status', '=', sanitizedStatus);
            break;
          case '!=':
            q = q.andWhere('status', '!=', sanitizedStatus);
            break;
          case '>':
            q = q.andWhere('status', '>', sanitizedStatus);
            break;
          case '<':
            q = q.andWhere('status', '<', sanitizedStatus);
            break;
          case '>=':
            q = q.andWhere('status', '>=', sanitizedStatus);
            break;
          case '<=':
            q = q.andWhere('status', '<=', sanitizedStatus);
            break;
          case 'LIKE':
            q = q.andWhere('status', 'LIKE', `%${sanitizedStatus}%`);
            break;
          case 'NOT LIKE':
            q = q.andWhereNot('status', 'LIKE', `%${sanitizedStatus}%`);
            break;
        }
      }
    }

    const rows = await q.select();

    const invoices = rows.map(row => ({
      id: row.id,
      userId: row.userId,
      amount: row.amount,
      dueDate: row.dueDate,
      status: row.status
    } as Invoice));

    return invoices;
  }

  static async setPaymentCard(
    userId: string,
    invoiceId: string,
    paymentBrand: string,
    ccNumber: string,
    ccv: string,
    expirationDate: string
  ) {
    try {
      const validatedBrand = this.validatePaymentBrand(paymentBrand);
      const paymentUrl = `https://${validatedBrand}/payments`;

      const axiosConfig = {
        timeout: 5000,
        maxRedirects: 0,
        maxContentLength: 1024 * 1024,
        validateStatus: (status: number) => status >= 200 && status < 300,
        headers: {
          'User-Agent': 'HealthPortal/1.0',
          'Content-Type': 'application/json'
        }
      };

      const paymentResponse = await axios.post(paymentUrl, {
        ccNumber,
        ccv,
        expirationDate
      }, axiosConfig);

      if (paymentResponse.status !== 200) {
        throw new Error('Payment failed');
      }

      await db('invoices')
        .where({ id: invoiceId, userId })
        .update({ status: 'paid' });

    } catch (error) {
      console.error('Payment processing error:', error);

      if (error instanceof Error) {
        if (error.message.includes('Invalid payment brand')) {
          throw error;
        }
        throw new Error('Payment processing failed');
      }

      throw new Error('Payment processing failed');
    }
  }

  static async getInvoice(invoiceId: string, userId?: string): Promise<Invoice> {
  let query = db<InvoiceRow>('invoices').where({ id: invoiceId });
  
  if (userId) {
    query = query.andWhere({ userId: userId });
  }
  
  const invoice = await query.first();
  
  if (!invoice) {
    throw new Error('Invoice not found');
  }
  
  return invoice as Invoice;
}

  private static readonly INVOICES_BASE_DIR = path.resolve('/invoices');

private static validatePdfName(pdfName: string): string {
  if (!pdfName || typeof pdfName !== 'string') {
    throw new Error('PDF name is required');
  }

  const sanitized = pdfName.trim();

  if (sanitized.length === 0) {
    throw new Error('PDF name cannot be empty');
  }

  if (sanitized.length > 255) {
    throw new Error('PDF name too long');
  }

  if (!/^[a-zA-Z0-9._-]+\.pdf$/.test(sanitized)) {
    throw new Error('Invalid PDF name format');
  }

  if (sanitized.includes('..') || sanitized.includes('/') || sanitized.includes('\\')) {
    throw new Error('Path traversal characters not allowed');
  }

  return sanitized;
}

static async getReceipt(
  invoiceId: string,
  pdfName: string
) {
  const invoice = await db<InvoiceRow>('invoices').where({ id: invoiceId }).first();
  if (!invoice) {
    throw new Error('Invoice not found');
  }
  
  try {
    const validatedPdfName = this.validatePdfName(pdfName);
    const filePath = path.join(this.INVOICES_BASE_DIR, validatedPdfName);
    const resolvedPath = path.resolve(filePath);

    if (!resolvedPath.startsWith(this.INVOICES_BASE_DIR)) {
      throw new Error('Access denied: Path outside allowed directory');
    }

    const content = await fs.readFile(resolvedPath, 'utf-8');
    return content;
  } catch (error) {
    console.error('Error reading receipt file:', error);
    if (error instanceof Error && error.message.includes('Access denied')) {
      throw error;
    }
    throw new Error('Receipt not found');
  } 
}

  
}

export default InvoiceService;