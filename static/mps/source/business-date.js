const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' });

export const mpsBusinessDate = () => formatter.format(new Date());
