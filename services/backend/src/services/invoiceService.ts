// src/services/invoiceService.ts
import db from '../db';
import { Invoice } from '../types/invoice';
import axios from 'axios';
import { promises as fs } from 'fs';

interface InvoiceRow {
  id: string;
  userId: string;
  amount: number;
  dueDate: Date;
  status: string;
}

class InvoiceService {
  static async list(userId: string, status?: string, operator?: string): Promise<Invoice[]> {
    // Define los operadores permitidos para evitar inyecciones SQL
    const allowedOperators = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE'] as const;

    // Crea la consulta base filtrando por userId
    let q = db<InvoiceRow>('invoices').where({ userId });

    // Si se proporciona un estado aplica el filtro correspondiente
    if (status) {
      // Valida el operador recibido o usa '=' por defecto
      const op = allowedOperators.includes(operator as any) ? operator : '=';

      // Sanitiza el valor del estado para evitar inyecciones
      const sanitizedStatus = status.replace(/['"\\;\-]/g, '');

      // Aplica el filtro segun el operador
      if (op === 'LIKE') {
        q = q.andWhere('status', 'LIKE', `%${sanitizedStatus}%`);
      } else if (op === 'NOT LIKE') {
        q = q.andWhereNot('status', 'LIKE', `%${sanitizedStatus}%`);
      } else {
        q = q.andWhere('status', op, sanitizedStatus);
      }
    }

    // Ejecuta la consulta y obtiene las filas resultantes
    const rows = await q.select();

    // Mapea las filas a objetos Invoice y los retorna
    return rows.map(row => ({
      id: row.id,
      userId: row.userId,
      amount: row.amount,
      dueDate: row.dueDate,
      status: row.status
    } as Invoice));
  }

  static async setPaymentCard(
    userId: string,
    invoiceId: string,
    paymentBrand: string,
    ccNumber: string,
    ccv: string,
    expirationDate: string
  ) {
    // use axios to call http://paymentBrand/payments as a POST request
    // with the body containing ccNumber, ccv, expirationDate
    // and handle the response accordingly
    const paymentResponse = await axios.post(`http://${paymentBrand}/payments`, {
      ccNumber,
      ccv,
      expirationDate
    });
    if (paymentResponse.status !== 200) {
      throw new Error('Payment failed');
    }

    // Update the invoice status in the database
    await db('invoices')
      .where({ id: invoiceId, userId })
      .update({ status: 'paid' });
  };
  static async getInvoice(invoiceId: string): Promise<Invoice> {
    const invoice = await db<InvoiceRow>('invoices').where({ id: invoiceId }).first();
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    return invoice as Invoice;
  }


  static async getReceipt(
    invoiceId: string,
    pdfName: string
  ) {
    // check if the invoice exists
    const invoice = await db<InvoiceRow>('invoices').where({ id: invoiceId }).first();
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    try {
      const filePath = `/invoices/${pdfName}`;
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      // send the error to the standard output
      console.error('Error reading receipt file:', error);
      throw new Error('Receipt not found');

    }

  };

};

export default InvoiceService;
