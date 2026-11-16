import { User, UserDomainError } from '../src/modules/iam/domain/user.entity';
import {
  PermissionProfile,
  PermissionProfileDomainError,
} from '../src/modules/iam/domain/permission-profile.entity';
import { UserProfileAssignment } from '../src/modules/iam/domain/user-profile-assignment.entity';

describe('IAM Domain Aggregates (Unit)', () => {
  const tenantId = '00000000-0000-0000-0000-000000000001';

  describe('User Aggregate', () => {
    it('creates a user with normalized email and default active status', () => {
      const user = User.create({
        tenantId,
        email: '  User.Test@Empresa.com  ',
        phoneNormalized: '+5511999998888',
        mfaRequired: true,
      });

      expect(user.id).toBeDefined();
      expect(user.tenantId).toBe(tenantId);
      expect(user.email).toBe('User.Test@Empresa.com');
      expect(user.emailNormalized).toBe('user.test@empresa.com');
      expect(user.status).toBe('ACTIVE');
      expect(user.mfaRequired).toBe(true);
      expect(user.version).toBe(1);
    });

    it('rejects invalid email without @', () => {
      expect(() =>
        User.create({
          tenantId,
          email: 'invalid-email',
        }),
      ).toThrow(UserDomainError);
    });

    it('rejects missing tenant ID', () => {
      expect(() =>
        User.create({
          tenantId: '',
          email: 'admin@empresa.com',
        }),
      ).toThrow(UserDomainError);
    });

    it('manages status lifecycle with version increment', () => {
      const user = User.create({
        tenantId,
        email: 'operator@empresa.com',
      });

      expect(user.status).toBe('ACTIVE');
      expect(user.version).toBe(1);

      user.deactivate();
      expect(user.status).toBe('INACTIVE');
      expect(user.version).toBe(2);

      user.suspend();
      expect(user.status).toBe('SUSPENDED');
      expect(user.version).toBe(3);

      user.activate();
      expect(user.status).toBe('ACTIVE');
      expect(user.version).toBe(4);
    });

    it('records login and tracks MFA requirement changes', () => {
      const user = User.create({
        tenantId,
        email: 'driver@empresa.com',
      });

      expect(user.lastLoginAt).toBeUndefined();
      const loginDate = new Date();
      user.recordLogin(loginDate);
      expect(user.lastLoginAt).toEqual(loginDate);
      expect(user.version).toBe(2);

      user.setMfaRequired(true);
      expect(user.mfaRequired).toBe(true);
      expect(user.version).toBe(3);
    });
  });

  describe('PermissionProfile Aggregate', () => {
    it('creates a profile with permissions and active status', () => {
      const profile = PermissionProfile.create({
        tenantId,
        name: 'Supervisor Operacional',
        profileType: 'SUPERVISOR',
        permissions: ['fleet:vehicle:read', 'tenant:settings:manage'],
      });

      expect(profile.id).toBeDefined();
      expect(profile.tenantId).toBe(tenantId);
      expect(profile.name).toBe('Supervisor Operacional');
      expect(profile.profileType).toBe('SUPERVISOR');
      expect(profile.status).toBe('ACTIVE');
      expect(profile.hasPermission('fleet:vehicle:read')).toBe(true);
      expect(profile.hasPermission('audit:read')).toBe(false);
    });

    it('rejects profile with empty name', () => {
      expect(() =>
        PermissionProfile.create({
          tenantId,
          name: '   ',
        }),
      ).toThrow(PermissionProfileDomainError);
    });

    it('grants and revokes permissions dynamically', () => {
      const profile = PermissionProfile.create({
        tenantId,
        name: 'Operador',
      });

      expect(profile.hasPermission('tenant:read')).toBe(false);

      profile.grantPermission('tenant:read');
      expect(profile.hasPermission('tenant:read')).toBe(true);
      expect(profile.version).toBe(2);

      profile.revokePermission('tenant:read');
      expect(profile.hasPermission('tenant:read')).toBe(false);
      expect(profile.version).toBe(3);
    });

    it('denies permissions when profile is inactive', () => {
      const profile = PermissionProfile.create({
        tenantId,
        name: 'Auditor Externo',
        permissions: ['audit:read'],
      });

      expect(profile.hasPermission('audit:read')).toBe(true);

      profile.deactivate();
      expect(profile.status).toBe('INACTIVE');
      expect(profile.hasPermission('audit:read')).toBe(false);

      profile.activate();
      expect(profile.status).toBe('ACTIVE');
      expect(profile.hasPermission('audit:read')).toBe(true);
    });
  });

  describe('UserProfileAssignment Aggregate', () => {
    it('correctly calculates active state based on dates', () => {
      const past = new Date(Date.now() - 100000);
      const future = new Date(Date.now() + 100000);

      const assignment = UserProfileAssignment.create({
        tenantId,
        userId: '00000000-0000-0000-0000-000000000002',
        profileId: '00000000-0000-0000-0000-000000000003',
        effectiveFrom: past,
        effectiveTo: future,
      });

      expect(assignment.isActive()).toBe(true);

      assignment.revoke(new Date(Date.now() - 1000));
      expect(assignment.isActive()).toBe(false);
    });
  });
});

