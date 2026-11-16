// Heures de Paris auxquelles la mise à jour des offres doit être lancée.
export const PARIS_HOURS = [7, 17];

const parisHour = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris',
  hour: 'numeric',
  hourCycle: 'h23',
});

/**
 * Les Cron Triggers de Cloudflare sont en UTC : le déclencheur couvre les heures UTC
 * d'été et d'hiver, et seule celle qui tombe à l'heure de Paris voulue lance le workflow.
 */
export function shouldDispatch(date: Date): boolean {
  return PARIS_HOURS.includes(Number(parisHour.format(date)));
}
