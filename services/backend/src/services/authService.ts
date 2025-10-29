// src/services/authService.ts
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import db from '../db';
import { User, UserRow } from '../types/user';
import jwtUtils from '../utils/jwt';
import ejs from 'ejs';
import bcrypt from 'bcrypt';

const RESET_TTL = 1000 * 60 * 60;           // 1h
const INVITE_TTL = 1000 * 60 * 60 * 24 * 7; // 7d

class AuthService {
  private static readonly SALT_ROUNDS = 12;

  private static validateUserData(user: User): void {
    if (!user.first_name || typeof user.first_name !== 'string') {
      throw new Error('Invalid first name');
    }
    if (!user.last_name || typeof user.last_name !== 'string') {
      throw new Error('Invalid last name');
    }
    if (!user.email || typeof user.email !== 'string') {
      throw new Error('Invalid email');
    }

    if (user.first_name.length > 100 || user.last_name.length > 100) {
      throw new Error('Name too long');
    }

    if (!/^[a-zA-Z\s.-]+$/.test(user.first_name) || !/^[a-zA-Z\s.-]+$/.test(user.last_name)) {
      throw new Error('Names contain invalid characters');
    }
  }

  private static validateActivationLink(token: string, username: string): string {
    if (!token || !username) {
      throw new Error('Invalid token or username');
    }

    // token generado con randomBytes(6).toString('hex') => 12 hex chars
    if (!/^[a-f0-9]{12}$/.test(token)) {
      throw new Error('Invalid token format');
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
      throw new Error('Invalid username format');
    }

    const baseUrl = process.env.FRONTEND_URL;
    if (!baseUrl || !baseUrl.startsWith('https://')) {
      throw new Error('Invalid frontend URL configuration');
    }

    return `${baseUrl}/activate-user?token=${token}&username=${encodeURIComponent(username)}`;
  }

  static async createUser(user: User) {
    this.validateUserData(user);

    const existing = await db<UserRow>('users')
      .where({ username: user.username })
      .orWhere({ email: user.email })
      .first();
    if (existing) throw new Error('User already exists with that username or email');

    const hashedPassword = await bcrypt.hash(user.password, this.SALT_ROUNDS);
    const invite_token = crypto.randomBytes(6).toString('hex');
    const invite_token_expires = new Date(Date.now() + INVITE_TTL);

    await db<UserRow>('users').insert({
      username: user.username,
      password: hashedPassword,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      invite_token,
      invite_token_expires,
      activated: false
    });

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const activationLink = this.validateActivationLink(invite_token, user.username);

    const template = `
      <html>
        <body>
          <h1>Hello <%= firstName %> <%= lastName %></h1>
          <p>Click <a href="<%= link %>">here</a> to activate your account.</p>
        </body>
      </html>
    `;

    const htmlBody = ejs.render(template, {
      firstName: user.first_name,
      lastName: user.last_name,
      link: activationLink
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || "info@example.com",
      to: user.email,
      subject: 'Activate your account',
      html: htmlBody
    });
  }

  static async authenticate(username: string, password: string) {
    const user = await db<UserRow>('users')
      .where({ username })
      .andWhere('activated', true)
      .first();

    if (!user) throw new Error('Invalid email or not activated');

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) throw new Error('Invalid password');

    // eliminar password antes de devolver
    const { password: _, ...userWithoutPassword } = user as any;
    return userWithoutPassword;
  }

  static async sendResetPasswordEmail(email: string) {
    const user = await db<UserRow>('users')
      .where({ email })
      .andWhere('activated', true)
      .first();
    if (!user) throw new Error('No user with that email or not activated');

    const token = crypto.randomBytes(6).toString('hex');
    const expires = new Date(Date.now() + RESET_TTL);

    await db('users')
      .where({ id: user.id })
      .update({
        reset_password_token: token,
        reset_password_expires: expires
      });

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const link = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    await transporter.sendMail({
      from: process.env.SMTP_FROM || "info@example.com",
      to: user.email,
      subject: 'Your password reset link',
      html: `Click <a href="${link}">here</a> to reset your password.`
    });
  }

  static async resetPassword(token: string, newPassword: string) {
    const row = await db<UserRow>('users')
      .where('reset_password_token', token)
      .andWhere('reset_password_expires', '>', new Date())
      .first();
    if (!row) throw new Error('Invalid or expired reset token');

    const hashedPassword = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

    await db('users')
      .where({ id: row.id })
      .update({
        password: hashedPassword,
        reset_password_token: null,
        reset_password_expires: null
      });
  }

  static async setPassword(token: string, newPassword: string) {
    const row = await db<UserRow>('users')
      .where('invite_token', token)
      .andWhere('invite_token_expires', '>', new Date())
      .first();
    if (!row) throw new Error('Invalid or expired invite token');

    const hashedPassword = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

    await db('users')
      .update({
        password: hashedPassword,
        invite_token: null,
        invite_token_expires: null,
        activated: true
      })
      .where({ id: row.id });
  }

  static async updateUser(user: User) {
    const existing = await db<UserRow>('users')
      .where({ id: user.id })
      .first();
    if (!existing) throw new Error('User not found');

    const updateData: Partial<UserRow> = {
      username: user.username,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name
    } as any;

    if (user.password) {
      updateData.password = await bcrypt.hash(user.password, this.SALT_ROUNDS);
    }

    await db<UserRow>('users')
      .where({ id: user.id })
      .update(updateData);

    const combined = { ...existing, ...updateData } as any;
    const { password: _, ...userWithoutPassword } = combined;
    return userWithoutPassword;
  }

  static generateJwt(userId: string): string {
    return jwtUtils.generateToken(userId);
  }
}

export default AuthService;
