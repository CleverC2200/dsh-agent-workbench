export async function saveAchievementFile(file, environment = window) {
  if (typeof environment.showSaveFilePicker === 'function') {
    try {
      const handle = await environment.showSaveFilePicker({
        suggestedName: file.filename,
        types: [{ description: 'Excel 工作簿', accept: { [file.mime]: ['.xlsx'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(new Blob([file.content], { type: file.mime }));
      await writable.close();
      return 'saved';
    } catch (error) {
      if (error.name === 'AbortError') return 'cancelled';
      if (error.name !== 'SecurityError') throw error;
    }
  }
  const url = environment.URL.createObjectURL(new Blob([file.content], { type: file.mime }));
  const link = environment.document.createElement('a');
  try {
    link.href = url;
    link.download = file.filename;
    environment.document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    environment.setTimeout(() => environment.URL.revokeObjectURL(url), 60000);
  }
  return 'download';
}
