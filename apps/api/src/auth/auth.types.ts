export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  entraObjectId: string;
  permissions: string[];
}
