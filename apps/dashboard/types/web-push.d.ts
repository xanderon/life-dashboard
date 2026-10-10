declare module 'web-push' {
  type PushSubscription = {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  type WebPushError = Error & { statusCode?: number; status?: number };

  const webpush: {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
    sendNotification(subscription: PushSubscription, payload: string): Promise<void>;
  };

  export type { WebPushError };
  export default webpush;
}
