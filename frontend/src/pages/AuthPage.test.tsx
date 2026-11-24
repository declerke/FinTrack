import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthPage } from './AuthPage';

describe('AuthPage', () => {
  it('uses a username pattern accepted by modern HTML regular expression syntax', () => {
    render(
      <MemoryRouter>
        <AuthPage mode="login" onAuthenticated={() => undefined} />
      </MemoryRouter>,
    );

    const username = screen.getByRole('textbox', { name: 'Username' });
    const pattern = username.getAttribute('pattern');

    expect(pattern).not.toBeNull();
    expect(() => new RegExp(pattern ?? '', 'v')).not.toThrow();
    const usernamePattern = new RegExp(`^(?:${pattern ?? ''})$`, 'v');
    expect(usernamePattern.test('luna-demo-analyst')).toBe(true);
    expect(usernamePattern.test('invalid name')).toBe(false);
  });
});
