import { getRequiredConfigValue } from '#server/config';
import type { EmailGateway } from '#server/ports';
import { MailService } from '@sendgrid/mail';

const createMailService = (apiKey: string): MailService => {
  const mailService = new MailService();

  mailService.setApiKey(apiKey);

  return mailService;
};

export const createSendGridEmailGateway = ({
  apiKey,
  fromEmail,
}: {
  readonly apiKey?: string;
  readonly fromEmail: string;
}): EmailGateway => ({
  sendSignInCode: async ({ email, html, subject }): Promise<void> => {
    const mailService = createMailService(
      getRequiredConfigValue({
        label: 'SENDGRID_API_KEY',
        ...(apiKey === undefined ? {} : { value: apiKey }),
      })
    );

    await mailService.send({
      from: {
        email: fromEmail,
        name: 'exe',
      },
      html,
      subject,
      to: [email],
    });
  },
});
