/**
 * Auth routes: register and login (bcrypt + pg users table).
 */
import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createUser, getUserByEmail } from '../db.js';

const SALT_ROUNDS = 10;
const JWT_EXPIRY = '7d';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function validateEmail(email: unknown): email is string {
  return typeof email === 'string' && EMAIL_REGEX.test(email.trim());
}

function validatePassword(password: unknown): password is string {
  return typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH;
}

export function register(req: Request, res: Response): void {
  const { email: rawEmail, password: rawPassword } = req.body ?? {};
  const email = typeof rawEmail === 'string' ? rawEmail.trim() : '';
  if (!validateEmail(email)) {
    res.status(400).json({ error: 'Invalid or missing email' });
    return;
  }
  if (!validatePassword(rawPassword)) {
    res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    return;
  }

  bcrypt.hash(rawPassword, SALT_ROUNDS, (err, passwordHash) => {
    if (err) {
      res.status(500).json({ error: 'Failed to hash password' });
      return;
    }
    createUser(email, passwordHash)
      .then((user) => {
        res.status(201).json({ id: user.id, email: user.email });
      })
      .catch((e: { code?: string }) => {
        if (e.code === '23505') {
          res.status(400).json({ error: 'Email already registered' });
          return;
        }
        res.status(500).json({ error: 'Registration failed' });
      });
  });
}

export function login(req: Request, res: Response): void {
  console.log('req.body', req.body);
  const { email: rawEmail, password: rawPassword } = req.body ?? {};
  console.log('rawEmail', rawEmail);
  console.log('rawPassword', rawPassword);
  if (!validateEmail(rawEmail)) {
    res.status(400).json({ error: 'Invalid or missing email' });
    return;
  }
  if (typeof rawPassword !== 'string' || rawPassword.length === 0) {
    res.status(400).json({ error: 'Password required' });
    return;
  }

  const email = typeof rawEmail === 'string' ? rawEmail.trim() : '';

  getUserByEmail(email)
    .then((user) => {
      if (!user) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }
      bcrypt.compare(rawPassword, user.password_hash, (err, ok) => {
        if (err || !ok) {
          res.status(401).json({ error: 'Invalid email or password' });
          return;
        }
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          res.status(500).json({ error: 'Server misconfiguration: JWT_SECRET not set' });
          return;
        }
        const token = jwt.sign({ sub: user.id }, secret, { expiresIn: JWT_EXPIRY });
        res.status(200).json({ token });
      });
    })
    .catch(() => {
      res.status(500).json({ error: 'Login failed' });
    });
}
