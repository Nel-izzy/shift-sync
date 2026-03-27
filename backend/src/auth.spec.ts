import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './modules/auth/auth.service';
import * as bcrypt from 'bcrypt';

jest.mock('./database/db', () => ({ db: { select: jest.fn() } }));

const mockDb = require('./database/db').db;

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;

  const mockUser = {
    id: 'user-uuid-1',
    email: 'test@test.com',
    passwordHash: bcrypt.hashSync('password123', 10),
    firstName: 'Test',
    lastName: 'User',
    role: 'staff',
    skills: ['server'],
    desiredHoursPerWeek: 40,
    notifyInApp: true,
    notifyEmail: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('mock-token') } },
      ],
    }).compile();

    service = module.get(AuthService);
    jwtService = module.get(JwtService);
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should return token and user on valid credentials', async () => {
      const selectMock = { from: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([mockUser]) }) }) };
      mockDb.select.mockReturnValue(selectMock);

      const result = await service.login('test@test.com', 'password123');
      expect(result.token).toBe('mock-token');
      expect(result.user.email).toBe('test@test.com');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('should throw UnauthorizedException on wrong password', async () => {
      const selectMock = { from: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([mockUser]) }) }) };
      mockDb.select.mockReturnValue(selectMock);

      await expect(service.login('test@test.com', 'wrongpassword')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user not found', async () => {
      const selectMock = { from: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }) }) };
      mockDb.select.mockReturnValue(selectMock);

      await expect(service.login('nobody@test.com', 'password123')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      const selectMock = { from: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([inactiveUser]) }) }) };
      mockDb.select.mockReturnValue(selectMock);

      await expect(service.login('test@test.com', 'password123')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('password hashing', () => {
    it('should verify correct password against hash', async () => {
      const hash = bcrypt.hashSync('mypassword', 10);
      const valid = await bcrypt.compare('mypassword', hash);
      expect(valid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const hash = bcrypt.hashSync('mypassword', 10);
      const valid = await bcrypt.compare('wrongpassword', hash);
      expect(valid).toBe(false);
    });
  });
});
