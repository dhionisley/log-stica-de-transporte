import { validateEnvironment } from '../src/config/environment';

const validEnvironment = {
  DATABASE_URL: 'postgresql://transport:transport@localhost:5432/transport',
  REDIS_URL: 'redis://localhost:6379',
};

describe('validateEnvironment', () => {
  it('normalizes defaults for a valid environment', () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      OTEL_SERVICE_NAME: 'transport-api',
    });
  });

  it('coerces a valid port', () => {
    expect(validateEnvironment({ ...validEnvironment, PORT: '3100' }).PORT).toBe(3100);
  });

  it('reports invalid fields without including secret values', () => {
    const secret = 'postgresql://user:do-not-leak@localhost:5432/db';

    try {
      validateEnvironment({ DATABASE_URL: secret, REDIS_URL: 'https://invalid', PORT: '70000' });
    } catch (error) {
      const message = String(error);
      expect(message).toContain('PORT');
      expect(message).toContain('REDIS_URL');
      expect(message).not.toContain('do-not-leak');
    }
  });
});
