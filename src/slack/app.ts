import { App } from '@slack/bolt';
import { config } from '../config/env';

export function createSlackApp(): App {
  const app = new App({
    token: config.slackBotToken,
    appToken: config.slackAppToken,
    socketMode: true,
  });

  return app;
}
