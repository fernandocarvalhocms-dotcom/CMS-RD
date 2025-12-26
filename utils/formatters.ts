
// utils/formatters.ts
export const decimalHoursToHHMM = (decimalHours: number): string => {
  if (isNaN(decimalHours) || decimalHours < 0) {
    return '00:00';
  }

  // Use total minutes to avoid floating point issues with Math.round
  const totalMinutes = Math.round(decimalHours * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  const paddedHours = String(hours).padStart(2, '0');
  const paddedMinutes = String(minutes).padStart(2, '0');

  return `${paddedHours}:${paddedMinutes}`;
};

export const hhmmToDecimalHours = (hhmm: string): number => {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) {
    return 0;
  }
  const [hours, minutes] = hhmm.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) {
      return 0;
  }
  return hours + (minutes / 60);
};

/**
 * Gera um UUID v4 determinístico baseado nos metadados do projeto.
 * Essencial para o Supabase (PostgreSQL) que exige o tipo UUID,
 * mantendo a capacidade de identificar o mesmo projeto em sincronizações futuras (UPSERT).
 */
export const generateStableProjectId = (name: string, cc: string, client: string, month: number, userId: string): string => {
  const raw = `${name}|${cc}|${client}|${month}|${userId}`.toLowerCase().replace(/\s+/g, '');
  
  // Função de hash simples para gerar 4 inteiros de 32 bits
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

  // Formato UUID: 8-4-4-4-12
  // M (versão) = 4, N (variante) = 8
  return `${s1}-${s2.substring(0, 4)}-4${s2.substring(4, 7)}-8${s3.substring(0, 3)}-${s3.substring(3, 8)}${s4.substring(0, 7)}`;
};

export const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};
