jest.mock('./plugins/cognitoAuthenticationPlugin');

import { AuthenticationService, CognitoAuthenticationPlugin } from '.';

describe('AuthenticationService tests', () => {
  it('constructor should set the private _authenticationPlugin field to the authenticationPlugin parameter', () => {
    const authnService = new AuthenticationService(new CognitoAuthenticationPlugin());

    expect(authnService['_authenticationPlugin']).toBeInstanceOf(CognitoAuthenticationPlugin); // nosemgrep
  });

  it('isUserLoggedIn should be true when a valid token is passed in', () => {
    const service = new AuthenticationService(new CognitoAuthenticationPlugin());

    const result = service.isUserLoggedIn('valid token');

    expect(result).toBe(true);
  });

  it('isUserLoggedIn should be false when an invalid token is passed in', () => {
    const service = new AuthenticationService(new CognitoAuthenticationPlugin());

    const result = service.isUserLoggedIn('');

    expect(result).toBe(false);
  });

  it('validateToken should return an array of records for the given token', () => {
    const service = new AuthenticationService(new CognitoAuthenticationPlugin());

    const result = service.validateToken('valid token');

    expect(result).toMatchObject<Record<string, string | string[] | number | number[]>[]>([
      { token: 'valid token' }
    ]);
  });

  it('revokeToken should successfully call the plugins revokeToken() method', () => {
    const pi = new CognitoAuthenticationPlugin();
    const service = new AuthenticationService(pi);

    const revokeSpy = jest.spyOn(pi, 'revokeToken');
    service.revokeToken('valid token');

    expect(revokeSpy).lastCalledWith('valid token');
  });

  it('getUserIdFromToken should return the tokens user id', () => {
    const service = new AuthenticationService(new CognitoAuthenticationPlugin());

    const result = service.getUserIdFromToken('valid token');

    expect(result).toBe('valid token');
  });

  it('getUserRolesFromToken should return the tokens roles', () => {
    const service = new AuthenticationService(new CognitoAuthenticationPlugin());

    const result = service.getUserRolesFromToken('valid token');

    expect(result).toMatchObject('valid token'.split(''));
  });

  it('handleAuthorizationCode should return a Promise that contains the id, access, and refresh tokens', async () => {
    const service = new AuthenticationService(new CognitoAuthenticationPlugin());

    const result = await service.handleAuthorizationCode('access code');

    expect(result).toMatchObject(['id token', 'access token', 'refresh token']);
  });
});