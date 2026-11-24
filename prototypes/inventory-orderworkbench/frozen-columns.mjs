let observer;

export function freezePerformanceColumns(panel) {
  observer?.disconnect();
  const tables = [...panel.querySelectorAll('.wb-performance-table')];
  const update = () => {
    for (const table of tables) {
      let left = 0;
      const headers = table.tHead.rows[0].cells;
      for (const header of headers) {
        if (!header.hasAttribute('data-frozen-column')) break;
        table.style.setProperty(`--frozen-left-${header.cellIndex}`, `${left}px`);
        left += header.getBoundingClientRect().width;
      }
    }
  };
  update();
  observer = new ResizeObserver(update);
  for (const table of tables) {
    observer.observe(table);
    for (const header of table.tHead.rows[0].cells) {
      if (header.hasAttribute('data-frozen-column')) observer.observe(header);
    }
  }
}
