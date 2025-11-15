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
