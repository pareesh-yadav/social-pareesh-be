export interface JwtPayload {
  userId: string;
  email: string;
}

export interface AuthRequest {
  email: string;
  password: string;
  username?: string;
}

export interface SendMessageRequest {
  content: string;
  recipientId: string;
  parentMessageId?: string;
}

export interface UpdateProfileRequest {
  username?: string;
  bio?: string;
  profilePicUrl?: string;
}

export interface FriendRequestPayload {
  receiverId: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
  message?: string;
}

export interface SuccessResponse<T> {
  success: true;
  data?: T;
  message?: string;
}