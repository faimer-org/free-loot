// Worker Cloudflare : lance le workflow « Mise à jour des offres » à heure fixe,
// les exécutions planifiées de GitHub partant souvent avec plusieurs heures de retard.
import { shouldDispatch } from './schedule.ts';

const DISPATCH_URL =
  'https://api.github.com/repos/faimer-org/free-loot/actions/workflows/update.yml/dispatches';

interface Env {
  // Jeton fine-grained limité à free-loot, permission Actions en écriture (secret Cloudflare).
  GITHUB_TOKEN: string;
}

interface ScheduledController {
  scheduledTime: number;
}

export default {
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const scheduled = new Date(controller.scheduledTime);
    if (!shouldDispatch(scheduled)) {
      console.log(`${scheduled.toISOString()} : hors heure de Paris prévue, rien à faire`);
      return;
    }

    const response = await fetch(DISPATCH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'free-loot-cron',
      },
      body: JSON.stringify({ ref: 'main' }),
    });

    if (!response.ok) {
      // Une exception marque l'exécution en échec dans le tableau de bord Cloudflare.
      throw new Error(`Déclenchement refusé par GitHub : ${response.status} ${await response.text()}`);
    }
    console.log(`${scheduled.toISOString()} : workflow déclenché (${response.status})`);
  },
};
