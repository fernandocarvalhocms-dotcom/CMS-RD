
// utils/formatters.ts

/**
 * Função interna para gerar o hash UUID a partir de uma string bruta.
 */
const hashToUUID = (raw: string): string => {
  const getHash = (str: string, seed: number) => {
    let h = seed;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(31, h) + str.charCodeAt(i) | 0;
    }
    return h;
  };

  const h1 = getHash(raw, 0x12345678);
  const h2 = getHash(raw, 0x87654321);
  const h3 = getHash(raw, 0xABCDEF01);
  const h4 = getHash(raw, 0x10FEDCBA);

  const toHex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');

  const s1 = toHex(h1);
  const s2 = toHex(h2);
  const s3 = toHex(h3);
  const s4 = toHex(h4);

  return `${s1}-${s2.substring(0, 4)}-4${s2.substring(4, 7)}-8${s3.substring(0, 3)}-${s3.substring(3, 8)}${s4.substring(0, 7)}`;
};

export const decimalHoursToHHMM = (decimalHours: number): string => {
  if (isNaN(decimalHours) || decimalHours < 0) {
    return '00:00';
  }
  const totalMinutes = Math.round(decimalHours * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const hhmmToDecimalHours = (hhmm: string): number => {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return 0;
  const [hours, minutes] = hhmm.split(':').map(Number);
  return isNaN(hours) || isNaN(minutes) ? 0 : hours + (minutes / 60);
};

/**
 * Gera um ID estável baseado apenas nos dados do projeto e no usuário.
 * Removido o 'month' para evitar IDs diferentes para o mesmo projeto em meses distintos.
 */
export const generateStableProjectId = (name: string, cc: string, client: string, userId: string): string => {
  const raw = `${name}|${cc}|${client}|${userId}`.toLowerCase().replace(/\s+/g, '');
  return hashToUUID(raw);
};

/**
 * Auxiliar para reconstruir IDs legados (que continham o mês) para fins de recuperação de dados.
 */
export const generateLegacyProjectId = (name: string, cc: string, client: string, month: number, userId: string): string => {
  const raw = `${name}|${cc}|${client}|${month}|${userId}`.toLowerCase().replace(/\s+/g, '');
  return hashToUUID(raw);
};

export const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};
